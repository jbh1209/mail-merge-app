import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminDataTable } from "@/components/admin/AdminDataTable";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Shield, ShieldOff } from "lucide-react";

export default function AdminUsers() {
  const queryClient = useQueryClient();

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*, workspaces(name), user_roles(role)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const toggleAdminMutation = useMutation({
    mutationFn: async ({ userId, isAdmin }: { userId: string; isAdmin: boolean }) => {
      if (isAdmin) {
        const { error } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", userId)
          .eq("role", "admin");
        if (error) throw error;
      } else {
        const { data: profile } = await supabase
          .from("profiles")
          .select("workspace_id")
          .eq("id", userId)
          .single();

        const { error } = await supabase.from("user_roles").insert({
          user_id: userId,
          role: "admin",
          workspace_id: profile?.workspace_id,
          granted_by: (await supabase.auth.getUser()).data.user?.id,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("Role updated successfully");
    },
  });

  const columns = [
    { header: "Name", accessor: "full_name" as const },
    { header: "Email", accessor: "id" as const },
    {
      header: "Workspace",
      accessor: (row: any) => row.workspaces?.name || "N/A",
    },
    {
      header: "Role",
      accessor: (row: any) => {
        const isAdmin = row.user_roles?.some((r: any) => r.role === "admin");
        return (
          <Badge variant={isAdmin ? "destructive" : "secondary"}>
            {isAdmin ? "Admin" : "User"}
          </Badge>
        );
      },
    },
    {
      header: "Created",
      accessor: (row: any) => new Date(row.created_at).toLocaleDateString(),
    },
    {
      header: "Actions",
      accessor: (row: any) => {
        const isAdmin = row.user_roles?.some((r: any) => r.role === "admin");
        return (
          <Button
            variant="outline"
            size="sm"
            onClick={() => toggleAdminMutation.mutate({ userId: row.id, isAdmin })}
          >
            {isAdmin ? (
              <>
                <ShieldOff className="h-4 w-4 mr-2" />
                Revoke Admin
              </>
            ) : (
              <>
                <Shield className="h-4 w-4 mr-2" />
                Grant Admin
              </>
            )}
          </Button>
        );
      },
    },
  ];

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">User Management</h1>
        <p className="text-muted-foreground mt-2">
          Manage users and their roles across all workspaces
        </p>
      </div>

      <AdminDataTable data={users} columns={columns} idAccessor="id" />
    </div>
  );
}
