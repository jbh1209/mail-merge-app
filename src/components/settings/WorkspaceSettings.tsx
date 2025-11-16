import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export function WorkspaceSettings() {
  const [loading, setLoading] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");

  useEffect(() => {
    const loadWorkspace = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("workspace_id, workspaces(name)")
          .eq("id", user.id)
          .single();
        
        if (profile) {
          setWorkspaceId(profile.workspace_id || "");
          setWorkspaceName((profile.workspaces as any)?.name || "");
        }
      }
    };
    loadWorkspace();
  }, []);

  const handleUpdateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase
        .from("workspaces")
        .update({ name: workspaceName })
        .eq("id", workspaceId);

      if (error) throw error;

      toast.success("Workspace updated successfully");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Workspace Settings</h2>
        <p className="text-muted-foreground mt-1">
          Manage your workspace details
        </p>
      </div>

      <form onSubmit={handleUpdateWorkspace} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="workspaceName">Workspace Name</Label>
          <Input
            id="workspaceName"
            value={workspaceName}
            onChange={(e) => setWorkspaceName(e.target.value)}
            placeholder="Enter workspace name"
          />
        </div>

        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Changes
        </Button>
      </form>
    </div>
  );
}
