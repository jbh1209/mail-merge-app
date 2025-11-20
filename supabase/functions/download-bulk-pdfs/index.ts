import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';
import JSZip from 'https://esm.sh/jszip@3.10.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { jobIds } = await req.json();

    if (!Array.isArray(jobIds) || jobIds.length === 0) {
      return new Response(
        JSON.stringify({ error: 'jobIds array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Creating ZIP for ${jobIds.length} jobs`);

    // Fetch all merge jobs with their outputs
    const { data: jobs, error: jobsError } = await supabase
      .from('merge_jobs')
      .select('id, output_url, templates!inner(name), created_at')
      .in('id', jobIds)
      .eq('status', 'complete')
      .not('output_url', 'is', null);

    if (jobsError) throw jobsError;

    if (!jobs || jobs.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No valid jobs found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create ZIP file
    const zip = new JSZip();

    // Download each PDF and add to ZIP
    for (const job of jobs) {
      try {
        // Use the storage path directly
        const storagePath = job.output_url;

        // Download from storage (service role has access)
        const { data: fileData, error: downloadError } = await supabase.storage
          .from('generated-pdfs')
          .download(storagePath);

        if (downloadError) {
          console.error(`Failed to download ${storagePath}:`, downloadError);
          continue;
        }

        // Add to ZIP with template name prefix
        const templateName = (job.templates as any)?.name || 'Unknown';
        const timestamp = new Date(job.created_at).getTime();
        const zipFileName = `${templateName}_${timestamp}.pdf`;
        
        zip.file(zipFileName, await fileData.arrayBuffer());
      } catch (error) {
        console.error(`Error processing job ${job.id}:`, error);
      }
    }

    // Generate ZIP
    const zipBlob = await zip.generateAsync({ 
      type: 'uint8array',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });

    console.log(`ZIP created with ${jobs.length} files, size: ${zipBlob.length} bytes`);

    return new Response(zipBlob as unknown as BodyInit, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="pdfs_${Date.now()}.zip"`,
        'Content-Length': zipBlob.length.toString()
      },
    });

  } catch (error) {
    console.error('Bulk download error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
