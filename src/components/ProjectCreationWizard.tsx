import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { 
  Tag, FileText, CreditCard, LayoutGrid, BadgeCheck, Sparkles, 
  CheckCircle2, ArrowRight, ArrowLeft, Edit
} from "lucide-react";

const projectTypes = [
  { 
    value: "label", 
    label: "Labels", 
    icon: Tag,
    description: "Address labels, shipping labels, product labels",
    examples: "Perfect for mailings, inventory, and organization"
  },
  { 
    value: "certificate", 
    label: "Certificates", 
    icon: FileText,
    description: "Awards, diplomas, completion certificates",
    examples: "Great for events, courses, and recognition"
  },
  { 
    value: "card", 
    label: "Cards", 
    icon: CreditCard,
    description: "Business cards, greeting cards, invitations",
    examples: "Ideal for networking and celebrations"
  },
  { 
    value: "shelf_strip", 
    label: "Shelf Strips", 
    icon: LayoutGrid,
    description: "Retail pricing strips, product labels",
    examples: "Essential for retail and inventory display"
  },
  { 
    value: "badge", 
    label: "Badges", 
    icon: BadgeCheck,
    description: "Name badges, event passes, ID cards",
    examples: "Perfect for conferences and events"
  },
  { 
    value: "custom", 
    label: "Custom", 
    icon: Sparkles,
    description: "Any other type of mail merge project",
    examples: "For unique requirements and creative projects"
  },
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
}

export default function ProjectCreationWizard({ 
  open, 
  onOpenChange, 
  userId, 
  workspaceId 
}: ProjectCreationWizardProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [wizardState, setWizardState] = useState<WizardState>({
    step: 0,
    projectType: null,
    projectName: "",
    description: ""
  });

  const totalSteps = 4;

  const handleNext = () => {
    if (wizardState.step === 1 && !wizardState.projectType) {
      toast.error("Please select a project type");
      return;
    }
    if (wizardState.step === 2 && !wizardState.projectName.trim()) {
      toast.error("Please enter a project name");
      return;
    }
    setWizardState(prev => ({ ...prev, step: prev.step + 1 }));
  };

  const handleBack = () => {
    setWizardState(prev => ({ ...prev, step: prev.step - 1 }));
  };

  const handleClose = () => {
    setWizardState({
      step: 0,
      projectType: null,
      projectName: "",
      description: ""
    });
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    if (!userId || !workspaceId) {
      toast.error("User or workspace not found");
      return;
    }

    setLoading(true);
    const { data: project, error } = await supabase
      .from("projects")
      .insert({
        name: wizardState.projectName,
        description: wizardState.description || null,
        project_type: wizardState.projectType as any,
        workspace_id: workspaceId,
        created_by: userId,
        status: "draft",
      })
      .select()
      .single();

    setLoading(false);

    if (error) {
      toast.error("Failed to create project");
    } else {
      setWizardState(prev => ({ ...prev, step: 4 }));
      setTimeout(() => {
        handleClose();
        navigate(`/projects/${project.id}`);
      }, 2000);
    }
  };

  const selectedType = projectTypes.find(t => t.value === wizardState.projectType);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {wizardState.step === 0 && "Create Your Project"}
            {wizardState.step === 1 && "Choose Project Type"}
            {wizardState.step === 2 && "Project Details"}
            {wizardState.step === 3 && "Review & Confirm"}
            {wizardState.step === 4 && "Success!"}
          </DialogTitle>
          <DialogDescription>
            {wizardState.step === 0 && "Let's get your mail merge project set up in just a few steps"}
            {wizardState.step === 1 && "What type of documents will you be creating?"}
            {wizardState.step === 2 && "Tell us about your project"}
            {wizardState.step === 3 && "Review your project details before creating"}
            {wizardState.step === 4 && "Your project has been created successfully"}
          </DialogDescription>
        </DialogHeader>

        {/* Step Indicator */}
        {wizardState.step < 4 && (
          <div className="flex items-center justify-center gap-2 my-4">
            {[0, 1, 2, 3].map((s) => (
              <div key={s} className="flex items-center">
                <div className={cn(
                  "h-2 w-2 rounded-full transition-all",
                  wizardState.step === s ? "bg-primary scale-150" : "bg-muted"
                )} />
                {s < 3 && (
                  <div className={cn(
                    "h-0.5 w-8 mx-1 transition-colors",
                    wizardState.step > s ? "bg-primary" : "bg-muted"
                  )} />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Step 0: Welcome */}
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

        {/* Step 1: Project Type Selection */}
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

        {/* Step 2: Project Details */}
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

        {/* Step 3: Review */}
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

        {/* Step 4: Success */}
        {wizardState.step === 4 && (
          <div className="space-y-6 py-6">
            <div className="text-center space-y-4">
              <div className="mx-auto w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center animate-scale-in">
                <CheckCircle2 className="w-10 h-10 text-green-500" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-semibold">Project Created!</h3>
                <p className="text-muted-foreground">
                  Your project has been set up successfully
                </p>
              </div>
            </div>
            <Card className="bg-muted/50">
              <CardContent className="p-6 space-y-3">
                <h4 className="font-semibold">What's Next?</h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                    Upload your data file (Excel or CSV)
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                    Choose or upload a template
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                    Map your fields and generate PDFs
                  </li>
                </ul>
              </CardContent>
            </Card>
            <p className="text-center text-sm text-muted-foreground">
              Redirecting to your project...
            </p>
          </div>
        )}

        {/* Navigation Buttons */}
        {wizardState.step > 0 && wizardState.step < 4 && (
          <div className="flex items-center justify-between gap-4 pt-4 border-t">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={loading}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            
            <div className="flex gap-2">
              <Button variant="ghost" onClick={handleClose} disabled={loading}>
                Cancel
              </Button>
              {wizardState.step < 3 ? (
                <Button onClick={handleNext}>
                  Next <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <Button onClick={handleSubmit} disabled={loading}>
                  {loading ? "Creating..." : "Create Project"}
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
