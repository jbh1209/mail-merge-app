import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, CreditCard, Tag, CheckCircle2, ArrowRight, ArrowLeft, Sparkles, Edit, LayoutGrid, BadgeCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { DataUpload } from "./DataUpload";
import { TemplateLibrary } from "./TemplateLibrary";
import { TemplateUpload } from "./TemplateUpload";
import { FieldMappingWizard } from "./FieldMappingWizard";
import { LabelSize } from "@/lib/avery-labels";
import { useSubscription } from "@/hooks/useSubscription";

const projectTypes = [
  { value: "label", label: "Labels", icon: Tag, description: "Address labels, shipping labels, product labels", examples: "Perfect for mailings, inventory, and organization" },
  { value: "certificate", label: "Certificates", icon: FileText, description: "Awards, diplomas, completion certificates", examples: "Great for events, courses, and recognition" },
  { value: "card", label: "Cards", icon: CreditCard, description: "Business cards, greeting cards, invitations", examples: "Ideal for networking and celebrations" },
  { value: "shelf_strip", label: "Shelf Strips", icon: LayoutGrid, description: "Retail pricing strips, product labels", examples: "Essential for retail and inventory display" },
  { value: "badge", label: "Badges", icon: BadgeCheck, description: "Name badges, event passes, ID cards", examples: "Perfect for conferences and events" },
  { value: "custom", label: "Custom", icon: Sparkles, description: "Any other type of mail merge project", examples: "For unique requirements and creative projects" },
];

interface ProjectCreationWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string | null;
  workspaceId: string | null;
}

interface WizardState {
  step: number;
  projectType: string | null;
  projectName: string;
  description: string;
  projectId: string | null;
  dataSourceId: string | null;
  dataColumns: string[];
  parsedData: any;
  templateId: string | null;
  templateFields: string[];
  fieldMappingsComplete: boolean;
}

const WIZARD_STEPS = [
  { id: 0, title: "Welcome", description: "Let's get started" },
  { id: 1, title: "Choose Type", description: "What will you create?" },
  { id: 2, title: "Project Details", description: "Name your project" },
  { id: 3, title: "Review", description: "Confirm details" },
  { id: 4, title: "Upload Data", description: "Add your spreadsheet" },
  { id: 5, title: "Choose Template", description: "Select your design" },
  { id: 6, title: "Map Fields", description: "Connect your data" },
  { id: 7, title: "All Set!", description: "Ready to merge" }
];

