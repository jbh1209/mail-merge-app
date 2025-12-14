import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { projectId } = await req.json();
    
    console.log(`Starting deletion of project ${projectId} for user ${user.id}`);

    const { data: project } = await supabase
      .from('projects')
      .select('workspace_id')
      .eq('id', projectId)
      .single();

    if (!project) {
      return new Response(JSON.stringify({ error: 'Project not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('workspace_id')
      .eq('id', user.id)
      .single();

    if (profile?.workspace_id !== project.workspace_id) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Delete in correct order to respect foreign key constraints
    
    // 1. Get merge job IDs first
    const { data: mergeJobs } = await supabase
      .from('merge_jobs')
      .select('id')
      .eq('project_id', projectId);

    const mergeJobIds = mergeJobs?.map(job => job.id) || [];

    // ========== STORAGE CLEANUP ==========
    
    // 2a. Delete project images from project-assets bucket
    const imagesFolderPath = `${project.workspace_id}/${projectId}/images`;
    console.log(`Checking for images in: ${imagesFolderPath}`);
    
    const { data: imageFiles, error: listImagesError } = await supabase.storage
      .from('project-assets')
      .list(imagesFolderPath);
    
    if (listImagesError) {
      console.error('Error listing project images:', listImagesError);
    } else if (imageFiles && imageFiles.length > 0) {
      const imagePaths = imageFiles.map(f => `${imagesFolderPath}/${f.name}`);
      const { error: deleteImagesError } = await supabase.storage
        .from('project-assets')
        .remove(imagePaths);
      
      if (deleteImagesError) {
        console.error('Error deleting project images:', deleteImagesError);
      } else {
        console.log(`Deleted ${imagePaths.length} images from project-assets`);
      }
    }

    // 2b. Delete generated PDFs from generated-pdfs bucket
    if (mergeJobIds.length > 0) {
      const { data: outputs } = await supabase
        .from('generated_outputs')
        .select('file_url')
        .in('merge_job_id', mergeJobIds);
      
      if (outputs && outputs.length > 0) {
        const pdfPaths = outputs
          .filter(o => o.file_url)
          .map(o => {
            // Extract path from URL - format: .../generated-pdfs/path/to/file.pdf
            const pathMatch = o.file_url.match(/generated-pdfs\/(.+)/);
            return pathMatch ? pathMatch[1] : null;
          })
          .filter((p): p is string => p !== null);
        
        if (pdfPaths.length > 0) {
          const { error: deletePdfsError } = await supabase.storage
            .from('generated-pdfs')
            .remove(pdfPaths);
          
          if (deletePdfsError) {
            console.error('Error deleting generated PDFs:', deletePdfsError);
          } else {
            console.log(`Deleted ${pdfPaths.length} PDFs from generated-pdfs`);
          }
        }
      }
    }

    // 2c. Delete data source files from user-uploads bucket
    const { data: dataSources } = await supabase
      .from('data_sources')
      .select('file_url')
      .eq('project_id', projectId);
    
    if (dataSources && dataSources.length > 0) {
      const filePaths = dataSources
        .filter(ds => ds.file_url)
        .map(ds => {
          // Extract path from URL - format: .../user-uploads/path/to/file.csv
          const pathMatch = ds.file_url?.match(/user-uploads\/(.+)/);
          return pathMatch ? pathMatch[1] : null;
        })
        .filter((p): p is string => p !== null);
      
      if (filePaths.length > 0) {
        const { error: deleteFilesError } = await supabase.storage
          .from('user-uploads')
          .remove(filePaths);
        
        if (deleteFilesError) {
          console.error('Error deleting data source files:', deleteFilesError);
        } else {
          console.log(`Deleted ${filePaths.length} files from user-uploads`);
        }
      }
    }

    // ========== DATABASE CLEANUP ==========

    // 3. Delete generated_outputs records
    if (mergeJobIds.length > 0) {
      const { error: generatedError } = await supabase
        .from('generated_outputs')
        .delete()
        .in('merge_job_id', mergeJobIds);
      
      if (generatedError) {
        console.error('Error deleting generated_outputs:', generatedError);
      }
    }

    // 3. Detach usage_logs from merge_jobs (set merge_job_id to null)
    if (mergeJobIds.length > 0) {
      const { error: usageLogsError } = await supabase
        .from('usage_logs')
        .update({ merge_job_id: null })
        .in('merge_job_id', mergeJobIds);
      
      if (usageLogsError) {
        console.error('Error detaching usage_logs:', usageLogsError);
        throw new Error(`Failed to detach usage logs: ${usageLogsError.message}`);
      }
    }

    // 4. Delete merge_jobs
    const { error: jobsError } = await supabase
      .from('merge_jobs')
      .delete()
      .eq('project_id', projectId);
    
    if (jobsError) {
      console.error('Error deleting merge_jobs:', jobsError);
      throw new Error(`Failed to delete merge jobs: ${jobsError.message}`);
    }

    // 5. Delete field_mappings
    const { error: mappingsError } = await supabase
      .from('field_mappings')
      .delete()
      .eq('project_id', projectId);
    
    if (mappingsError) {
      console.error('Error deleting field_mappings:', mappingsError);
      throw new Error(`Failed to delete field mappings: ${mappingsError.message}`);
    }

    // 6. Delete data_sources
    const { error: dataSourcesError } = await supabase
      .from('data_sources')
      .delete()
      .eq('project_id', projectId);
    
    if (dataSourcesError) {
      console.error('Error deleting data_sources:', dataSourcesError);
      throw new Error(`Failed to delete data sources: ${dataSourcesError.message}`);
    }

    // 7. Delete templates
    const { error: templatesError } = await supabase
      .from('templates')
      .delete()
      .eq('project_id', projectId);
    
    if (templatesError) {
      console.error('Error deleting templates:', templatesError);
      throw new Error(`Failed to delete templates: ${templatesError.message}`);
    }

    // 8. Finally, delete the project itself
    const { error: projectError } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectId);
    
    if (projectError) {
      console.error('Error deleting project:', projectError);
      throw new Error(`Failed to delete project: ${projectError.message}`);
    }

    console.log(`Successfully deleted project ${projectId}`);

    return new Response(
      JSON.stringify({ success: true, message: 'Project deleted successfully' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in delete-project function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
