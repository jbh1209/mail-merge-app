import { useEffect, useState, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, FolderKanban, FileText, Sparkles } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { TrialStatusBanner } from "@/components/TrialStatusBanner";
import { QuotaWarningModal } from "@/components/QuotaWarningModal";
import { QuotaExceededBanner } from "@/components/QuotaExceededBanner";

export default function Dashboard() {
  const [userId, setUserId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  // Sync subscription status from Stripe
  const syncSubscription = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      console.log('[Dashboard] Syncing subscription status...');
      const response = await supabase.functions.invoke('check-subscription');
      
      if (response.error) {
        console.error('[Dashboard] Subscription sync error:', response.error);
        return;
      }
      
      console.log('[Dashboard] Subscription synced:', response.data);
      // Refresh profile data to get updated subscription info
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    } catch (error) {
      console.error('[Dashboard] Failed to sync subscription:', error);
    }
  }, [queryClient]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserId(user?.id || null);
    });
  }, []);

  // Sync subscription on mount and after checkout redirect
  useEffect(() => {
    if (!userId) return;
    
    const isSuccess = searchParams.get('success') === 'true';
    
    // Always sync on mount, prioritize if coming from checkout
    syncSubscription();
    
    // Clear success param from URL
    if (isSuccess) {
      searchParams.delete('success');
      setSearchParams(searchParams, { replace: true });
    }
  }, [userId, searchParams, setSearchParams, syncSubscription]);

  const { data: profile } = useQuery({
    queryKey: ["profile", userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data } = await supabase
        .from("profiles")
        .select("*, workspaces(*)")
        .eq("id", userId)
        .single();
      return data;
    },
    enabled: !!userId,
  });

  const { data: projects } = useQuery({
    queryKey: ["projects", profile?.workspace_id],
    queryFn: async () => {
      if (!profile?.workspace_id) return [];
      const { data } = await supabase
        .from("projects")
        .select("*")
        .eq("workspace_id", profile.workspace_id)
        .order("created_at", { ascending: false })
        .limit(5);
      return data || [];
    },
    enabled: !!profile?.workspace_id,
  });

  const { data: recentJobs } = useQuery({
    queryKey: ["recent-jobs", profile?.workspace_id],
    queryFn: async () => {
      if (!profile?.workspace_id) return [];
      const { data } = await supabase
        .from("merge_jobs")
        .select("*, projects(name)")
        .eq("workspace_id", profile.workspace_id)
        .order("created_at", { ascending: false })
        .limit(5);
      return data || [];
    },
    enabled: !!profile?.workspace_id,
  });

  const workspace = profile?.workspaces;
  const usagePercentage = workspace
    ? (workspace.pages_used_this_month / workspace.pages_quota) * 100
    : 0;

  return (
    <div className="space-y-6">
      <QuotaWarningModal workspaceId={profile?.workspace_id} />
      
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Welcome back, {profile?.full_name || "User"}</p>
        </div>
        <Button asChild>
          <Link to="/projects/new">
            <Plus className="mr-2 h-4 w-4" />
            New Project
          </Link>
        </Button>
      </div>

      <TrialStatusBanner workspaceId={profile?.workspace_id} />
      <QuotaExceededBanner workspaceId={profile?.workspace_id} />

      {/* First-time user onboarding */}
      {projects && projects.length === 0 && (
        <Card className="border-primary/50 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Welcome to Mail Merge!
            </CardTitle>
            <CardDescription>
              Let's get you started with your first project
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold">1</div>
                <div>
                  <p className="font-medium">Create a Project</p>
                  <p className="text-sm text-muted-foreground">Choose a project type (labels, certificates, badges, etc.)</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground text-sm font-semibold">2</div>
                <div>
                  <p className="font-medium">Upload Your Data</p>
                  <p className="text-sm text-muted-foreground">Import a CSV or Excel file with your contact information</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground text-sm font-semibold">3</div>
                <div>
                  <p className="font-medium">Choose a Template</p>
                  <p className="text-sm text-muted-foreground">Select from our library or upload your own design</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground text-sm font-semibold">4</div>
                <div>
                  <p className="font-medium">Generate PDFs</p>
                  <p className="text-sm text-muted-foreground">Create personalized documents in seconds</p>
                </div>
              </div>
            </div>
            <Button asChild className="w-full">
              <Link to="/projects/new">
                <Plus className="mr-2 h-4 w-4" />
                Create Your First Project
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Usage This Month</CardTitle>
            <CardDescription>
              {workspace?.pages_used_this_month || 0} / {workspace?.pages_quota || 0} pages
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Progress value={usagePercentage} className="h-2" />
            <p className="text-xs text-muted-foreground mt-2">
              {workspace ? Math.round(100 - usagePercentage) : 0}% remaining
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Subscription</CardTitle>
            <CardDescription>Current plan</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <Badge variant="secondary" className="text-sm capitalize">
                {workspace?.subscription_tier || "starter"}
              </Badge>
              <p className="text-sm text-muted-foreground capitalize">
                {workspace?.subscription_status || "active"}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Total Projects</CardTitle>
            <CardDescription>Active projects</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{projects?.length || 0}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderKanban className="h-5 w-5" />
              Recent Projects
            </CardTitle>
          </CardHeader>
          <CardContent>
            {projects && projects.length > 0 ? (
              <div className="space-y-3">
                {projects.map((project) => (
                  <Link
                    key={project.id}
                    to={`/projects/${project.id}`}
                    className="block p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{project.name}</p>
                        <p className="text-sm text-muted-foreground capitalize">
                          {project.project_type.replace("_", " ")}
                        </p>
                      </div>
                      <Badge variant="outline" className="capitalize">
                        {project.status}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>No projects yet</p>
                <Button asChild variant="link" className="mt-2">
                  <Link to="/projects/new">Create your first project</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Recent Merge Jobs
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentJobs && recentJobs.length > 0 ? (
              <div className="space-y-3">
                {recentJobs.map((job) => (
                  <div
                    key={job.id}
                    className="p-3 rounded-lg border"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{job.projects?.name || "Unknown Project"}</p>
                        <p className="text-sm text-muted-foreground">
                          {job.processed_pages} / {job.total_pages} pages
                        </p>
                      </div>
                      <Badge 
                        variant={
                          job.status === "complete" ? "default" :
                          job.status === "processing" ? "secondary" :
                          job.status === "error" ? "destructive" : "outline"
                        }
                        className="capitalize"
                      >
                        {job.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>No merge jobs yet</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
