import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Save, Loader2, FileDown } from 'lucide-react';
import { toast } from 'sonner';
import { useState, useCallback, useEffect, useRef } from 'react';
import CreativeEditorWrapper, { CesdkEditorHandle } from '@/components/cesdk/CreativeEditorWrapper';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CesdkPdfGenerator } from '@/components/CesdkPdfGenerator';
import { PageSizeControls } from '@/components/cesdk/PageSizeControls';
export default function TemplateEditor() {
  const { projectId, templateId } = useParams<{ projectId: string; templateId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);
  const [isEditorReady, setIsEditorReady] = useState(false);
  const [currentMergeJobId, setCurrentMergeJobId] = useState<string | null>(null);
  
  // Ref to store CE.SDK handle for imperative save
  const editorHandleRef = useRef<CesdkEditorHandle | null>(null);

  // Fetch template details
  const { data: template, isLoading: templateLoading } = useQuery({
    queryKey: ['template', templateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('templates')
        .select('*')
        .eq('id', templateId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!templateId,
  });

  // Fetch project details for breadcrumb and project type
  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('name, project_type')
        .eq('id', projectId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  // Fetch data source for VDP fields and sample data
  const { data: dataSource, isLoading: dataSourceLoading } = useQuery({
    queryKey: ['data-source-for-editor', projectId],
    queryFn: async () => {
      const { data } = await supabase
        .from('data_sources')
        .select('*')
        .eq('project_id', projectId!)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!projectId,
  });

  // Fetch field mapping for variable field names
  const { data: fieldMapping } = useQuery({
    queryKey: ['field-mapping-for-template', templateId],
    queryFn: async () => {
      const { data } = await supabase
        .from('field_mappings')
        .select('mappings')
        .eq('template_id', templateId!)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      return data;
    },
    enabled: !!templateId,
  });

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (sceneString: string) => {
      const designConfig = {
        ...(template?.design_config as object || {}),
        cesdkScene: sceneString,
      };
      
      const { error } = await supabase
        .from('templates')
        .update({ design_config: designConfig })
        .eq('id', templateId!);
      
      if (error) throw error;
    },
    onSuccess: () => {
      setHasUnsavedChanges(false);
      queryClient.invalidateQueries({ queryKey: ['template', templateId] });
      queryClient.invalidateQueries({ queryKey: ['templates', projectId] });
      toast.success('Design saved');
    },
    onError: (error) => {
      console.error('Save error:', error);
      toast.error('Failed to save design');
    },
  });

  // Update template dimensions mutation
  const updateDimensionsMutation = useMutation({
    mutationFn: async ({ width, height }: { width: number; height: number }) => {
      const { error } = await supabase
        .from('templates')
        .update({ width_mm: width, height_mm: height })
        .eq('id', templateId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template', templateId] });
      toast.success('Page size updated');
    },
    onError: (error) => {
      console.error('Failed to update dimensions:', error);
      toast.error('Failed to update page size');
    },
  });

  // Create merge job mutation
  const createMergeJobMutation = useMutation({
    mutationFn: async (totalPages: number) => {
      // Get user's workspace
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: profile } = await supabase
        .from('profiles')
        .select('workspace_id')
        .eq('id', user.id)
        .single();

      if (!profile?.workspace_id) throw new Error('No workspace found');
      if (!dataSource?.id) throw new Error('No data source found');

      const { data, error } = await supabase
        .from('merge_jobs')
        .insert({
          project_id: projectId!,
          template_id: templateId!,
          data_source_id: dataSource.id,
          workspace_id: profile.workspace_id,
          status: 'processing',
          total_pages: totalPages,
          processed_pages: 0,
          processing_started_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (error) throw error;
      return data.id;
    },
  });

  // Handle save from CE.SDK callback
  const handleSave = useCallback((sceneString: string) => {
    setIsSaving(true);
    saveMutation.mutate(sceneString, {
      onSettled: () => setIsSaving(false),
    });
  }, [saveMutation]);

  // Manual save button click - triggers save via handle
  const handleManualSave = useCallback(async () => {
    if (!editorHandleRef.current) {
      toast.error('Editor not ready');
      return;
    }
    setIsSaving(true);
    try {
      await editorHandleRef.current.saveScene();
    } catch (error) {
      console.error('Manual save error:', error);
      toast.error('Failed to save');
    } finally {
      setIsSaving(false);
    }
  }, []);

  // Auto-save before navigating away
  const autoSaveAndNavigate = useCallback(async () => {
    if (hasUnsavedChanges && editorHandleRef.current) {
      try {
        setIsSaving(true);
        await editorHandleRef.current.saveScene();
        toast.success('Design auto-saved');
      } catch (error) {
        console.error('Auto-save error:', error);
        // Still navigate even if save fails - user was warned
      } finally {
        setIsSaving(false);
      }
    }
    navigate(`/projects/${projectId}`);
  }, [hasUnsavedChanges, navigate, projectId]);

  // Handle Generate PDFs click - create merge job, auto-save, then open dialog
  const handleGeneratePdfs = useCallback(async () => {
    // Auto-save before generating PDFs
    if (hasUnsavedChanges && editorHandleRef.current) {
      try {
        setIsSaving(true);
        await editorHandleRef.current.saveScene();
        toast.success('Design saved before export');
      } catch (error) {
        console.error('Save before export error:', error);
        toast.error('Failed to save before export');
        return;
      } finally {
        setIsSaving(false);
      }
    }

    // Create merge job before opening dialog
    try {
      const mergeJobId = await createMergeJobMutation.mutateAsync(allSampleData.length);
      setCurrentMergeJobId(mergeJobId);
      setPdfDialogOpen(true);
    } catch (error: any) {
      console.error('Failed to create merge job:', error);
      toast.error('Failed to start PDF generation: ' + error.message);
    }
  }, [hasUnsavedChanges, createMergeJobMutation]);

  // Track when scene changes
  const handleSceneChange = useCallback((hasChanges: boolean) => {
    setHasUnsavedChanges(hasChanges);
  }, []);

  // Store editor handle when ready
  const handleEditorReady = useCallback((handle: CesdkEditorHandle) => {
    editorHandleRef.current = handle;
    setIsEditorReady(true);
  }, []);

  // Warn user about unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Handle page size change from PageSizeControls
  const handlePageSizeChange = useCallback((width: number, height: number) => {
    updateDimensionsMutation.mutate({ width, height });
  }, [updateDimensionsMutation]);

  // Determine if this is a label project (labels use fixed template sizes)
  const isLabelProject = project?.project_type === 'label';

  // Extract sample data from data source - get ALL rows for record navigation
  const parsedFields = dataSource?.parsed_fields as { rows?: any[]; preview?: any[]; columns?: string[] } | null;
  const sampleRows = parsedFields?.rows || parsedFields?.preview || [];
  const allSampleData: Record<string, string>[] = sampleRows.map((row: any) => row as Record<string, string>);
  const sampleData: Record<string, string> = allSampleData[0] || {};
  
  // Get available field names from data source columns or field mappings
  const availableFields: string[] = 
    parsedFields?.columns || 
    (fieldMapping?.mappings ? Object.keys(fieldMapping.mappings as object) : []) ||
    [];

  // Get initial scene from design_config if it exists
  const initialScene = (template?.design_config as { cesdkScene?: string } | null)?.cesdkScene;

  // Wait for both template and data source to load before rendering editor
  const isLoading = templateLoading || dataSourceLoading;
  
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center flex-col gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">
          {templateLoading ? 'Loading template...' : 'Loading data fields...'}
        </p>
      </div>
    );
  }

  if (!template) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Template not found</p>
        <Button asChild variant="outline">
          <Link to={`/projects/${projectId}`}>Back to Project</Link>
        </Button>
      </div>
    );
  }

  // Handle dialog close - clear the current merge job
  const handleDialogClose = (open: boolean) => {
    setPdfDialogOpen(open);
    if (!open) {
      setCurrentMergeJobId(null);
      // Refresh merge jobs list on the project page
      queryClient.invalidateQueries({ queryKey: ['merge-jobs', projectId] });
    }
  };

  return (
    <div className="flex h-screen w-screen flex-col bg-background">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b bg-card px-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={autoSaveAndNavigate}
            title="Save and go back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="hidden sm:block">
            <nav className="flex items-center gap-1 text-sm text-muted-foreground">
              <Link to="/projects" className="hover:text-foreground transition-colors">
                Projects
              </Link>
              <span>/</span>
              <Link to={`/projects/${projectId}`} className="hover:text-foreground transition-colors">
                {project?.name || 'Project'}
              </Link>
              <span>/</span>
              <span className="text-foreground font-medium">{template.name}</span>
            </nav>
          </div>
          <div className="sm:hidden">
            <p className="font-semibold">{template.name}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Page Size Controls - only for non-label projects */}
          {!isLabelProject && template.width_mm && template.height_mm ? (
            <PageSizeControls
              widthMm={template.width_mm}
              heightMm={template.height_mm}
              onChange={handlePageSizeChange}
            />
          ) : template.width_mm && template.height_mm ? (
            <span className="text-xs text-muted-foreground font-mono hidden sm:inline">
              {template.width_mm}×{template.height_mm}mm
            </span>
          ) : null}
          
          {hasUnsavedChanges && !isSaving && (
            <span className="text-xs text-amber-500 hidden sm:inline">Unsaved</span>
          )}
          
          {/* Save Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleManualSave}
            disabled={isSaving || !isEditorReady}
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            <span className="ml-1.5 hidden sm:inline">Save</span>
          </Button>
          
          {/* Generate PDFs Button - Prominent */}
          <Button
            size="sm"
            onClick={handleGeneratePdfs}
            disabled={!isEditorReady || allSampleData.length === 0 || createMergeJobMutation.isPending}
          >
            {createMergeJobMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileDown className="h-4 w-4" />
            )}
            <span className="ml-1.5">Generate PDFs</span>
          </Button>
        </div>
      </header>

      {/* Editor */}
      <main className="flex-1 overflow-hidden">
        <CreativeEditorWrapper
          key={`${templateId}-${availableFields.length}-${template.width_mm}-${template.height_mm}`}
          availableFields={availableFields}
          sampleData={sampleData}
          allSampleData={allSampleData}
          initialScene={initialScene}
          onSave={handleSave}
          onSceneChange={handleSceneChange}
          onReady={handleEditorReady}
          labelWidth={template.width_mm || 100}
          labelHeight={template.height_mm || 50}
          bleedMm={template.bleed_mm || 0}
          whiteUnderlayer={(template.design_config as { whiteUnderlayer?: boolean } | null)?.whiteUnderlayer ?? false}
          templateType={template.template_type || 'address_label'}
        />
      </main>

      {/* PDF Generation Dialog */}
      <Dialog open={pdfDialogOpen} onOpenChange={handleDialogClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Generate PDFs</DialogTitle>
          </DialogHeader>
          {currentMergeJobId && (
            <CesdkPdfGenerator
              cesdk={editorHandleRef.current?.cesdk || null}
              mergeJobId={currentMergeJobId}
              dataRecords={allSampleData}
              templateConfig={{
                widthMm: template.width_mm || 100,
                heightMm: template.height_mm || 50,
                // Full page layouts don't need tiling
                isFullPage: (template.width_mm || 100) > 150 && (template.height_mm || 50) > 100,
                averyPartNumber: (template as any).avery_part_number || (template.design_config as any)?.averyCode,
              }}
              onComplete={(result) => {
                // Don't auto-close - let user download first
                toast.success(`Generated ${result.pageCount} pages`);
              }}
              onError={(error) => {
                toast.error(error);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