export default function ProjectCreationWizard({ open, onOpenChange, userId, workspaceId }: ProjectCreationWizardProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { data: subscription } = useSubscription(workspaceId || undefined);
  const subscriptionFeatures = subscription?.features;
  const [submitting, setSubmitting] = useState(false);
  
  const [wizardState, setWizardState] = useState<WizardState>({
    step: 0,
    projectType: null,
    projectName: "",
    description: "",
    projectId: null,
    dataSourceId: null,
    dataColumns: [],
    parsedData: null,
    templateId: null,
    templateFields: [],
    fieldMappingsComplete: false,
  });

  const handleNext = () => setWizardState(prev => ({ ...prev, step: prev.step + 1 }));
  const handleBack = () => setWizardState(prev => ({ ...prev, step: prev.step - 1 }));
  const handleClose = () => {
    setWizardState({ step: 0, projectType: null, projectName: "", description: "", projectId: null, dataSourceId: null, dataColumns: [], parsedData: null, templateId: null, templateFields: [], fieldMappingsComplete: false });
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    if (!wizardState.projectType || !wizardState.projectName.trim()) {
      toast({ title: "Missing information", description: "Please complete all required fields", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.from("projects").insert([{
        name: wizardState.projectName, 
        description: wizardState.description || null, 
        project_type: wizardState.projectType as "label" | "certificate" | "card" | "shelf_strip" | "badge" | "custom",
        created_by: userId!, 
        workspace_id: workspaceId!, 
        status: "draft"
      }]).select().single();
      if (error) throw error;
      toast({ title: "Project created!", description: "Now let's set up your data and template" });
      setWizardState(prev => ({ ...prev, projectId: data.id, step: 4 }));
    } catch (error: any) {
      toast({ title: "Error creating project", description: error.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const selectedType = projectTypes.find(t => t.value === wizardState.projectType);
  const canProceed = () => {
    switch (wizardState.step) {
      case 1: return !!wizardState.projectType;
      case 2: return !!wizardState.projectName.trim();
      default: return true;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Project</DialogTitle>
          <DialogDescription>{wizardState.step < 7 ? "Follow the steps to set up your mail merge project" : "Your project is ready!"}</DialogDescription>
        </DialogHeader>
        
        {wizardState.step < 7 && (
          <div className="space-y-3 mb-4">
            <div className="flex items-center justify-between gap-1">
              {WIZARD_STEPS.slice(0, -1).map((stepConfig, idx) => (
                <div key={idx} className="flex items-center flex-1">
                  <div className={cn("flex items-center justify-center w-8 h-8 rounded-full text-xs font-semibold transition-all",
                    wizardState.step === idx ? "bg-primary text-primary-foreground scale-110" : wizardState.step > idx ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground")}>
                    {wizardState.step > idx ? <CheckCircle2 className="h-4 w-4" /> : idx + 1}
                  </div>
                  {idx < WIZARD_STEPS.length - 2 && <div className={cn("flex-1 h-1 mx-2 rounded-full transition-colors", wizardState.step > idx ? "bg-primary" : "bg-muted")} />}
                </div>
              ))}
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">{WIZARD_STEPS[wizardState.step].title}</p>
              <p className="text-xs text-muted-foreground">Step {wizardState.step + 1} of {WIZARD_STEPS.length - 1}</p>
            </div>
          </div>
        )}

        {wizardState.step === 0 && (
          <div className="space-y-6 py-6">
            <div className="text-center space-y-4">
              <div className="mx-auto w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center">
                <Sparkles className="w-10 h-10 text-primary" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-semibold">Welcome to Project Creation</h3>
                <p className="text-muted-foreground max-w-md mx-auto">
                  This wizard will guide you through creating your mail merge project. 
                  We'll help you choose the right type, set up your details, and get you ready to merge.
                </p>
              </div>
            </div>
            <div className="flex justify-center">
              <Button size="lg" onClick={handleNext}>
                Get Started <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {wizardState.step === 1 && (
          <div className="space-y-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {projectTypes.map((type) => {
                const Icon = type.icon;
                return (
                  <Card
                    key={type.value}
                    className={cn(
                      "cursor-pointer transition-all hover:border-primary hover:shadow-md",
                      wizardState.projectType === type.value && "border-primary ring-2 ring-primary/20"
                    )}
                    onClick={() => setWizardState(prev => ({ ...prev, projectType: type.value }))}
                  >
                    <CardContent className="p-6 text-center space-y-3">
                      <Icon className="h-12 w-12 mx-auto text-primary" />
                      <h3 className="font-semibold text-lg">{type.label}</h3>
                      <p className="text-sm text-muted-foreground">
                        {type.description}
                      </p>
                      <p className="text-xs text-muted-foreground italic">
                        {type.examples}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {wizardState.step === 2 && (
          <div className="space-y-6 py-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="wizard-name">Project Name *</Label>
                <Input
                  id="wizard-name"
                  placeholder="e.g., Customer Holiday Cards 2024"
                  value={wizardState.projectName}
                  onChange={(e) => setWizardState(prev => ({ ...prev, projectName: e.target.value }))}
                />
                <p className="text-sm text-muted-foreground">
                  Give your project a meaningful name you'll recognize later
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="wizard-description">Description (Optional)</Label>
                <Textarea
                  id="wizard-description"
                  placeholder="Add any notes about this project..."
                  rows={4}
                  value={wizardState.description}
                  onChange={(e) => setWizardState(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>
            </div>
          </div>
        )}

        {wizardState.step === 3 && (
          <div className="space-y-6 py-4">
            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1 flex-1">
                    <Label className="text-muted-foreground text-sm">Project Name</Label>
                    <p className="font-semibold text-lg">{wizardState.projectName}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setWizardState(prev => ({ ...prev, step: 2 }))}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                </div>

                <div className="flex items-start justify-between pt-4 border-t">
                  <div className="space-y-1 flex-1">
                    <Label className="text-muted-foreground text-sm">Project Type</Label>
                    <div className="flex items-center gap-2">
                      {selectedType && (
                        <>
                          <selectedType.icon className="h-5 w-5 text-primary" />
                          <p className="font-semibold">{selectedType.label}</p>
                        </>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setWizardState(prev => ({ ...prev, step: 1 }))}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                </div>

                {wizardState.description && (
                  <div className="flex items-start justify-between pt-4 border-t">
                    <div className="space-y-1 flex-1">
                      <Label className="text-muted-foreground text-sm">Description</Label>
                      <p className="text-sm">{wizardState.description}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setWizardState(prev => ({ ...prev, step: 2 }))}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {wizardState.step === 4 && wizardState.projectId && (
          <DataUpload
            projectId={wizardState.projectId}
            workspaceId={workspaceId as string}
            onUploadComplete={(result) => {
              setWizardState(prev => ({
                ...prev,
                step: 5,
                dataSourceId: result.filePath,
                dataColumns: result.columns,
                parsedData: result.preview,
              }));
            }}
          />
        )}

        {wizardState.step === 5 && wizardState.projectId && wizardState.dataColumns.length > 0 && (
          <div className="space-y-4">
            <Tabs defaultValue="library" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="library">Template Library</TabsTrigger>
                <TabsTrigger value="upload">Upload Template</TabsTrigger>
              </TabsList>
              <TabsContent value="library" className="space-y-4 mt-4">
                <TemplateLibrary
                  selectedId={wizardState.templateId}
                  onSelect={(template: LabelSize) => {
                    setWizardState(prev => ({
                      ...prev,
                      templateId: template.id,
                      templateFields: [], // Clear existing fields
                      step: 6, // Move to field mapping
                    }));
                  }}
                />
              </TabsContent>
              <TabsContent value="upload" className="space-y-4 mt-4">
                <TemplateUpload
                  projectId={wizardState.projectId}
                  workspaceId={workspaceId as string}
                  onUploadComplete={() => {
                    // Refresh templates after upload
                    // You might need to fetch the new template ID and set it in wizardState
                    // For simplicity, let's just move to the next step
                    setWizardState(prev => ({ ...prev, step: 6 }));
                  }}
                />
              </TabsContent>
            </Tabs>
          </div>
        )}

        {wizardState.step === 6 && wizardState.projectId && wizardState.dataSourceId && wizardState.templateId && (
          <FieldMappingWizard
            projectId={wizardState.projectId}
            dataSourceId={wizardState.dataSourceId}
            templateId={wizardState.templateId}
            dataColumns={wizardState.dataColumns}
            templateFields={["field1", "field2", "field3"]} // Replace with actual template fields
            sampleData={wizardState.parsedData}
            subscriptionFeatures={subscriptionFeatures}
            onComplete={() => {
              setWizardState(prev => ({ ...prev, fieldMappingsComplete: true, step: 7 }));
            }}
            onCancel={() => setWizardState(prev => ({ ...prev, step: 5 }))}
          />
        )}

        {wizardState.step === 7 && (
          <div className="text-center py-12">
            <h2 className="text-2xl font-semibold mb-4">All Set!</h2>
            <p className="text-muted-foreground">
              You've completed all the steps. Your project is ready to go!
            </p>
            <Button onClick={() => navigate(`/projects/${wizardState.projectId}`)}>
              Go to Project
            </Button>
          </div>
        )}
        
        {wizardState.step < 7 && (
          <div className="flex justify-between gap-4 pt-6 border-t">
            <Button variant="outline" onClick={handleBack} disabled={wizardState.step === 0 || wizardState.step === 4}>
              <ArrowLeft className="mr-2 h-4 w-4" />Back
            </Button>
            <div className="flex gap-2">
              {wizardState.step < 4 && <Button variant="outline" onClick={handleClose}>Cancel</Button>}
              {wizardState.step === 4 && wizardState.dataSourceId && <Button onClick={() => setWizardState(prev => ({ ...prev, step: 5 }))}>Continue to Template<ArrowRight className="ml-2 h-4 w-4" /></Button>}
              {wizardState.step < 3 && <Button onClick={handleNext} disabled={!canProceed()}>Next<ArrowRight className="ml-2 h-4 w-4" /></Button>}
              {wizardState.step === 3 && <Button onClick={handleSubmit} disabled={submitting}>{submitting ? "Creating..." : "Create & Continue"}</Button>}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
