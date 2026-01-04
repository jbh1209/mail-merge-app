import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Save, Loader2, FileDown, ImageIcon, Upload, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useState, useCallback, useEffect, useRef } from 'react';
import CreativeEditorWrapper, { CesdkEditorHandle, RecordNavigationState } from '@/components/cesdk/CreativeEditorWrapper';
import { PolotnoEditorWrapper, PolotnoEditorHandle, RecordNavigationState as PolotnoRecordNavState } from '@/components/polotno';
import { PolotnoPdfGenerator } from '@/components/polotno/PolotnoPdfGenerator';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CesdkPdfGenerator } from '@/components/CesdkPdfGenerator';
import { PageSizeControls } from '@/components/cesdk/PageSizeControls';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { isLikelyImageField, detectImageColumnsFromValues } from '@/lib/avery-labels';
import { useRegionPreference, TemplateRegion } from '@/hooks/useRegionPreference';
import { PrintSettingsPanel } from '@/components/PrintSettingsPanel';
import { PrintSettings, getDefaultPrintSettings } from '@/types/print-settings';

// Feature flag: use Polotno editor instead of CE.SDK
// Set VITE_USE_POLOTNO_EDITOR=true in environment to enable
// Polotno is now the default editor
// Set VITE_USE_CESDK_EDITOR=true in environment to use CE.SDK instead
const USE_POLOTNO_EDITOR = import.meta.env.VITE_USE_CESDK_EDITOR !== 'true';

// Unified editor handle type
type EditorHandle = CesdkEditorHandle | PolotnoEditorHandle;

