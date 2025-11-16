import { ReactNode } from "react";
import { useSubscription } from "@/hooks/useSubscription";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Lock, TrendingUp } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface FeatureGateProps {
  workspaceId: string | undefined;
  feature: keyof ReturnType<typeof useSubscription>["data"]["features"];
  children: ReactNode;
  fallback?: ReactNode;
}

export function FeatureGate({ workspaceId, feature, children, fallback }: FeatureGateProps) {
  const { data: subscription, isLoading } = useSubscription(workspaceId);
  const navigate = useNavigate();

  if (isLoading) {
    return <div className="animate-pulse bg-muted h-20 rounded" />;
  }

  const hasAccess = subscription?.features?.[feature];
  const isOnTrial = subscription?.features?.isOnTrial;
  const daysLeftInTrial = subscription?.features?.daysLeftInTrial;
  const isTrialExpiringSoon = daysLeftInTrial !== null && daysLeftInTrial <= 3;

  if (!hasAccess) {
    return (
      fallback || (
        <Alert className="border-primary/50 bg-primary/5">
          <Lock className="h-4 w-4" />
          <AlertTitle>Premium Feature</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>
              {isOnTrial && isTrialExpiringSoon
                ? `Trial ending in ${daysLeftInTrial} ${daysLeftInTrial === 1 ? 'day' : 'days'}. Upgrade to keep access.`
                : "Upgrade your plan to access this feature"}
            </span>
            <Button
              size="sm"
              onClick={() => navigate("/settings?tab=billing")}
              className="ml-4"
            >
              <TrendingUp className="mr-2 h-4 w-4" />
              Upgrade
            </Button>
          </AlertDescription>
        </Alert>
      )
    );
  }

  return <>{children}</>;
}
