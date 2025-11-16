import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Upload, FileText, Play, Plus } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DataUpload } from "@/components/DataUpload";
import { DataPreview } from "@/components/DataPreview";
import { DataSourcesList } from "@/components/DataSourcesList";
import { TemplateWizard } from "@/components/TemplateWizard";
import { toast } from "sonner";

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadStep, setUploadStep] = useState<'upload' | 'preview'>('upload');
  const [parsedData, setParsedData] = useState<any>(null);
  const [templateWizardOpen, setTemplateWizardOpen] = useState(false);

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

  const handleTemplateComplete = () => {
    queryClient.invalidateQueries({ queryKey: ["templates", id] });
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
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/projects")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">{project.name}</h1>
          <p className="text-muted-foreground capitalize">
            {project.project_type.replace("_", " ")} • Created {new Date(project.created_at).toLocaleDateString()}
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

      <Tabs defaultValue="data" className="w-full">
        <TabsList>
          <TabsTrigger value="data">Data Sources</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="jobs">Merge Jobs</TabsTrigger>
        </TabsList>

        <TabsContent value="data" className="space-y-4">
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
              />
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
                        <Badge variant="secondary">
                          {new Date(template.created_at).toLocaleDateString()}
                        </Badge>
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

        <TabsContent value="jobs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Merge Jobs</CardTitle>
              <CardDescription>View your PDF generation history</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <Play className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">No merge jobs yet</p>
                <Button disabled>
                  <Play className="mr-2 h-4 w-4" />
                  Generate PDFs (Coming Soon)
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={uploadModalOpen} onOpenChange={setUploadModalOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {uploadStep === 'upload' ? 'Upload Data File' : 'Preview Data'}
            </DialogTitle>
            <DialogDescription>
              {uploadStep === 'upload' 
                ? 'Upload your CSV or Excel file to import data'
                : 'Review your data before saving'}
            </DialogDescription>
          </DialogHeader>
          
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
                onComplete={handlePreviewComplete}
              />
            )
          )}
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
    </div>
  );
}
