import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminStatsCard } from "@/components/admin/AdminStatsCard";
import { Users, Building2, FolderKanban, FileText, DollarSign, Activity } from "lucide-react";

export default function AdminDashboard() {
  const { data: stats } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const [
        { count: usersCount },
        { count: workspacesCount },
        { count: projectsCount },
        { count: jobsCount },
        { data: subscriptions },
      ] = await Promise.all([
        supabase.from("profiles").select("*", { count: "exact", head: true }),
        supabase.from("workspaces").select("*", { count: "exact", head: true }),
        supabase.from("projects").select("*", { count: "exact", head: true }),
        supabase.from("merge_jobs").select("*", { count: "exact", head: true }),
        supabase.from("stripe_subscriptions").select("*"),
      ]);

      const totalRevenue = subscriptions?.length || 0;
      const activeSubscriptions = subscriptions?.filter(
        (s) => s.status === "active"
      ).length || 0;

      return {
        usersCount: usersCount || 0,
        workspacesCount: workspacesCount || 0,
        projectsCount: projectsCount || 0,
        jobsCount: jobsCount || 0,
        totalRevenue,
        activeSubscriptions,
      };
    },
  });

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          System-wide overview and statistics
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-8">
        <AdminStatsCard
          title="Total Users"
          value={stats?.usersCount || 0}
          icon={Users}
          description="All registered users"
        />
        <AdminStatsCard
          title="Workspaces"
          value={stats?.workspacesCount || 0}
          icon={Building2}
          description="Active workspaces"
        />
        <AdminStatsCard
          title="Projects"
          value={stats?.projectsCount || 0}
          icon={FolderKanban}
          description="Total projects created"
        />
        <AdminStatsCard
          title="Merge Jobs"
          value={stats?.jobsCount || 0}
          icon={FileText}
          description="Total jobs processed"
        />
        <AdminStatsCard
          title="Active Subscriptions"
          value={stats?.activeSubscriptions || 0}
          icon={DollarSign}
          description="Currently active"
        />
        <AdminStatsCard
          title="Total Revenue Accounts"
          value={stats?.totalRevenue || 0}
          icon={Activity}
          description="Subscription records"
        />
      </div>
    </div>
  );
}
