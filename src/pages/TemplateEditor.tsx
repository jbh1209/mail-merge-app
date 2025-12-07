import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useState, useCallback, useEffect } from 'react';
import CreativeEditorWrapper from '@/components/cesdk/CreativeEditorWrapper';

export default function TemplateEditor() {
  const { projectId, templateId } = useParams<{ projectId: string; templateId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

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

  // Fetch project details for breadcrumb
  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('name')
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

  // Handle save from CE.SDK
  const handleSave = useCallback((sceneString: string) => {
    setIsSaving(true);
    saveMutation.mutate(sceneString, {
      onSettled: () => setIsSaving(false),
    });
  }, [saveMutation]);

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

  // Extract sample data from data source
  const parsedFields = dataSource?.parsed_fields as { rows?: any[]; preview?: any[]; columns?: string[] } | null;
  const sampleRows = parsedFields?.rows || parsedFields?.preview || [];
  const sampleData: Record<string, string> = sampleRows[0] || {};
  
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

  return (
    <div className="flex h-screen w-screen flex-col bg-background">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b bg-card px-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (hasUnsavedChanges) {
                if (confirm('You have unsaved changes. Are you sure you want to leave?')) {
                  navigate(`/projects/${projectId}`);
                }
              } else {
                navigate(`/projects/${projectId}`);
              }
            }}
            title="Back to project"
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
          {template.width_mm && template.height_mm && (
            <span className="text-xs text-muted-foreground font-mono hidden sm:inline">
              {template.width_mm}×{template.height_mm}mm
            </span>
          )}
          {isSaving && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Saving...</span>
            </div>
          )}
          {hasUnsavedChanges && !isSaving && (
            <span className="text-xs text-amber-500">Unsaved changes</span>
          )}
        </div>
      </header>

      {/* Editor */}
      <main className="flex-1 overflow-hidden">
        <CreativeEditorWrapper
          key={`${templateId}-${availableFields.length}`}
          availableFields={availableFields}
          sampleData={sampleData}
          initialScene={initialScene}
          onSave={handleSave}
          labelWidth={template.width_mm || 100}
          labelHeight={template.height_mm || 50}
          bleedMm={template.bleed_mm || 0}
          whiteUnderlayer={(template.design_config as { whiteUnderlayer?: boolean } | null)?.whiteUnderlayer ?? false}
          templateType={template.template_type || 'address_label'}
        />
      </main>
    </div>
  );
}
