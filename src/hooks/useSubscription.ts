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
  isOnTrial: boolean;
  trialEndsAt: string | null;
  daysLeftInTrial: number | null;
}

export function useSubscription(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ["subscription", workspaceId],
    queryFn: async () => {
      if (!workspaceId) return null;

      const { data: workspace, error } = await supabase
        .from("workspaces")
        .select("subscription_tier, subscription_status, pages_quota, pages_used_this_month, trial_end_date")
        .eq("id", workspaceId)
        .single();

      if (error) throw error;

      const tier = workspace.subscription_tier as SubscriptionTier;
      const trialEndDate = workspace.trial_end_date ? new Date(workspace.trial_end_date) : null;
      const now = new Date();
      const isOnTrial = trialEndDate ? trialEndDate > now && workspace.subscription_status === 'trialing' : false;
      const daysLeftInTrial = trialEndDate && isOnTrial 
        ? Math.ceil((trialEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : null;
      
      const features: SubscriptionFeatures = {
        tier,
        pagesQuota: workspace.pages_quota,
        pagesUsed: workspace.pages_used_this_month,
        canUseGoogleSheets: tier !== "starter" || isOnTrial,
        canUseAICleaning: tier !== "starter" || isOnTrial,
        canUseCustomTemplates: (tier === "business" || tier === "pro") || isOnTrial,
        canUseAPI: (tier === "business" || tier === "pro") || isOnTrial,
        canUseTeamCollaboration: (tier === "business" || tier === "pro") || isOnTrial,
        canUseWhiteLabel: (tier === "business" || tier === "pro") || isOnTrial,
        hasAdvancedAI: (tier === "business" || tier === "pro") || isOnTrial,
        isOnTrial,
        trialEndsAt: trialEndDate?.toISOString() || null,
        daysLeftInTrial,
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
