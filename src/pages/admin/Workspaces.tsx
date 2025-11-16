import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminDataTable } from "@/components/admin/AdminDataTable";
import { Badge } from "@/components/ui/badge";

export default function AdminWorkspaces() {
  const { data: workspaces = [], isLoading } = useQuery({
    queryKey: ["admin-workspaces"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspaces")
        .select("*, profiles(full_name), projects(count)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const columns = [
    { header: "Name", accessor: "name" as const },
    { header: "Slug", accessor: "slug" as const },
    {
      header: "Owner",
      accessor: (row: any) => row.profiles?.full_name || "N/A",
    },
    {
      header: "Tier",
      accessor: (row: any) => (
        <Badge variant="secondary">{row.subscription_tier}</Badge>
      ),
    },
    {
      header: "Status",
      accessor: (row: any) => (
        <Badge
          variant={
            row.subscription_status === "active"
              ? "default"
              : row.subscription_status === "trialing"
              ? "secondary"
              : "destructive"
          }
        >
          {row.subscription_status}
        </Badge>
      ),
    },
    {
      header: "Usage",
      accessor: (row: any) => `${row.pages_used_this_month}/${row.pages_quota}`,
    },
    {
      header: "Created",
      accessor: (row: any) => new Date(row.created_at).toLocaleDateString(),
    },
  ];

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Workspace Management</h1>
        <p className="text-muted-foreground mt-2">
          View and manage all workspaces across the system
        </p>
      </div>

      <AdminDataTable data={workspaces} columns={columns} idAccessor="id" />
    </div>
  );
}
