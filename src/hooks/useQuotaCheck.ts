import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useQuotaCheck(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ["quota", workspaceId],
    queryFn: async () => {
      if (!workspaceId) return null;

      const { data: workspace, error } = await supabase
        .from("workspaces")
        .select("pages_used_this_month, pages_quota, subscription_tier")
        .eq("id", workspaceId)
        .single();

      if (error) throw error;

      const remaining = workspace.pages_quota - workspace.pages_used_this_month;
      const percentUsed = (workspace.pages_used_this_month / workspace.pages_quota) * 100;

      return {
        used: workspace.pages_used_this_month,
        quota: workspace.pages_quota,
        remaining,
        percentUsed,
        isOverQuota: remaining <= 0,
        isNearLimit: percentUsed >= 80,
        tier: workspace.subscription_tier
      };
    },
    enabled: !!workspaceId,
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}
