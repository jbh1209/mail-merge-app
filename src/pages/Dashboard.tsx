import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, FolderKanban, FileText } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

export default function Dashboard() {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserId(user?.id || null);
    });
  }, []);

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
