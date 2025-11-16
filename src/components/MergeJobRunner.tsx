import { useState } from "react";
import { Rocket, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface MergeJobRunnerProps {
  projectId: string;
  workspaceId: string;
  dataSources: any[];
  templates: any[];
  fieldMappings: any[];
  onJobCreated: () => void;
}

export function MergeJobRunner({
  projectId,
  workspaceId,
  dataSources,
  templates,
  fieldMappings,
  onJobCreated
}: MergeJobRunnerProps) {
  const [selectedDataSource, setSelectedDataSource] = useState<string>("");
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  const { toast } = useToast();

  const canGenerate = selectedDataSource && selectedTemplate;

  // Check if mapping exists for selected combo
  const hasMapping = fieldMappings.some(
    m => m.data_source_id === selectedDataSource && m.template_id === selectedTemplate
  );

  const handleGenerate = async () => {
    if (!canGenerate) return;

    if (!hasMapping) {
      toast({
        title: "No field mapping found",
        description: "Please create a field mapping for this data source and template first",
        variant: "destructive",
      });
      return;
    }

    setGenerating(true);

    try {
      const dataSource = dataSources.find(ds => ds.id === selectedDataSource);
      const totalPages = dataSource?.row_count || 0;

      // Create merge job
      const { data: job, error: jobError } = await supabase
        .from('merge_jobs')
        .insert({
          project_id: projectId,
          workspace_id: workspaceId,
          data_source_id: selectedDataSource,
          template_id: selectedTemplate,
          total_pages: totalPages,
          status: 'queued'
        })
        .select()
        .single();

      if (jobError) throw jobError;

      toast({
        title: "PDF generation started",
        description: `Processing ${totalPages} pages...`,
      });

      // Trigger edge function
      const { error: functionError } = await supabase.functions.invoke('generate-pdf', {
        body: { mergeJobId: job.id }
      });

      if (functionError) {
        throw functionError;
      }

      // Poll for job completion
      let attempts = 0;
      const maxAttempts = 60; // 60 seconds max
      
      const pollInterval = setInterval(async () => {
        attempts++;
        
        const { data: updatedJob } = await supabase
          .from('merge_jobs')
          .select('*')
          .eq('id', job.id)
          .single();

        if (updatedJob?.status === 'complete') {
          clearInterval(pollInterval);
          toast({
            title: "PDF generated successfully",
            description: `${updatedJob.processed_pages} pages created`,
          });
          onJobCreated();
          setGenerating(false);
        } else if (updatedJob?.status === 'error') {
          clearInterval(pollInterval);
          toast({
            title: "PDF generation failed",
            description: updatedJob.error_message || "An error occurred",
            variant: "destructive",
          });
          setGenerating(false);
        } else if (attempts >= maxAttempts) {
          clearInterval(pollInterval);
          toast({
            title: "Generation timeout",
            description: "The process is taking longer than expected. Check back later.",
            variant: "destructive",
          });
          setGenerating(false);
        }
      }, 1000);

    } catch (error: any) {
      console.error('Generate error:', error);
      toast({
        title: "Failed to start generation",
        description: error.message,
        variant: "destructive",
      });
      setGenerating(false);
    }
  };

  if (dataSources.length === 0 || templates.length === 0) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          {dataSources.length === 0 
            ? "Please upload a data source first"
            : "Please create a template first"}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Generate PDFs</CardTitle>
        <CardDescription>
          Select a data source and template to generate your documents
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="data-source">Data Source</Label>
            <Select value={selectedDataSource} onValueChange={setSelectedDataSource}>
              <SelectTrigger id="data-source">
                <SelectValue placeholder="Select data source" />
              </SelectTrigger>
              <SelectContent>
                {dataSources.map(ds => (
                  <SelectItem key={ds.id} value={ds.id}>
                    {ds.file_url?.split('/').pop()?.replace(/^\d+_/, '') || 'Unknown'} ({ds.row_count} rows)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="template">Template</Label>
            <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
              <SelectTrigger id="template">
                <SelectValue placeholder="Select template" />
              </SelectTrigger>
              <SelectContent>
                {templates.map(t => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {selectedDataSource && selectedTemplate && !hasMapping && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              No field mapping exists for this combination. Please create one in the Field Mappings tab.
            </AlertDescription>
          </Alert>
        )}

        <Button
          onClick={handleGenerate}
          disabled={!canGenerate || !hasMapping || generating}
          className="w-full"
          size="lg"
        >
          {generating ? (
            <>
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              Generating PDFs...
            </>
          ) : (
            <>
              <Rocket className="h-5 w-5 mr-2" />
              Generate PDFs
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
