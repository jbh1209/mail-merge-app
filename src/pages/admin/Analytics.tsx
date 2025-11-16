import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminStatsCard } from "@/components/admin/AdminStatsCard";
import { TrendingUp, DollarSign, FileText, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AdminAnalytics() {
  const { data: analytics } = useQuery({
    queryKey: ["admin-analytics"],
    queryFn: async () => {
      const [
        { data: usageLogs },
        { data: subscriptions },
        { data: jobs },
        { count: activeUsers },
      ] = await Promise.all([
        supabase.from("usage_logs").select("*").order("created_at", { ascending: false }),
        supabase.from("stripe_subscriptions").select("*"),
        supabase.from("merge_jobs").select("*").eq("status", "complete"),
        supabase
          .from("profiles")
          .select("*", { count: "exact", head: true })
          .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
      ]);

      const totalPagesGenerated = usageLogs?.reduce(
        (sum, log) => sum + log.pages_generated,
        0
      ) || 0;

      const activeSubscriptionsCount = subscriptions?.filter(
        (s) => s.status === "active"
      ).length || 0;

      const completedJobs = jobs?.length || 0;

      return {
        totalPagesGenerated,
        activeSubscriptionsCount,
        completedJobs,
        newUsersThisMonth: activeUsers || 0,
      };
    },
  });

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Analytics Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          System-wide analytics and performance metrics
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <AdminStatsCard
          title="Pages Generated"
          value={analytics?.totalPagesGenerated || 0}
          icon={FileText}
          description="Total across all workspaces"
        />
        <AdminStatsCard
          title="Active Subscriptions"
          value={analytics?.activeSubscriptionsCount || 0}
          icon={DollarSign}
          description="Currently paying customers"
        />
        <AdminStatsCard
          title="Completed Jobs"
          value={analytics?.completedJobs || 0}
          icon={TrendingUp}
          description="Successfully processed"
        />
        <AdminStatsCard
          title="New Users (30d)"
          value={analytics?.newUsersThisMonth || 0}
          icon={Users}
          description="Last 30 days"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Usage Trends</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Advanced analytics and charts coming soon...
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
