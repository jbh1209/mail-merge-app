import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type SubscriptionTier = "starter" | "pro" | "business";

export interface SubscriptionFeatures {
  tier: SubscriptionTier;
  pagesQuota: number;
  pagesUsed: number;
  canUseGoogleSheets: boolean;
  canUseAICleaning: boolean;
  canUseCustomTemplates: boolean;
  canUseAPI: boolean;
  canUseTeamCollaboration: boolean;
  canUseWhiteLabel: boolean;
  hasAdvancedAI: boolean;
}

export function useSubscription(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ["subscription", workspaceId],
    queryFn: async () => {
      if (!workspaceId) return null;

      const { data: workspace, error } = await supabase
        .from("workspaces")
        .select("subscription_tier, subscription_status, pages_quota, pages_used_this_month")
        .eq("id", workspaceId)
        .single();

      if (error) throw error;

      const tier = workspace.subscription_tier as SubscriptionTier;
      
      const features: SubscriptionFeatures = {
        tier,
        pagesQuota: workspace.pages_quota,
        pagesUsed: workspace.pages_used_this_month,
        canUseGoogleSheets: tier !== "starter",
        canUseAICleaning: tier !== "starter",
        canUseCustomTemplates: tier === "business" || tier === "pro",
        canUseAPI: tier === "business" || tier === "pro",
        canUseTeamCollaboration: tier === "business" || tier === "pro",
        canUseWhiteLabel: tier === "business" || tier === "pro",
        hasAdvancedAI: tier === "business" || tier === "pro",
      };

      return {
        ...workspace,
        features,
      };
    },
    enabled: !!workspaceId,
    refetchInterval: 60000, // Refresh every minute
  });
}
