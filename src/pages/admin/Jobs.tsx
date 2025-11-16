import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminDataTable } from "@/components/admin/AdminDataTable";
import { Badge } from "@/components/ui/badge";

export default function AdminJobs() {
  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["admin-jobs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("merge_jobs")
        .select("*, workspaces(name), projects(name)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  const columns = [
    {
      header: "Project",
      accessor: (row: any) => row.projects?.name || "N/A",
    },
    {
      header: "Workspace",
      accessor: (row: any) => row.workspaces?.name || "N/A",
    },
    {
      header: "Status",
      accessor: (row: any) => {
        const statusColor =
          row.status === "complete"
            ? "default"
            : row.status === "error"
            ? "destructive"
            : row.status === "processing"
            ? "secondary"
            : "outline";
        return <Badge variant={statusColor}>{row.status}</Badge>;
      },
    },
    {
      header: "Progress",
      accessor: (row: any) => `${row.processed_pages}/${row.total_pages}`,
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
        <h1 className="text-3xl font-bold">Merge Jobs Management</h1>
        <p className="text-muted-foreground mt-2">
          View all merge jobs across all workspaces
        </p>
      </div>

      <AdminDataTable data={jobs} columns={columns} idAccessor="id" />
    </div>
  );
}
