import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simple PDF header (minimal valid PDF)
function generateSimplePDF(content: string): Uint8Array {
  const pdfContent = `%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj
2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj
3 0 obj
<<
/Type /Page
/Parent 2 0 R
/Resources <<
/Font <<
/F1 <<
/Type /Font
/Subtype /Type1
/BaseFont /Helvetica
>>
>>
>>
/MediaBox [0 0 612 792]
/Contents 4 0 R
>>
endobj
4 0 obj
<<
/Length ${content.length + 50}
>>
stream
BT
/F1 12 Tf
50 700 Td
(${content}) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000315 00000 n
trailer
<<
/Size 5
/Root 1 0 R
>>
startxref
${400 + content.length}
%%EOF`;

  return new TextEncoder().encode(pdfContent);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { mergeJobId } = await req.json();
    console.log('Starting PDF generation for job:', mergeJobId);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Update job status to processing
    await supabase
      .from('merge_jobs')
      .update({ 
        status: 'processing',
        processing_started_at: new Date().toISOString()
      })
      .eq('id', mergeJobId);

    // Fetch merge job details
    const { data: job, error: jobError } = await supabase
      .from('merge_jobs')
      .select(`
        *,
        data_source:data_sources(*),
        template:templates(*),
        field_mapping:field_mappings(*)
      `)
      .eq('id', mergeJobId)
      .single();

    if (jobError || !job) {
      throw new Error('Merge job not found');
    }

    console.log('Job details loaded, processing', job.total_pages, 'pages');

    // Get field mappings
    const { data: mappings } = await supabase
      .from('field_mappings')
      .select('*')
      .eq('data_source_id', job.data_source_id)
      .eq('template_id', job.template_id)
      .single();

    if (!mappings) {
      throw new Error('Field mappings not found');
    }

    // Get data from data source
    const dataSource = job.data_source;
    const parsedFields = dataSource.parsed_fields;
    const sampleRows = parsedFields?.preview || [];
    
    // Generate PDF content
    let pdfContent = `Generated Document\\n\\n`;
    pdfContent += `Template: ${job.template.name}\\n`;
    pdfContent += `Pages: ${job.total_pages}\\n\\n`;
    
    const fieldMappings = mappings.mappings as Record<string, string>;
    
    // Add data from first few rows
    sampleRows.slice(0, 3).forEach((row: any, idx: number) => {
      pdfContent += `Record ${idx + 1}:\\n`;
      Object.entries(fieldMappings).forEach(([templateField, dataColumn]) => {
        const value = row[dataColumn] || 'N/A';
        pdfContent += `${templateField}: ${value}\\n`;
      });
      pdfContent += `\\n`;
    });

    // Generate simple PDF
    const pdfBuffer = generateSimplePDF(pdfContent);
    
    console.log('PDF generated, size:', pdfBuffer.length, 'bytes');

    // Simulate processing progress
    const processedPages = Math.min(sampleRows.length, job.total_pages);
    
    await supabase
      .from('merge_jobs')
      .update({ processed_pages: processedPages })
      .eq('id', mergeJobId);

    // Upload PDF to storage
    const fileName = `${mergeJobId}_${Date.now()}.pdf`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('generated-pdfs')
      .upload(fileName, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: false
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      throw new Error(`Failed to upload PDF: ${uploadError.message}`);
    }

    console.log('PDF uploaded:', uploadData.path);

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('generated-pdfs')
      .getPublicUrl(uploadData.path);

    // Create generated output record
    await supabase.from('generated_outputs').insert({
      merge_job_id: mergeJobId,
      workspace_id: job.workspace_id,
      file_url: publicUrl,
      file_size_bytes: pdfBuffer.length,
      page_count: processedPages
    });

    // Update job status to complete
    await supabase
      .from('merge_jobs')
      .update({
        status: 'complete',
        output_url: publicUrl,
        processed_pages: processedPages,
        processing_completed_at: new Date().toISOString()
      })
      .eq('id', mergeJobId);

    console.log('Job completed successfully');

    return new Response(
      JSON.stringify({ 
        success: true,
        outputUrl: publicUrl,
        pagesGenerated: processedPages
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('PDF generation error:', error);

    // Try to update job status to error
    try {
      const { mergeJobId } = await req.json();
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      await supabase
        .from('merge_jobs')
        .update({
          status: 'error',
          error_message: error.message,
          processing_completed_at: new Date().toISOString()
        })
        .eq('id', mergeJobId);
    } catch (updateError) {
      console.error('Failed to update job status:', updateError);
    }

    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
