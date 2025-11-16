import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Convert mm to PDF points (1 inch = 72 points, 1 inch = 25.4 mm)
function mmToPoints(mm: number): number {
  return (mm / 25.4) * 72;
}

// Calculate font size to fit text within width
function calculateFontSize(
  text: string,
  font: PDFFont,
  maxWidth: number,
  defaultSize: number = 10
): number {
  let fontSize = defaultSize;
  const textWidth = font.widthOfTextAtSize(text, fontSize);
  
  if (textWidth > maxWidth) {
    fontSize = (maxWidth / textWidth) * fontSize;
  }
  
  return Math.max(fontSize, 6); // Minimum 6pt
}

// Wrap text to fit within maxWidth
function wrapText(
  text: string,
  font: PDFFont,
  maxWidth: number,
  fontSize: number
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  
  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const width = font.widthOfTextAtSize(testLine, fontSize);
    
    if (width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  
  if (currentLine) lines.push(currentLine);
  return lines;
}

// Get page dimensions based on template type
function getPageDimensions(template: any): [number, number] {
  // Check if it's an Avery label (always use US Letter)
  const averyLabel = template.design_config?.averyCode || template.name?.includes('Avery');
  
  if (averyLabel || template.template_type === 'built_in_library') {
    return [612, 792]; // US Letter: 8.5" x 11"
  }
  
  // Standard A4
  if (template.width_mm && template.height_mm) {
    return [mmToPoints(template.width_mm), mmToPoints(template.height_mm)];
  }
  
  // Default to US Letter
  return [612, 792];
}

// Calculate label grid layout for Avery labels
interface LabelLayout {
  labelWidth: number;
  labelHeight: number;
  columns: number;
  rows: number;
  marginTop: number;
  marginLeft: number;
  horizontalGap: number;
  verticalGap: number;
  labelsPerPage: number;
}

function calculateLabelLayout(template: any): LabelLayout {
  const design = template.design_config;
  
  // Use template dimensions
  const labelWidth = mmToPoints(template.width_mm || 66.68);
  const labelHeight = mmToPoints(template.height_mm || 25.4);
  
  // Calculate layout based on page size
  const pageWidth = 612; // US Letter width
  const pageHeight = 792; // US Letter height
  
  // Default margins for Avery labels
  const marginTop = mmToPoints(12.7); // ~0.5"
  const marginLeft = mmToPoints(4.76); // ~0.1875"
  const horizontalGap = mmToPoints(3.18); // ~0.125"
  const verticalGap = 0;
  
  // Calculate how many fit
  const columns = Math.floor((pageWidth - marginLeft) / (labelWidth + horizontalGap));
  const rows = Math.floor((pageHeight - marginTop) / (labelHeight + verticalGap));
  
  return {
    labelWidth,
    labelHeight,
    columns: Math.max(columns, 1),
    rows: Math.max(rows, 1),
    marginTop,
    marginLeft,
    horizontalGap,
    verticalGap,
    labelsPerPage: Math.max(columns * rows, 1)
  };
}

// Calculate position for a specific label index
function calculateLabelPosition(
  labelIndex: number,
  layout: LabelLayout,
  pageHeight: number
): { x: number; y: number } {
  const row = Math.floor(labelIndex / layout.columns);
  const col = labelIndex % layout.columns;
  
  const x = layout.marginLeft + (col * (layout.labelWidth + layout.horizontalGap));
  const y = pageHeight - layout.marginTop - (row * (layout.labelHeight + layout.verticalGap)) - layout.labelHeight;
  
  return { x, y };
}

// Render a single label with mapped data
function renderLabel(
  page: PDFPage,
  dataRow: Record<string, any>,
  mappings: Record<string, string>,
  position: { x: number; y: number },
  layout: LabelLayout,
  font: PDFFont
) {
  const padding = 6; // 6pt padding inside label
  const maxWidth = layout.labelWidth - (padding * 2);
  const lineHeight = 12; // Space between lines
  
  let yOffset = position.y + layout.labelHeight - padding - 10; // Start from top with padding
  
  try {
    // Render each mapped field
    for (const [templateField, dataColumn] of Object.entries(mappings)) {
      const value = String(dataRow[dataColumn] || '');
      if (!value) continue;
      
      const text = `${templateField}: ${value}`;
      const fontSize = calculateFontSize(text, font, maxWidth, 9);
      const lines = wrapText(text, font, maxWidth, fontSize);
      
      // Render each line
      for (const line of lines) {
        if (yOffset < position.y + padding) break; // Don't overflow label bottom
        
        page.drawText(line, {
          x: position.x + padding,
          y: yOffset,
          size: fontSize,
          font: font,
          color: rgb(0, 0, 0),
        });
        
        yOffset -= lineHeight;
      }
      
      yOffset -= 3; // Extra space between fields
    }
  } catch (error) {
    console.error('Error rendering label:', error);
    // Draw error indicator
    page.drawText('ERROR', {
      x: position.x + padding,
      y: position.y + layout.labelHeight / 2,
      size: 8,
      font: font,
      color: rgb(1, 0, 0),
    });
  }
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

    // Fetch merge job details with relations
    const { data: job, error: jobError } = await supabase
      .from('merge_jobs')
      .select(`
        *,
        data_source:data_sources(*),
        template:templates(*)
      `)
      .eq('id', mergeJobId)
      .single();

    if (jobError || !job) {
      throw new Error('Merge job not found');
    }

    console.log('Job details loaded:', {
      template: job.template.name,
      totalPages: job.total_pages,
      templateType: job.template.template_type
    });

    // Get field mappings
    const { data: mappings, error: mappingsError } = await supabase
      .from('field_mappings')
      .select('mappings')
      .eq('data_source_id', job.data_source_id)
      .eq('template_id', job.template_id)
      .single();

    if (mappingsError || !mappings) {
      throw new Error('Field mappings not found');
    }

    const fieldMappings = mappings.mappings as Record<string, string>;
    console.log('Field mappings loaded:', Object.keys(fieldMappings).length, 'fields');

    // Get data rows from data source
    const dataSource = job.data_source;
    const parsedFields = dataSource.parsed_fields as any;
    const dataRows = parsedFields?.preview || [];
    
    if (dataRows.length === 0) {
      throw new Error('No data rows found in data source');
    }

    console.log('Processing', dataRows.length, 'records');

    // Create PDF document
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Get page dimensions and layout
    const [pageWidth, pageHeight] = getPageDimensions(job.template);
    const layout = calculateLabelLayout(job.template);
    
    console.log('Layout calculated:', {
      pageSize: `${pageWidth}x${pageHeight}`,
      labelSize: `${layout.labelWidth}x${layout.labelHeight}`,
      grid: `${layout.columns}x${layout.rows}`,
      labelsPerPage: layout.labelsPerPage
    });

    // Generate labels
    let currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
    let labelsOnCurrentPage = 0;
    let processedRecords = 0;
    const updateInterval = Math.max(Math.floor(dataRows.length / 10), 10); // Update at least 10 times

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      
      // Create new page if needed
      if (labelsOnCurrentPage >= layout.labelsPerPage) {
        currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
        labelsOnCurrentPage = 0;
        console.log('Created new page');
      }

      // Calculate position for this label
      const position = calculateLabelPosition(labelsOnCurrentPage, layout, pageHeight);
      
      // Render the label
      renderLabel(currentPage, row, fieldMappings, position, layout, font);
      
      labelsOnCurrentPage++;
      processedRecords++;

      // Update progress periodically
      if (processedRecords % updateInterval === 0) {
        await supabase
          .from('merge_jobs')
          .update({ processed_pages: processedRecords })
          .eq('id', mergeJobId);
        
        console.log(`Progress: ${processedRecords}/${dataRows.length} records`);
      }
    }

    // Final progress update
    await supabase
      .from('merge_jobs')
      .update({ processed_pages: processedRecords })
      .eq('id', mergeJobId);

    // Save PDF
    const pdfBytes = await pdfDoc.save();
    console.log('PDF generated:', {
      size: `${(pdfBytes.length / 1024).toFixed(2)} KB`,
      pages: pdfDoc.getPageCount(),
      records: processedRecords
    });

    // Upload to storage
    const fileName = `${mergeJobId}_${Date.now()}.pdf`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('generated-pdfs')
      .upload(fileName, pdfBytes, {
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

    // Create generated output record with 30-day expiration
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await supabase.from('generated_outputs').insert({
      merge_job_id: mergeJobId,
      workspace_id: job.workspace_id,
      file_url: publicUrl,
      file_size_bytes: pdfBytes.length,
      page_count: pdfDoc.getPageCount(),
      expires_at: expiresAt.toISOString()
    });

    // Update job status to complete
    await supabase
      .from('merge_jobs')
      .update({
        status: 'complete',
        output_url: publicUrl,
        processed_pages: processedRecords,
        processing_completed_at: new Date().toISOString()
      })
      .eq('id', mergeJobId);

    // Log usage
    const billingCycleMonth = new Date().toISOString().slice(0, 7); // YYYY-MM format
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('pages_used_this_month, owner_id')
      .eq('id', job.workspace_id)
      .single();

    if (workspace) {
      // Create usage log entry
      await supabase
        .from('usage_logs')
        .insert({
          workspace_id: job.workspace_id,
          user_id: workspace.owner_id,
          merge_job_id: mergeJobId,
          pages_generated: processedRecords,
          billing_cycle_month: billingCycleMonth
        });

      // Update workspace usage counter
      await supabase
        .from('workspaces')
        .update({
          pages_used_this_month: workspace.pages_used_this_month + processedRecords
        })
        .eq('id', job.workspace_id);
    }

    console.log('Job completed successfully');

    return new Response(
      JSON.stringify({ 
        success: true,
        outputUrl: publicUrl,
        pagesGenerated: pdfDoc.getPageCount(),
        recordsProcessed: processedRecords
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('PDF generation error:', error);

    // Update job status to error
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
