import { useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { TemplateLibrary } from "./TemplateLibrary";
import { TemplateUpload } from "./TemplateUpload";
import { LabelSize } from "@/lib/avery-labels";
import { ScopedAIChat } from "./ScopedAIChat";
import { useSubscription } from "@/hooks/useSubscription";

interface TemplateWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  workspaceId: string;
  onComplete: () => void;
}

export function TemplateWizard({ 
  open, 
  onOpenChange, 
  projectId, 
  workspaceId,
  onComplete 
}: TemplateWizardProps) {
  const [step, setStep] = useState<"select" | "customize">("select");
  const [sourceType, setSourceType] = useState<"library" | "upload">("library");
  const [selectedTemplate, setSelectedTemplate] = useState<LabelSize | null>(null);
  const [customWidth, setCustomWidth] = useState("");
  const [customHeight, setCustomHeight] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { data: subscription } = useSubscription(workspaceId);

  const handleTemplateSelect = (template: LabelSize) => {
    setSelectedTemplate(template);
    setCustomWidth(template.width_mm.toString());
    setCustomHeight(template.height_mm.toString());
    setTemplateName(template.name);
    
    // Auto-advance to customize step for non-custom templates
    if (template.category !== "custom") {
      setTimeout(() => setStep("customize"), 300);
    }
  };

  const handleSaveTemplate = async () => {
    if (!selectedTemplate || !templateName.trim()) {
      toast({
        title: "Missing information",
        description: "Please provide a template name",
        variant: "destructive",
      });
      return;
    }

    const width = parseFloat(customWidth);
    const height = parseFloat(customHeight);

    if (isNaN(width) || isNaN(height) || width <= 0 || height <= 0) {
      toast({
        title: "Invalid dimensions",
        description: "Please enter valid width and height values",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);

    try {
      const { error } = await supabase.from("templates").insert({
        project_id: projectId,
        workspace_id: workspaceId,
        name: templateName,
        template_type: "built_in_library",
        width_mm: width,
        height_mm: height,
        avery_part_number: selectedTemplate.averyCode || null,
        design_config: {
          baseTemplate: selectedTemplate.id,
          averyCode: selectedTemplate.averyCode,
          labelsPerSheet: selectedTemplate.labelsPerSheet,
          category: selectedTemplate.category
        },
        is_public: false
      });

      if (error) throw error;

      toast({
        title: "Template created",
        description: "Your template has been added to the project",
      });

      onComplete();
      handleClose();
    } catch (error: any) {
      console.error("Save error:", error);
      toast({
        title: "Failed to save template",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setStep("select");
    setSourceType("library");
    setSelectedTemplate(null);
    setCustomWidth("");
    setCustomHeight("");
    setTemplateName("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === "select" ? "Choose Template" : "Customize Template"}
          </DialogTitle>
          <DialogDescription>
            {step === "select" 
              ? "Select from our library of Avery labels and standard sizes, or upload your own template"
              : "Review and adjust the template dimensions"}
          </DialogDescription>
        </DialogHeader>

        {step === "select" && (
          <Tabs value={sourceType} onValueChange={(v) => setSourceType(v as any)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="library">Library</TabsTrigger>
              <TabsTrigger value="upload">Upload</TabsTrigger>
              <TabsTrigger value="help" className="gap-2">
                <Sparkles className="h-4 w-4" />
                Layout Help
              </TabsTrigger>
            </TabsList>

            <TabsContent value="library" className="mt-4">
              <TemplateLibrary 
                onSelect={handleTemplateSelect}
                selectedId={selectedTemplate?.id}
              />
            </TabsContent>

            <TabsContent value="upload" className="mt-4">
              <TemplateUpload
                projectId={projectId}
                workspaceId={workspaceId}
                onUploadComplete={() => {
                  onComplete();
                  handleClose();
                }}
              />
            </TabsContent>

            <TabsContent value="help" className="space-y-4">
              {subscription?.subscription_tier && subscription.subscription_tier !== 'starter' ? (
                <ScopedAIChat
                  persona="layout-assistant"
                  context={{
                    projectType: 'label',
                    templateName: selectedTemplate?.name,
                    width_mm: selectedTemplate?.width_mm,
                    height_mm: selectedTemplate?.height_mm,
                    labelsPerSheet: selectedTemplate?.labelsPerSheet,
                    category: selectedTemplate?.category
                  }}
                  maxHeight="h-[500px]"
                />
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Sparkles className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="mb-2">Layout Assistant requires Pro or Business plan</p>
                  <p className="text-sm">Upgrade to get AI-powered layout guidance</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}

        {step === "customize" && selectedTemplate && (
          <div className="space-y-6">
            <div className="rounded-lg bg-muted p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{selectedTemplate.name}</div>
                  {selectedTemplate.averyCode && (
                    <div className="text-sm text-muted-foreground">
                      Avery {selectedTemplate.averyCode}
                    </div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep("select")}
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Change
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="width">Width (mm)</Label>
                <Input
                  id="width"
                  type="number"
                  step="0.1"
                  value={customWidth}
                  onChange={(e) => setCustomWidth(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="height">Height (mm)</Label>
                <Input
                  id="height"
                  type="number"
                  step="0.1"
                  value={customHeight}
                  onChange={(e) => setCustomHeight(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Template Name</Label>
              <Input
                id="name"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g., Product Labels - Avery 5160"
              />
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setStep("select")}
                className="flex-1"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button
                onClick={handleSaveTemplate}
                disabled={saving}
                className="flex-1"
              >
                {saving ? (
                  "Saving..."
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Create Template
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
