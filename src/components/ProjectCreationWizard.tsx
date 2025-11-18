import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, CreditCard, Tag, CheckCircle2, ArrowRight, ArrowLeft, Sparkles, Edit, LayoutGrid, BadgeCheck, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { DataUpload } from "./DataUpload";
import { DataReviewStep } from "./wizard/DataReviewStep";
import { TemplateLibrary } from "./TemplateLibrary";
import { TemplateUpload } from "./TemplateUpload";
import { FieldMappingWizard } from "./FieldMappingWizard";
import { TemplateDesignCanvas } from "./TemplateDesignCanvas";
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
  dataReviewComplete: boolean;
  aiAnalysisResult: any;
  templateId: string | null;
  templateFields: string[];
  templateSize: { width: number; height: number } | null;
  templateName: string;
  fieldMappingsComplete: boolean;
  designConfig: any;
}

const WIZARD_STEPS = [
  { id: 0, title: "Welcome", description: "Let's get started" },
  { id: 1, title: "Choose Type", description: "What will you create?" },
  { id: 2, title: "Project Details", description: "Name your project" },
  { id: 3, title: "Review", description: "Confirm details" },
  { id: 4, title: "Upload Data", description: "Add your spreadsheet" },
  { id: 4.5, title: "Review Data", description: "Validate & clean" },
  { id: 5, title: "Choose Template", description: "Select your design" },
  { id: 6, title: "Map Fields", description: "Connect your data" },
  { id: 6.5, title: "Design Layout", description: "Position your fields" },
  { id: 7, title: "All Set!", description: "Ready to merge" }
];