export default function TemplateEditor() {
  const { projectId, templateId } = useParams<{ projectId: string; templateId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);
  const [isEditorReady, setIsEditorReady] = useState(false);
  const [currentMergeJobId, setCurrentMergeJobId] = useState<string | null>(null);
  
  // Record navigation state from CreativeEditorWrapper
  const [recordNavState, setRecordNavState] = useState<RecordNavigationState | null>(null);
  
  // Ref to store editor handle for imperative save (works with both CE.SDK and Polotno)
  const editorHandleRef = useRef<EditorHandle | null>(null);

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

  // Fetch label template region based on avery_part_number
  const { data: labelTemplate } = useQuery({
    queryKey: ['label-template-region', template?.avery_part_number],
    queryFn: async () => {
      const { data } = await supabase
        .from('label_templates')
        .select('region')
        .eq('part_number', template!.avery_part_number!)
        .maybeSingle();
      return data;
    },
    enabled: !!template?.avery_part_number,
  });

  // Get formatted dimensions based on template region
  const templateRegion = labelTemplate?.region as TemplateRegion;
  const { isUS, formatDimensions } = useRegionPreference(templateRegion);
  
  // Track if user has explicitly changed print settings
  const userChangedSettingsRef = useRef(false);
  
  // Print settings state (for non-label projects)
  const [printSettings, setPrintSettings] = useState<PrintSettings>(() => 
    getDefaultPrintSettings(isUS)
  );
  
  // Wrap setPrintSettings to track user changes
  const handlePrintSettingsChange = useCallback((newSettings: PrintSettings) => {
    userChangedSettingsRef.current = true;
    setPrintSettings(newSettings);
  }, []);
  
  // Initialize print settings from template on first load ONLY
  // Don't reset if user has already changed settings
  useEffect(() => {
    // Skip if user already changed settings
    if (userChangedSettingsRef.current) return;
    
    const baseSettings = getDefaultPrintSettings(isUS);
    
    // If template has bleed enabled, preserve that setting
    if (template?.bleed_mm && template.bleed_mm > 0) {
      setPrintSettings({
        ...baseSettings,
        enablePrintMarks: true,
        bleedMm: Number(template.bleed_mm),
      });
    } else {
      setPrintSettings(baseSettings);
    }
  }, [isUS, template]);

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

  // Fetch workspace quota for hard stop on PDF generation
  const { data: workspaceQuota } = useQuery({
    queryKey: ['workspace-quota'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data: profile } = await supabase
        .from('profiles')
        .select('workspace_id')
        .eq('id', user.id)
        .single();
      if (!profile?.workspace_id) return null;
      
      const { data: workspace } = await supabase
        .from('workspaces')
        .select('pages_used_this_month, pages_quota')
        .eq('id', profile.workspace_id)
        .single();
      return workspace;
    },
  });

  // First, get the user's workspace ID for storage paths
  const { data: userProfile } = useQuery({
    queryKey: ['user-profile-for-images'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data: profile } = await supabase
        .from('profiles')
        .select('workspace_id')
        .eq('id', user.id)
        .single();
      return profile;
    },
  });

  // Fetch project images from storage - using correct path with workspaceId
  const { data: projectImages = [] } = useQuery({
    queryKey: ['project-images', projectId, userProfile?.workspace_id],
    queryFn: async () => {
      if (!userProfile?.workspace_id) return [];
      
      const folderPath = `${userProfile.workspace_id}/${projectId}/images`;
      
      // List files in the project-assets bucket for this project
      const { data: files, error } = await supabase.storage
        .from('project-assets')
        .list(folderPath, {
          limit: 100,
          sortBy: { column: 'name', order: 'asc' },
        });
      
      if (error) {
        console.warn('Could not fetch project images:', error);
        return [];
      }
      
      // Filter to image files only
      const imageFiles = (files || []).filter(f => /\.(png|jpg|jpeg|gif|webp)$/i.test(f.name));
      if (imageFiles.length === 0) return [];
      
      // Generate signed URLs for each image (bucket is private)
      const paths = imageFiles.map(f => `${folderPath}/${f.name}`);
      const { data: signedUrls, error: urlError } = await supabase.storage
        .from('project-assets')
        .createSignedUrls(paths, 3600); // 1 hour expiry
      
      if (urlError || !signedUrls) {
        console.warn('Could not create signed URLs:', urlError);
        return [];
      }
      
      return imageFiles.map((f, index) => ({
        name: f.name,
        url: signedUrls[index]?.signedUrl || '',
      }));
    },
    enabled: !!projectId && !!userProfile?.workspace_id,
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
    // Get sample data count for quota check
    const parsedFieldsLocal = dataSource?.parsed_fields as { rows?: any[]; preview?: any[]; columns?: string[] } | null;
    const sampleRowsLocal = parsedFieldsLocal?.rows || parsedFieldsLocal?.preview || [];
    const recordCount = sampleRowsLocal.length;
    
    // Calculate quota status
    const pagesRemaining = workspaceQuota 
      ? workspaceQuota.pages_quota - workspaceQuota.pages_used_this_month 
      : 0;
    const isOverQuota = workspaceQuota 
      ? workspaceQuota.pages_used_this_month >= workspaceQuota.pages_quota 
      : false;
    const wouldExceedQuota = workspaceQuota 
      ? (workspaceQuota.pages_used_this_month + recordCount) > workspaceQuota.pages_quota 
      : false;
      
    // HARD STOP: Check quota before generating
    if (isOverQuota) {
      toast.error('You have reached your monthly page limit. Please upgrade your plan to continue.');
      navigate('/settings?tab=billing');
      return;
    }
    
    if (wouldExceedQuota) {
      toast.error(`Cannot generate ${recordCount} pages. You only have ${pagesRemaining} pages remaining this month.`);
      return;
    }

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
      const mergeJobId = await createMergeJobMutation.mutateAsync(recordCount);
      setCurrentMergeJobId(mergeJobId);
      setPdfDialogOpen(true);
    } catch (error: any) {
      console.error('Failed to create merge job:', error);
      toast.error('Failed to start PDF generation: ' + error.message);
    }
  }, [hasUnsavedChanges, createMergeJobMutation, workspaceQuota, dataSource, navigate]);

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

  // Detect image fields FIRST - check both column names AND values
  // This must happen BEFORE filtering so image columns aren't excluded
  const imageFields = detectImageColumnsFromValues(availableFields, allSampleData);

  // Filter out junk columns like Unnamed_Column_* BUT KEEP image columns!
  // Image columns may have generic names (e.g., Unnamed_Column_2) when CSV headers are empty
  const validFields = availableFields.filter(f => 
    imageFields.includes(f) || !/^Unnamed_Column_\d+$/i.test(f)
  );

  // Filter records that have at least one non-empty value in valid fields
  // This prevents blank rows from appearing as records in the preview
  const validRecords = allSampleData.filter(record => {
    // Check if at least one valid field has meaningful content
    return validFields.some(field => {
      const value = record[field];
      if (value === null || value === undefined) return false;
      const trimmed = String(value).trim();
      // Exclude empty strings and raw placeholder tokens
      if (trimmed === '' || /^\{\{[^}]+\}\}$/.test(trimmed)) return false;
      return true;
    });
  });
  const hasImageFields = imageFields.length > 0;
  const hasUploadedImages = projectImages.length > 0;
  const showImageUploadPrompt = hasImageFields && !hasUploadedImages;

  // Calculate quota status for button state
  const isOverQuota = workspaceQuota 
    ? workspaceQuota.pages_used_this_month >= workspaceQuota.pages_quota 
    : false;

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
              templateRegion={templateRegion}
            />
          ) : template.width_mm && template.height_mm ? (
            <span className="text-xs text-muted-foreground font-mono hidden sm:inline">
              {formatDimensions(template.width_mm, template.height_mm)}
            </span>
          ) : null}
          
          {/* Bleed toggle - only for non-label projects */}
          {!isLabelProject && (
            <PrintSettingsPanel
              settings={printSettings}
              onChange={handlePrintSettingsChange}
              compact
            />
          )}
          
          {/* Record Navigation - centered in header */}
          {recordNavState && recordNavState.totalRecords > 1 && (
            <div className="flex items-center gap-1 px-2 py-1 bg-muted rounded-md">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={recordNavState.goToPrevious}
                disabled={recordNavState.currentIndex === 0}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="text-xs font-medium tabular-nums min-w-[80px] text-center">
                Record {recordNavState.currentIndex + 1} / {recordNavState.totalRecords}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={recordNavState.goToNext}
                disabled={recordNavState.currentIndex === recordNavState.totalRecords - 1}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
          
          {/* Regenerate Layout Button - only for Polotno and new templates */}
          {USE_POLOTNO_EDITOR && isEditorReady && !initialScene && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const polotnoHandle = editorHandleRef.current as PolotnoEditorHandle | null;
                if (polotnoHandle?.regenerateLayout) {
                  polotnoHandle.regenerateLayout();
                }
              }}
              title="Regenerate AI layout"
              className="text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className="h-4 w-4" />
              <span className="ml-1.5 hidden sm:inline">Reset Layout</span>
            </Button>
          )}
          
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
            disabled={!isEditorReady || allSampleData.length === 0 || createMergeJobMutation.isPending || isOverQuota}
            variant={isOverQuota ? "destructive" : "default"}
            title={isOverQuota ? "Quota exceeded - upgrade to continue" : undefined}
          >
            {createMergeJobMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileDown className="h-4 w-4" />
            )}
            <span className="ml-1.5">{isOverQuota ? "Quota Exceeded" : "Generate PDFs"}</span>
          </Button>
        </div>
      </header>

      {/* Record Navigation is now rendered inside CreativeEditorWrapper overlaid on the CE.SDK nav bar */}

      {/* Image Upload Prompt Banner */}
      {showImageUploadPrompt && (
        <Alert className="mx-4 mt-2 border-amber-500/50 bg-amber-500/10">
          <ImageIcon className="h-4 w-4 text-amber-600" />
          <AlertDescription className="flex items-center justify-between">
            <span className="text-sm">
              Your data contains image fields ({imageFields.join(', ')}). Upload images to use them in your design.
            </span>
            <Button
              variant="outline"
              size="sm"
              className="ml-4"
              onClick={() => navigate(`/projects/${projectId}?tab=assets`)}
            >
              <Upload className="h-4 w-4 mr-1" />
              Upload Images
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Editor */}
      <main className="flex-1 overflow-hidden">
        {USE_POLOTNO_EDITOR ? (
          <PolotnoEditorWrapper
            key={`polotno-${templateId}`}
            availableFields={validFields}
            sampleData={sampleData}
            allSampleData={validRecords}
            initialScene={initialScene}
            onSave={handleSave}
            onSceneChange={handleSceneChange}
            onReady={(handle) => {
              editorHandleRef.current = handle;
              setIsEditorReady(true);
            }}
            onRecordNavigationChange={setRecordNavState}
            labelWidth={
              !isLabelProject && printSettings.enablePrintMarks
                ? (template.width_mm || 100) + printSettings.bleedMm * 2
                : (template.width_mm || 100)
            }
            labelHeight={
              !isLabelProject && printSettings.enablePrintMarks
                ? (template.height_mm || 50) + printSettings.bleedMm * 2
                : (template.height_mm || 50)
            }
            bleedMm={template.bleed_mm || 0}
            projectType={project?.project_type || 'label'}
            projectImages={projectImages}
            trimGuideMm={
              !isLabelProject && printSettings.enablePrintMarks
                ? { width: template.width_mm || 100, height: template.height_mm || 50, bleedMm: printSettings.bleedMm }
                : undefined
            }
          />
        ) : (
          <CreativeEditorWrapper
            key={`cesdk-${templateId}-${validFields.length}-${template.width_mm}-${template.height_mm}-${projectImages.length}`}
            availableFields={validFields}
            sampleData={sampleData}
            allSampleData={validRecords}
            initialScene={initialScene}
            onSave={handleSave}
            onSceneChange={handleSceneChange}
            onReady={handleEditorReady}
            onRecordNavigationChange={setRecordNavState}
            labelWidth={
              !isLabelProject && printSettings.enablePrintMarks
                ? (template.width_mm || 100) + printSettings.bleedMm * 2
                : (template.width_mm || 100)
            }
            labelHeight={
              !isLabelProject && printSettings.enablePrintMarks
                ? (template.height_mm || 50) + printSettings.bleedMm * 2
                : (template.height_mm || 50)
            }
            bleedMm={template.bleed_mm || 0}
            whiteUnderlayer={(template.design_config as { whiteUnderlayer?: boolean } | null)?.whiteUnderlayer ?? false}
            templateType={template.template_type || 'address_label'}
            projectType={project?.project_type || 'label'}
            projectImages={projectImages}
            trimGuideMm={
              !isLabelProject && printSettings.enablePrintMarks
                ? { width: template.width_mm || 100, height: template.height_mm || 50, bleedMm: printSettings.bleedMm }
                : undefined
            }
          />
        )}
      </main>

      {/* PDF Generation Dialog */}
      <Dialog open={pdfDialogOpen} onOpenChange={handleDialogClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Generate PDFs</DialogTitle>
          </DialogHeader>
          {currentMergeJobId && (
            <>
              {/* Print settings panel for non-label projects */}
              {project?.project_type !== 'label' && (
                <PrintSettingsPanel
                  settings={printSettings}
                  onChange={handlePrintSettingsChange}
                />
              )}
              
              {USE_POLOTNO_EDITOR ? (
                <PolotnoPdfGenerator
                  editorHandle={editorHandleRef.current as PolotnoEditorHandle | null}
                  mergeJobId={currentMergeJobId}
                  dataRecords={validRecords}
                  projectType={project?.project_type || 'label'}
                  projectImages={projectImages}
                  templateConfig={{
                    widthMm: template.width_mm || 100,
                    heightMm: template.height_mm || 50,
                    isFullPage: project?.project_type !== 'label',
                    averyPartNumber: (template as any).avery_part_number || (template.design_config as any)?.averyCode,
                  }}
                  printSettings={project?.project_type !== 'label' ? printSettings : undefined}
                  onComplete={(result) => {
                    toast.success(`Generated ${result.pageCount} pages`);
                  }}
                  onError={(error) => {
                    toast.error(error);
                  }}
                />
              ) : (
                <CesdkPdfGenerator
                  cesdk={editorHandleRef.current && 'cesdk' in editorHandleRef.current ? editorHandleRef.current.cesdk : null}
                  mergeJobId={currentMergeJobId}
                  dataRecords={validRecords}
                  projectType={project?.project_type || 'label'}
                  projectImages={projectImages}
                  templateConfig={{
                    widthMm: template.width_mm || 100,
                    heightMm: template.height_mm || 50,
                    isFullPage: project?.project_type !== 'label',
                    averyPartNumber: (template as any).avery_part_number || (template.design_config as any)?.averyCode,
                  }}
                  printSettings={project?.project_type !== 'label' ? printSettings : undefined}
                  onComplete={(result) => {
                    toast.success(`Generated ${result.pageCount} pages`);
                  }}
                  onError={(error) => {
                    toast.error(error);
                  }}
                />
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
