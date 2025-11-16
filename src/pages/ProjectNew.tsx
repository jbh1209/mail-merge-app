import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Wand2, Zap } from "lucide-react";
import ProjectCreationWizard from "@/components/ProjectCreationWizard";

const projectTypes = [
  { value: "label", label: "Labels" },
  { value: "certificate", label: "Certificates" },
  { value: "card", label: "Cards" },
  { value: "shelf_strip", label: "Shelf Strips" },
  { value: "badge", label: "Badges" },
  { value: "custom", label: "Custom" },
];

type FormData = {
  name: string;
  description: string;
  project_type: string;
};

export default function ProjectNew() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormData>();
  const projectType = watch("project_type");

  useEffect(() => {
    const fetchUserData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        const { data: profile } = await supabase
          .from("profiles")
          .select("workspace_id")
          .eq("id", user.id)
          .single();
        setWorkspaceId(profile?.workspace_id || null);
      }
    };
    fetchUserData();
  }, []);

  const onSubmit = async (data: FormData) => {
    if (!userId || !workspaceId) {
      toast.error("User or workspace not found");
      return;
    }

    setLoading(true);
    const { data: project, error } = await supabase
      .from("projects")
      .insert({
        name: data.name,
        description: data.description || null,
        project_type: data.project_type as any,
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
      toast.success("Project created successfully");
      navigate(`/projects/${project.id}`);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Create New Project</h1>
        <p className="text-muted-foreground">Start a new mail merge project</p>
      </div>

      <Tabs defaultValue="wizard" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="wizard" className="flex items-center gap-2">
            <Wand2 className="h-4 w-4" />
            Guided Wizard
            <span className="ml-1 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">Recommended</span>
          </TabsTrigger>
          <TabsTrigger value="quick" className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Quick Create
          </TabsTrigger>
        </TabsList>

        <TabsContent value="wizard" className="space-y-4 mt-6">
          <Card>
            <CardContent className="p-8">
              <div className="text-center space-y-4">
                <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                  <Wand2 className="w-8 h-8 text-primary" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-semibold">New to Mail Merge?</h3>
                  <p className="text-muted-foreground max-w-md mx-auto">
                    Our guided wizard will walk you through every step of creating your project. 
                    Perfect for first-time users!
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
                  <Button size="lg" onClick={() => setWizardOpen(true)}>
                    Start Wizard <Wand2 className="ml-2 h-4 w-4" />
                  </Button>
                  <Button 
                    size="lg" 
                    variant="outline" 
                    onClick={() => navigate("/projects")}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="quick" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Project Details</CardTitle>
              <CardDescription>Enter the basic information for your project</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="name">Project Name *</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Customer Mailing Labels"
                    {...register("name", { required: "Project name is required" })}
                  />
                  {errors.name && (
                    <p className="text-sm text-destructive">{errors.name.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="project_type">Project Type *</Label>
                  <Select
                    value={projectType}
                    onValueChange={(value) => setValue("project_type", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a project type" />
                    </SelectTrigger>
                    <SelectContent>
                      {projectTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.project_type && (
                    <p className="text-sm text-destructive">{errors.project_type.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Brief description of your project (optional)"
                    rows={4}
                    {...register("description")}
                  />
                </div>

                <div className="flex gap-4">
                  <Button type="submit" disabled={loading}>
                    {loading ? "Creating..." : "Create Project"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => navigate("/projects")}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ProjectCreationWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        userId={userId}
        workspaceId={workspaceId}
      />
    </div>
  );
}
