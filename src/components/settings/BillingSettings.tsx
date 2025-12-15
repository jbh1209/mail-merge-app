import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Loader2, CreditCard, TrendingUp, TrendingDown, RefreshCw } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";

export function BillingSettings() {
  const [workspaceId, setWorkspaceId] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: subscription, refetch: refetchSubscription } = useSubscription(workspaceId);

  const { data: workspace } = useQuery({
    queryKey: ["workspace", workspaceId],
    queryFn: async () => {
      if (!workspaceId) return null;
      const { data, error } = await supabase
        .from("workspaces")
        .select("stripe_customer_id")
        .eq("id", workspaceId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!workspaceId,
  });

  const { data: tiers } = useQuery({
    queryKey: ["subscription-tiers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_tiers")
        .select("*")
        .eq("is_active", true)
        .order("price_cents", { ascending: true });
      
      if (error) throw error;
      return data;
    },
  });

  const checkSubscription = async () => {
    setSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Not authenticated");
        return;
      }

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-subscription`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const result = await response.json();
      
      if (result.error) {
        toast.error(result.error);
        return;
      }

      if (result.synced) {
        // Refresh all subscription-related queries
        await queryClient.invalidateQueries({ queryKey: ["subscription"] });
        await queryClient.invalidateQueries({ queryKey: ["workspace"] });
        await refetchSubscription();
        
        if (result.subscribed) {
          toast.success(`Subscription synced: ${result.tier.charAt(0).toUpperCase() + result.tier.slice(1)} plan active`);
        } else {
          toast.info("No active subscription found");
        }
      }
    } catch (error: any) {
      toast.error("Failed to sync subscription");
      console.error("Check subscription error:", error);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    const loadWorkspace = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("workspace_id")
          .eq("id", user.id)
          .single();
        
        if (profile) {
          setWorkspaceId(profile.workspace_id || "");
        }
      }
    };
    loadWorkspace();
  }, []);

  // Auto-check subscription after checkout success
  useEffect(() => {
    if (searchParams.get("success") === "true" && workspaceId) {
      checkSubscription();
    }
  }, [searchParams, workspaceId]);

  // Check subscription on mount
  useEffect(() => {
    if (workspaceId) {
      checkSubscription();
    }
  }, [workspaceId]);

  const handleManageBilling = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      if (!workspace?.stripe_customer_id) {
        toast.error("No billing account found");
        return;
      }

      // Create Stripe billing portal session
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-billing-portal`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({ customerId: workspace.stripe_customer_id }),
      });

      const { url } = await response.json();
      if (url) {
        window.location.href = url;
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = async (tierName: string, priceId: string) => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({
          workspaceId,
          priceId,
          tierName,
        }),
      });

      const { url } = await response.json();
      if (url) {
        window.location.href = url;
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const usagePercent = subscription
    ? (subscription.pages_used_this_month / subscription.pages_quota) * 100
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Billing & Subscription</h2>
        <p className="text-muted-foreground mt-1">
          Manage your subscription and billing information
        </p>
      </div>

      {/* Current Plan */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Current Plan</CardTitle>
              <CardDescription>Your active subscription</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="capitalize">
                {subscription?.subscription_tier}
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                onClick={checkSubscription}
                disabled={syncing}
                title="Refresh subscription status"
              >
                <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground">Usage this month</span>
              <span className="font-medium">
                {subscription?.pages_used_this_month || 0} / {subscription?.pages_quota || 0} pages
              </span>
            </div>
            <Progress value={usagePercent} className="h-2" />
          </div>

          <div className="flex gap-2">
            {workspace?.stripe_customer_id && (
              <Button
                onClick={handleManageBilling}
                disabled={loading}
                variant="outline"
                className="flex-1"
              >
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CreditCard className="mr-2 h-4 w-4" />
                )}
                Manage Billing
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Available Plans */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Available Plans</h3>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tiers?.map((tier) => {
            const isCurrent = tier.tier_name === subscription?.subscription_tier;
            const features = tier.features as any;
            
            // Find current tier's price to determine upgrade vs downgrade
            const currentTier = tiers?.find(t => t.tier_name === subscription?.subscription_tier);
            const currentPrice = currentTier?.price_cents || 0;
            const isUpgrade = tier.price_cents > currentPrice;
            const isDowngrade = tier.price_cents < currentPrice;

            return (
              <Card key={tier.id} className={isCurrent ? "border-primary" : ""}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span className="capitalize">{tier.display_name}</span>
                    {isCurrent && <Badge>Current</Badge>}
                  </CardTitle>
                  <CardDescription>
                    <span className="text-3xl font-bold">
                      ${(tier.price_cents / 100).toFixed(0)}
                    </span>
                    <span className="text-muted-foreground">/month</span>
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">
                      {tier.pages_per_month.toLocaleString()} pages/month
                    </p>
                    {features && (
                      <ul className="text-sm text-muted-foreground space-y-1">
                        {features.map((feature: string, idx: number) => (
                          <li key={idx}>• {feature}</li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {!isCurrent && tier.stripe_price_id && isUpgrade && (
                    <Button
                      onClick={() => handleUpgrade(tier.tier_name, tier.stripe_price_id!)}
                      disabled={loading}
                      className="w-full"
                    >
                      {loading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <TrendingUp className="mr-2 h-4 w-4" />
                      )}
                      Upgrade
                    </Button>
                  )}
                  
                  {!isCurrent && isDowngrade && workspace?.stripe_customer_id && (
                    <Button
                      variant="outline"
                      onClick={handleManageBilling}
                      disabled={loading}
                      className="w-full"
                    >
                      {loading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <TrendingDown className="mr-2 h-4 w-4" />
                      )}
                      Downgrade
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
