import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';

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

    console.log('Starting cleanup of expired PDFs...');

    // Find all expired generated outputs
    const { data: expiredOutputs, error: queryError } = await supabase
      .from('generated_outputs')
      .select('id, file_url, merge_job_id')
      .lt('expires_at', new Date().toISOString())
      .not('expires_at', 'is', null);

    if (queryError) throw queryError;

    if (!expiredOutputs || expiredOutputs.length === 0) {
      console.log('No expired PDFs found');
      return new Response(
        JSON.stringify({ message: 'No expired PDFs to clean up', deleted: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${expiredOutputs.length} expired PDFs to delete`);

    let deletedCount = 0;
    const errors: string[] = [];

    // Delete each file from storage and database
    for (const output of expiredOutputs) {
      try {
        // Extract file name from URL
        const fileName = output.file_url.split('/').pop();
        
        if (fileName) {
          // Delete from storage
          const { error: storageError } = await supabase.storage
            .from('generated-pdfs')
            .remove([fileName]);

          if (storageError) {
            console.error(`Failed to delete file ${fileName}:`, storageError);
            errors.push(`Storage: ${fileName}`);
          }
        }

        // Delete generated_output record
        const { error: dbError } = await supabase
          .from('generated_outputs')
          .delete()
          .eq('id', output.id);

        if (dbError) {
          console.error(`Failed to delete output record ${output.id}:`, dbError);
          errors.push(`DB: ${output.id}`);
        } else {
          deletedCount++;
        }

        // Update merge job to clear output_url
        await supabase
          .from('merge_jobs')
          .update({ output_url: null })
          .eq('id', output.merge_job_id);

      } catch (error) {
        console.error(`Error processing output ${output.id}:`, error);
        errors.push(`Exception: ${output.id}`);
      }
    }

    console.log(`Cleanup complete. Deleted: ${deletedCount}, Errors: ${errors.length}`);

    return new Response(
      JSON.stringify({
        message: 'Cleanup completed',
        deleted: deletedCount,
        found: expiredOutputs.length,
        errors: errors.length > 0 ? errors : undefined
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Cleanup error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
