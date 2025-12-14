import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Upload, FileText, Play, Plus, Home, Edit, Image, AlertCircle } from "lucide-react";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DataUpload } from "@/components/DataUpload";
import { DataPreview } from "@/components/DataPreview";
import { DataSourcesList } from "@/components/DataSourcesList";
import { TemplateWizard } from "@/components/TemplateWizard";
import { FieldMappingWizard } from "@/components/FieldMappingWizard";
import { MergeJobRunner } from "@/components/MergeJobRunner";
import { MergeJobsList } from "@/components/MergeJobsList";
import { ImageAssetUpload } from "@/components/ImageAssetUpload";
import { detectImageColumnsFromValues } from "@/lib/avery-labels";

import { useSubscription } from "@/hooks/useSubscription";
import { toast } from "sonner";
import { format } from "date-fns";

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadStep, setUploadStep] = useState<'upload' | 'preview'>('upload');
  const [parsedData, setParsedData] = useState<any>(null);
  const [templateWizardOpen, setTemplateWizardOpen] = useState(false);
  const [fieldMappingOpen, setFieldMappingOpen] = useState(false);
  const [selectedDataSource, setSelectedDataSource] = useState<any>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("data-sources");
  const [uploadedImages, setUploadedImages] = useState<{ name: string; url: string; path: string; size: number }[]>([]);

  // Handle URL params for auto-navigation to specific tabs
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'merge-jobs') {
      setActiveTab('jobs');
    } else if (tab === 'assets') {
      setActiveTab('assets');
    } else if (tab === 'templates') {
      setActiveTab('templates');
    } else if (tab === 'mappings') {
      setActiveTab('mappings');
    }
  }, [searchParams]);

  const { data: project, isLoading } = useQuery({
    queryKey: ["project", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("id", id!)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: dataSources } = useQuery({
    queryKey: ["data-sources", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("data_sources")
        .select("*")
        .eq("project_id", id!)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!id,
  });

  const handleUploadComplete = (result: any) => {
    setParsedData(result);
    setUploadStep('preview');
  };

  const handlePreviewComplete = () => {
    setUploadModalOpen(false);
    setUploadStep('upload');
    setParsedData(null);
    queryClient.invalidateQueries({ queryKey: ["data-sources", id] });
  };

  const handleDeleteDataSource = async (dataSourceId: string) => {
    try {
      const { error } = await supabase
        .from("data_sources")
        .delete()
        .eq("id", dataSourceId);

      if (error) throw error;

      toast.success("Data source deleted");
      queryClient.invalidateQueries({ queryKey: ["data-sources", id] });
    } catch (error) {
      console.error("Delete error:", error);
      toast.error("Failed to delete data source");
    }
  };

  const { data: templates } = useQuery({
    queryKey: ["templates", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("templates")
        .select("*")
        .eq("project_id", id!)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!id,
  });

  const { data: fieldMappings } = useQuery({
    queryKey: ["field-mappings", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("field_mappings")
        .select(`
          *,
          data_source:data_sources(id, file_url, row_count),
          template:templates(id, name)
        `)
        .eq("project_id", id!)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!id,
  });

  const { data: mergeJobs } = useQuery({
    queryKey: ["merge-jobs", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("merge_jobs")
        .select(`
          *,
          template:templates(name),
          data_source:data_sources(row_count)
        `)
        .eq("project_id", id!)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!id,
  });

  const { data: workspace } = useQuery({
    queryKey: ["workspace"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      
      const { data } = await supabase
        .from("profiles")
        .select("workspace_id")
        .eq("id", user.id)
        .single();
      
      return data?.workspace_id;
    },
  });

  const { data: subscription } = useSubscription(workspace);

  // Detect if any data source has image columns
  const detectedImageColumns = useMemo(() => {
    if (!dataSources || dataSources.length === 0) return [];
    
    for (const ds of dataSources) {
      const parsedFields = ds.parsed_fields as { columns?: string[]; rows?: any[]; preview?: any[] } | null;
      if (!parsedFields) continue;
      
      const columns = parsedFields.columns || [];
      const rows = parsedFields.rows || parsedFields.preview || [];
      const imageColumns = detectImageColumnsFromValues(columns, rows);
      
      if (imageColumns.length > 0) {
        return imageColumns;
      }
    }
    return [];
  }, [dataSources]);

  const hasDetectedImageColumns = detectedImageColumns.length > 0;
  const needsImageUpload = hasDetectedImageColumns && uploadedImages.length === 0;

  const handleTemplateComplete = () => {
    queryClient.invalidateQueries({ queryKey: ["templates", id] });
  };

  const handleStartMapping = (dataSource: any) => {
    if (!templates || templates.length === 0) {
      toast.error("Please create a template first before mapping fields");
      return;
    }
    setSelectedDataSource(dataSource);
    setSelectedTemplate(templates[0]);
    setFieldMappingOpen(true);
  };

  const handleEditTemplate = (template: any) => {
    navigate(`/projects/${id}/edit/${template.id}`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Project not found</p>
        <Button asChild variant="link" className="mt-4">
          <Link to="/projects">Back to Projects</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb Navigation */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/dashboard">
                <Home className="h-4 w-4" />
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/projects">Projects</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{project.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/projects")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">{project.name}</h1>
          <p className="text-muted-foreground capitalize">
            {project.project_type.replace("_", " ")} • Created {format(new Date(project.created_at), 'PPP')}
          </p>
        </div>
        <Badge variant="outline" className="capitalize">
          {project.status}
        </Badge>
      </div>

      {project.description && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">{project.description}</p>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          <TabsTrigger value="data-sources">Data Sources</TabsTrigger>
          <TabsTrigger value="assets" className="relative">
            Assets
            {needsImageUpload && (
              <span className="ml-1.5 inline-flex h-2 w-2 rounded-full bg-amber-500" title="Images needed" />
            )}
          </TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="mappings">Field Mappings</TabsTrigger>
          <TabsTrigger value="jobs">Merge Jobs</TabsTrigger>
        </TabsList>

        <TabsContent value="data-sources" className="space-y-4">
          {/* Image Upload Alert */}
          {needsImageUpload && (
            <Alert className="border-amber-500/50 bg-amber-500/10">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertTitle>Image References Detected</AlertTitle>
              <AlertDescription className="flex items-center justify-between">
                <span className="text-sm">
                  Your data contains image references ({detectedImageColumns.join(', ')}). Upload images in the Assets tab to use them.
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-4 shrink-0"
                  onClick={() => setActiveTab('assets')}
                >
                  <Upload className="h-4 w-4 mr-1" />
                  Go to Assets
                </Button>
              </AlertDescription>
            </Alert>
          )}
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Data Sources</CardTitle>
                <CardDescription>Upload and manage your data files</CardDescription>
              </div>
              <Button onClick={() => setUploadModalOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Upload Data
              </Button>
            </CardHeader>
            <CardContent>
              <DataSourcesList 
                dataSources={dataSources || []} 
                onDelete={handleDeleteDataSource}
                onMapFields={handleStartMapping}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assets" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Image className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle>Image Assets</CardTitle>
                  <CardDescription>
                    Upload images for variable data printing. Image filenames should match values in your data.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {workspace && (
                <ImageAssetUpload
                  projectId={id!}
                  workspaceId={workspace}
                  onImagesChange={setUploadedImages}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="templates" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Templates</CardTitle>
                <CardDescription>Design and manage your templates</CardDescription>
              </div>
              <Button onClick={() => setTemplateWizardOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Template
              </Button>
            </CardHeader>
            <CardContent>
              {templates && templates.length > 0 ? (
                <div className="space-y-3">
                  {templates.map((template) => (
                    <div key={template.id} className="p-3 rounded-lg border">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="font-medium">{template.name}</p>
                          <div className="flex gap-2 mt-1">
                            <p className="text-sm text-muted-foreground capitalize">
                              {template.template_type.replace("_", " ")}
                            </p>
                            {template.width_mm && template.height_mm && (
                              <Badge variant="outline" className="text-xs font-mono">
                                {template.width_mm}×{template.height_mm}mm
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 items-center">
                          <Badge variant="secondary">
                            {new Date(template.created_at).toLocaleDateString()}
                          </Badge>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleEditTemplate(template)}
                          >
                            <Edit className="h-4 w-4 mr-2" />
                            {(template.design_config as any)?.fields ? 'Edit Design' : 'Design Layout'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">No templates yet</p>
                  <Button onClick={() => setTemplateWizardOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Your First Template
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mappings" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Field Mappings</CardTitle>
                <CardDescription>Connect data columns to template fields</CardDescription>
              </div>
              <Button 
                onClick={() => {
                  if (!dataSources || dataSources.length === 0) {
                    toast.error("Please upload data first");
                    return;
                  }
                  if (!templates || templates.length === 0) {
                    toast.error("Please create a template first");
                    return;
                  }
                  handleStartMapping(dataSources[0]);
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Mapping
              </Button>
            </CardHeader>
            <CardContent>
              {fieldMappings && fieldMappings.length > 0 ? (
                <div className="space-y-3">
                  {fieldMappings.map((mapping: any) => (
                    <div key={mapping.id} className="p-3 rounded-lg border">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-medium">{mapping.template?.name || 'Unknown Template'}</p>
                          <div className="flex gap-2 mt-1 text-sm text-muted-foreground">
                            <span>{Object.keys(mapping.mappings || {}).length} fields mapped</span>
                            {mapping.ai_confidence_score && (
                              <>
                                <span>•</span>
                                <span>{mapping.ai_confidence_score}% AI confidence</span>
                              </>
                            )}
                            <span>•</span>
                            <span>{format(new Date(mapping.created_at), 'MMM d, yyyy')}</span>
                          </div>
                          {mapping.user_confirmed && (
                            <Badge variant="default" className="mt-2 text-xs">Confirmed</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-2">No field mappings yet</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    Create a mapping to connect your data to templates
                  </p>
                  <Button 
                    onClick={() => {
                      if (!dataSources || dataSources.length === 0) {
                        toast.error("Please upload data first");
                        return;
                      }
                      if (!templates || templates.length === 0) {
                        toast.error("Please create a template first");
                        return;
                      }
                      handleStartMapping(dataSources[0]);
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Create Your First Mapping
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="jobs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>PDF Generation</CardTitle>
              <CardDescription>Generate and download your merged documents</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {workspace && (
                <MergeJobRunner
                  projectId={id!}
                  workspaceId={workspace}
                  dataSources={dataSources || []}
                  templates={templates || []}
                  fieldMappings={fieldMappings || []}
                  autoSelectLatest={searchParams.get('autoSelect') === 'true'}
                  uploadedImages={uploadedImages}
                  onNavigateToAssets={() => setActiveTab('assets')}
                  onJobCreated={() => {
                    queryClient.invalidateQueries({ queryKey: ["merge-jobs", id] });
                  }}
                />
              )}
              
              <div>
                <h3 className="font-semibold mb-3">Generation History</h3>
                <MergeJobsList jobs={mergeJobs || []} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={uploadModalOpen} onOpenChange={setUploadModalOpen}>
        <DialogContent className="max-w-7xl w-[95vw] max-h-[95vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <DialogTitle>
              {uploadStep === 'upload' ? 'Upload Data File' : 'Preview Data'}
            </DialogTitle>
            <DialogDescription>
              {uploadStep === 'upload' 
                ? 'Upload your CSV or Excel file to import data'
                : 'Review your data before saving'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="overflow-y-auto flex-1 px-6 py-4">
            {uploadStep === 'upload' ? (
              workspace && (
                <DataUpload
                  projectId={id!}
                  workspaceId={workspace}
                  onUploadComplete={handleUploadComplete}
                />
              )
            ) : (
              workspace && parsedData && (
                <DataPreview
                  projectId={id!}
                  workspaceId={workspace}
                  columns={parsedData.columns}
                  rows={parsedData.rows}
                  rowCount={parsedData.rowCount}
                  preview={parsedData.preview}
                  filePath={parsedData.filePath}
                  fileName={parsedData.fileName}
                  subscriptionFeatures={subscription?.features}
                  onComplete={handlePreviewComplete}
                />
              )
            )}
          </div>
        </DialogContent>
      </Dialog>

      {workspace && (
        <TemplateWizard
          open={templateWizardOpen}
          onOpenChange={setTemplateWizardOpen}
          projectId={id!}
          workspaceId={workspace}
          onComplete={handleTemplateComplete}
        />
      )}

      <Dialog open={fieldMappingOpen} onOpenChange={setFieldMappingOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Map Data Fields to Template</DialogTitle>
            <DialogDescription>
              Connect your data columns to template fields for automated document generation
            </DialogDescription>
          </DialogHeader>
          
          {selectedDataSource && selectedTemplate && workspace && (
            <FieldMappingWizard
              projectId={id!}
              dataSourceId={selectedDataSource.id}
              templateId={selectedTemplate.id}
              dataColumns={
                selectedDataSource.parsed_fields?.columns?.map((c: any) => c.cleaned || c.original) || 
                Object.keys(selectedDataSource.parsed_fields?.preview?.[0] || {})
              }
              templateFields={[
                'name', 'address', 'email', 'phone', 'date', 
                'product', 'quantity', 'price', 'total', 'description'
              ]}
              sampleData={selectedDataSource.parsed_fields?.preview || []}
              subscriptionFeatures={subscription?.features}
              onComplete={() => {
                setFieldMappingOpen(false);
                queryClient.invalidateQueries({ queryKey: ["field-mappings", id] });
                toast.success("Field mapping saved successfully");
              }}
              onCancel={() => setFieldMappingOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}