// Helper function to extract template fields from a LabelSize template
const extractTemplateFields = (template: LabelSize): string[] => {
  const commonFields: Record<string, string[]> = {
    'address': ['name', 'address_line_1', 'address_line_2', 'city', 'state', 'zip'],
    'shipping': ['recipient_name', 'company', 'address', 'city', 'state', 'zip', 'country'],
    'mailing': ['first_name', 'last_name', 'address', 'city', 'state', 'zip'],
    'product': ['product_name', 'sku', 'price', 'barcode'],
    'file-folder': ['name', 'category', 'date'],
    'name-badge': ['name', 'title', 'company'],
    'default': ['field_1', 'field_2', 'field_3', 'field_4']
  };
  
  const category = template.category?.toLowerCase() || 'default';
  
  if (template.useCase?.toLowerCase().includes('address')) {
    return commonFields['address'];
  } else if (template.useCase?.toLowerCase().includes('shipping')) {
    return commonFields['shipping'];
  } else if (template.useCase?.toLowerCase().includes('product')) {
    return commonFields['product'];
  } else if (category.includes('file') || category.includes('folder')) {
    return commonFields['file-folder'];
  } else if (category.includes('badge') || category.includes('name')) {
    return commonFields['name-badge'];
  }
  
  return commonFields['default'];
};

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
    dataReviewComplete: false,
    aiAnalysisResult: null,
    templateId: null,
    templateFields: [],
    templateSize: null,
    templateName: "",
    fieldMappingsComplete: false,
    designConfig: null,
  });

  const handleNext = () => setWizardState(prev => ({ ...prev, step: prev.step + 1 }));
  const handleBack = () => setWizardState(prev => ({ ...prev, step: prev.step - 1 }));
  const handleClose = () => {
    setWizardState({ 
      step: 0, 
      projectType: null, 
      projectName: "", 
      description: "", 
      projectId: null, 
      dataSourceId: null, 
      dataColumns: [], 
      parsedData: null,
      dataReviewComplete: false,
      aiAnalysisResult: null,
      templateId: null, 
      templateFields: [],
      templateSize: null,
      templateName: "",
      fieldMappingsComplete: false,
      designConfig: null,
    });
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
      <DialogContent className={cn(
        wizardState.step === 6.5 
          ? "w-[95vw] max-w-none h-[95vh] p-2 overflow-auto" 
          : "w-[90vw] max-w-7xl h-[90vh] max-h-[90vh] overflow-y-auto p-4 sm:p-6"
      )}>
        {wizardState.step !== 6.5 && (
          <DialogHeader>
            <DialogTitle className="text-xl sm:text-2xl">Create New Project</DialogTitle>
            <DialogDescription className="text-sm sm:text-base">{wizardState.step < 7 ? "Follow the steps to set up your mail merge project" : "Your project is ready!"}</DialogDescription>
          </DialogHeader>
        )}
        
        {wizardState.step < 7 && wizardState.step !== 6.5 && (
          <div className="space-y-3 mb-4 sm:mb-6">
            <div className="flex items-center justify-between gap-1">
              {WIZARD_STEPS.slice(0, -1).map((stepConfig, idx) => (
                <div key={idx} className="flex items-center flex-1">
                  <div className={cn("flex items-center justify-center w-6 h-6 sm:w-8 sm:h-8 rounded-full text-xs font-semibold transition-all",
                    wizardState.step === stepConfig.id ? "bg-primary text-primary-foreground scale-110" : wizardState.step > stepConfig.id ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground")}>
                    {wizardState.step > stepConfig.id ? <CheckCircle2 className="h-3 w-3 sm:h-4 sm:w-4" /> : <span className="hidden sm:inline">{idx + 1}</span>}
                  </div>
                  {idx < WIZARD_STEPS.length - 2 && <div className={cn("flex-1 h-0.5 sm:h-1 mx-1 sm:mx-2 rounded-full transition-colors", wizardState.step > stepConfig.id ? "bg-primary" : "bg-muted")} />}
                </div>
              ))}
            </div>
            <div className="text-center">
              <p className="text-xs sm:text-sm font-medium">{WIZARD_STEPS.find(s => s.id === wizardState.step)?.title || 'Current Step'}</p>
              <p className="text-xs text-muted-foreground">Step {WIZARD_STEPS.findIndex(s => s.id === wizardState.step) + 1} of {WIZARD_STEPS.length - 1}</p>
            </div>
          </div>
        )}

        {wizardState.step === 0 && (
          <div className="space-y-6 py-6 sm:py-8">
            <div className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 sm:w-20 sm:h-20 bg-primary/10 rounded-full flex items-center justify-center">
                <Sparkles className="w-8 h-8 sm:w-10 sm:h-10 text-primary" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg sm:text-xl font-semibold">Welcome to Project Creation</h3>
                <p className="text-sm sm:text-base text-muted-foreground max-w-md mx-auto px-4">
                  This wizard will guide you through creating your mail merge project. 
                  We'll help you choose the right type, set up your details, and get you ready to merge.
                </p>
              </div>
            </div>
            <div className="flex justify-center px-4">
              <Button size="lg" onClick={handleNext} className="w-full sm:w-auto">
                Get Started <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {wizardState.step === 1 && (
          <div className="space-y-6 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
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
                    <CardContent className="p-4 sm:p-6 text-center space-y-2 sm:space-y-3">
                      <Icon className="h-10 w-10 sm:h-12 sm:w-12 mx-auto text-primary" />
                      <h3 className="font-semibold text-base sm:text-lg">{type.label}</h3>
                      <p className="text-xs sm:text-sm text-muted-foreground">
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
          <div className="space-y-6 py-4 px-4">
            <Card>
              <CardContent className="p-4 sm:p-6 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1 flex-1">
                    <Label className="text-muted-foreground text-xs sm:text-sm">Project Name</Label>
                    <p className="font-semibold text-base sm:text-lg">{wizardState.projectName}</p>
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
                    <Label className="text-muted-foreground text-xs sm:text-sm">Project Type</Label>
                    <div className="flex items-center gap-2">
                      {selectedType && (
                        <>
                          <selectedType.icon className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                          <p className="font-semibold text-sm sm:text-base">{selectedType.label}</p>
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
                      <Label className="text-muted-foreground text-xs sm:text-sm">Description</Label>
                      <p className="text-xs sm:text-sm">{wizardState.description}</p>
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
            onUploadComplete={async (result) => {
              try {
                const { data: dataSource, error } = await supabase
                  .from("data_sources")
                  .insert([{
                    project_id: wizardState.projectId,
                    workspace_id: workspaceId,
                    source_type: result.fileName.endsWith('.csv') ? 'csv' : 'excel',
                    file_url: result.filePath,
                    row_count: result.rowCount,
                    parsed_fields: {
                      columns: result.columns,
                      preview: result.preview
                    }
                  }])
                  .select()
                  .single();
                
                if (error) throw error;
                
                setWizardState(prev => ({
                  ...prev,
                  step: 4.5,
                  dataSourceId: dataSource.id,
                  dataColumns: result.columns,
                  parsedData: result,
                }));
                
                toast({ title: "Data uploaded and saved!" });
              } catch (error) {
                console.error("Error saving data source:", error);
                toast({ title: "Failed to save data source", variant: "destructive" });
              }
            }}
          />
        )}

        {wizardState.step === 4.5 && wizardState.projectId && wizardState.dataSourceId && wizardState.parsedData && (
          <DataReviewStep
            projectId={wizardState.projectId}
            workspaceId={workspaceId!}
            dataSourceId={wizardState.dataSourceId}
            parsedData={wizardState.parsedData}
            subscriptionFeatures={{
              canUseAICleaning: subscriptionFeatures?.canUseAICleaning || false,
              hasAdvancedAI: subscriptionFeatures?.hasAdvancedAI || false,
            }}
            onComplete={(updatedData) => {
              setWizardState(prev => ({
                ...prev,
                step: 5,
                dataReviewComplete: true,
                dataColumns: updatedData.columns || prev.dataColumns,
                parsedData: updatedData.parsedData || prev.parsedData, // Use transformed data with corrected column names
                aiAnalysisResult: updatedData.analysis,
              }));
            }}
            onBack={() => setWizardState(prev => ({ ...prev, step: 4 }))}
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
                  onSelect={async (template: LabelSize) => {
                    try {
                      const defaultTemplateFields = extractTemplateFields(template);
                      const dataColumns = wizardState.dataColumns || [];
                      // Use data columns if we have more columns than the default template fields
                      const templateFields = dataColumns.length > defaultTemplateFields.length 
                        ? dataColumns.slice(0, 20) 
                        : defaultTemplateFields;
                      
                      const { data: savedTemplate, error } = await supabase
                        .from("templates")
                        .insert([{
                          project_id: wizardState.projectId,
                          workspace_id: workspaceId,
                          name: template.name,
                          template_type: 'built_in_library',
                          width_mm: template.width_mm,
                          height_mm: template.height_mm,
                          design_config: {
                            baseTemplate: template.id,
                            averyCode: template.averyCode,
                            labelsPerSheet: template.labelsPerSheet,
                            category: template.category,
                            description: template.description
                          },
                          is_public: false
                        }])
                        .select()
                        .single();
                      
                      if (error) throw error;
                      
                      setWizardState(prev => ({
                        ...prev,
                        templateId: savedTemplate.id,
                        templateFields: templateFields,
                        templateSize: { width: template.width_mm, height: template.height_mm },
                        templateName: template.name,
                        step: 6,
                      }));
                      
                      toast({ title: "Template selected and saved!" });
                    } catch (error) {
                      console.error("Error saving template:", error);
                      toast({ title: "Failed to save template", variant: "destructive" });
                    }
                  }}
                />
              </TabsContent>
              <TabsContent value="upload" className="space-y-4 mt-4">
                <TemplateUpload
                  projectId={wizardState.projectId}
                  workspaceId={workspaceId as string}
                  onUploadComplete={(uploadedTemplate) => {
                    const template = uploadedTemplate as any; // Type assertion for uploaded template
                    const dataColumns = wizardState.dataColumns || [];
                    // Use data columns as default fields for uploaded templates, or fallback to template fields or generic
                    const templateFields = dataColumns.length > 0 
                      ? dataColumns.slice(0, 20)
                      : (template.fields || ['field_1', 'field_2', 'field_3']);
                    
                    setWizardState(prev => ({
                      ...prev,
                      templateId: template.id,
                      templateFields: templateFields,
                      templateSize: { 
                        width: template.width_mm || 100, 
                        height: template.height_mm || 50 
                      },
                      templateName: template.name || 'Uploaded Template',
                      step: 6
                    }));
                    toast({ title: "Template uploaded!" });
                  }}
                />
              </TabsContent>
            </Tabs>
          </div>
        )}

        {wizardState.step === 6 && 
         wizardState.projectId && 
         wizardState.dataSourceId && 
         wizardState.templateId && 
         wizardState.templateFields.length > 0 ? (
          <FieldMappingWizard
            projectId={wizardState.projectId}
            dataSourceId={wizardState.dataSourceId}
            templateId={wizardState.templateId}
            dataColumns={wizardState.dataColumns}
            templateFields={wizardState.templateFields}
            sampleData={wizardState.parsedData?.preview || []}
            subscriptionFeatures={subscriptionFeatures}
            onComplete={() => {
              setWizardState(prev => ({ ...prev, fieldMappingsComplete: true, step: 6.5 }));
            }}
            onCancel={() => setWizardState(prev => ({ ...prev, step: 5 }))}
          />
        ) : wizardState.step === 6 && (
          <div className="text-center py-8">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              Missing required data. Please go back and complete previous steps.
            </p>
            <Button 
              variant="outline" 
              onClick={() => setWizardState(prev => ({ ...prev, step: 5 }))}
              className="mt-4"
            >
              Go Back
            </Button>
          </div>
        )}

        {/* Step 6.5: Canvas Design - Maximized View */}
        {wizardState.step === 6.5 && 
         wizardState.templateSize && 
         wizardState.templateFields.length > 0 && 
         wizardState.templateId ? (
          <div className="flex flex-col h-full">
            <TemplateDesignCanvas
              templateSize={wizardState.templateSize}
              templateName={wizardState.templateName}
              fieldNames={wizardState.templateFields}
              sampleData={wizardState.parsedData?.preview || []}
              stepInfo={{ current: 9, total: 9 }}
              onSave={async (designConfig) => {
              try {
                // Update template with design config
                const { error } = await supabase
                  .from('templates')
                  .update({ 
                    design_config: {
                      ...wizardState.designConfig,
                      ...designConfig
                    }
                  })
                  .eq('id', wizardState.templateId);

                if (error) throw error;

                setWizardState(prev => ({ 
                  ...prev, 
                  designConfig,
                  step: 7 
                }));
                
                toast({ title: "Design saved successfully!" });
              } catch (error) {
                console.error("Error saving design:", error);
                toast({ title: "Failed to save design", variant: "destructive" });
              }
            }}
            onCancel={() => setWizardState(prev => ({ ...prev, step: 6 }))}
          />
          </div>
        ) : wizardState.step === 6.5 ? (
          <div className="text-center py-8">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              Missing template data. Please go back and select a template.
            </p>
            <Button 
              variant="outline" 
              onClick={() => setWizardState(prev => ({ ...prev, step: 5 }))}
              className="mt-4"
            >
              Go Back
            </Button>
          </div>
        ) : null}

        {wizardState.step === 7 && (
          <div className="space-y-6 py-6 sm:py-8 px-4">
            <div className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 sm:w-20 sm:h-20 bg-green-500/10 rounded-full flex items-center justify-center animate-scale-in">
                <CheckCircle2 className="w-8 h-8 sm:w-10 sm:h-10 text-green-500" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg sm:text-xl font-semibold">You're All Set!</h3>
                <p className="text-sm sm:text-base text-muted-foreground">
                  Your project is ready. You can now generate your mail merge documents.
                </p>
              </div>
            </div>
            
            <Card>
              <CardContent className="p-4 sm:p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm sm:text-base">{wizardState.projectName}</p>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      {selectedType?.label} project
                    </p>
                  </div>
                </div>
                
                <div className="grid grid-cols-3 gap-2 sm:gap-4 pt-4 border-t">
                  <div className="text-center">
                    <p className="text-xl sm:text-2xl font-bold text-primary">
                      {wizardState.parsedData?.rowCount || 0}
                    </p>
                    <p className="text-xs text-muted-foreground">Records</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xl sm:text-2xl font-bold text-primary">
                      {wizardState.dataColumns?.length || 0}
                    </p>
                    <p className="text-xs text-muted-foreground">Fields</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xl sm:text-2xl font-bold text-primary">
                      {wizardState.templateFields?.length || 0}
                    </p>
                    <p className="text-xs text-muted-foreground">Mappings</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="p-4 sm:p-6 space-y-3">
                <h4 className="font-semibold flex items-center gap-2 text-sm sm:text-base">
                  <Sparkles className="h-4 w-4 text-primary" />
                  What's Next?
                </h4>
                <ul className="space-y-2 text-xs sm:text-sm">
                  <li className="flex items-start gap-2">
                    <ArrowRight className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <span>Generate your first batch of PDFs</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <ArrowRight className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <span>Download individually or as a bulk ZIP file</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <ArrowRight className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <span>Update your data or template anytime</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
            
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                size="lg"
                className="flex-1"
                onClick={() => {
                  handleClose();
                  navigate(`/projects/${wizardState.projectId}`);
                }}
              >
                Go to Project
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="flex-1 sm:flex-initial"
                onClick={() => {
                  handleClose();
                  navigate('/projects');
                }}
              >
                View All Projects
              </Button>
            </div>
          </div>
        )}
        
        {wizardState.step < 7 && (
          <div className="flex flex-col sm:flex-row justify-between gap-3 sm:gap-4 pt-6 border-t">
            <Button variant="outline" onClick={handleBack} disabled={wizardState.step === 0 || wizardState.step === 4} className="w-full sm:w-auto">
              <ArrowLeft className="mr-2 h-4 w-4" />Back
            </Button>
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-2">
              {wizardState.step < 4 && <Button variant="outline" onClick={handleClose} className="w-full sm:w-auto">Cancel</Button>}
              {wizardState.step === 4 && wizardState.dataSourceId && <Button onClick={() => setWizardState(prev => ({ ...prev, step: 5 }))} className="w-full sm:w-auto">Continue to Template<ArrowRight className="ml-2 h-4 w-4" /></Button>}
              {wizardState.step < 3 && <Button onClick={handleNext} disabled={!canProceed()} className="w-full sm:w-auto">Next<ArrowRight className="ml-2 h-4 w-4" /></Button>}
              {wizardState.step === 3 && <Button onClick={handleSubmit} disabled={submitting} className="w-full sm:w-auto">{submitting ? "Creating..." : "Create & Continue"}</Button>}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
