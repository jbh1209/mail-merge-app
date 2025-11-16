import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminDataTable } from "@/components/admin/AdminDataTable";
import { Badge } from "@/components/ui/badge";

export default function AdminProjects() {
  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["admin-projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*, workspaces(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const columns = [
    { header: "Name", accessor: "name" as const },
    {
      header: "Workspace",
      accessor: (row: any) => row.workspaces?.name || "N/A",
    },
    {
      header: "Type",
      accessor: (row: any) => (
        <Badge variant="outline">{row.project_type}</Badge>
      ),
    },
    {
      header: "Status",
      accessor: (row: any) => {
        const statusColor =
          row.status === "complete"
            ? "default"
            : row.status === "error"
            ? "destructive"
            : "secondary";
        return <Badge variant={statusColor}>{row.status}</Badge>;
      },
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
        <h1 className="text-3xl font-bold">Projects Management</h1>
        <p className="text-muted-foreground mt-2">
          View all projects across all workspaces
        </p>
      </div>

      <AdminDataTable data={projects} columns={columns} idAccessor="id" />
    </div>
  );
}
