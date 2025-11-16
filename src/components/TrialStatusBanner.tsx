import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Clock, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useSubscription } from "@/hooks/useSubscription";

interface TrialStatusBannerProps {
  workspaceId: string | undefined;
}

export function TrialStatusBanner({ workspaceId }: TrialStatusBannerProps) {
  const { data: subscription } = useSubscription(workspaceId);
  const navigate = useNavigate();

  if (!subscription?.features?.isOnTrial) {
    return null;
  }

  const { daysLeftInTrial } = subscription.features;
  const isExpiringSoon = daysLeftInTrial !== null && daysLeftInTrial <= 3;

  return (
    <Alert className={isExpiringSoon ? "border-warning bg-warning/10" : "border-primary/50 bg-primary/5"}>
      {isExpiringSoon ? (
        <Clock className="h-4 w-4 text-warning" />
      ) : (
        <Sparkles className="h-4 w-4 text-primary" />
      )}
      <AlertTitle>
        {isExpiringSoon ? "Trial Ending Soon!" : "Trial Period Active"}
      </AlertTitle>
      <AlertDescription className="flex items-center justify-between">
        <span>
          {daysLeftInTrial !== null && (
            <>
              {daysLeftInTrial === 0 ? (
                "Your trial ends today"
              ) : daysLeftInTrial === 1 ? (
                "Your trial ends tomorrow"
              ) : (
                `${daysLeftInTrial} days left in your trial`
              )}
              {" - "}Enjoying full access to all premium features
            </>
          )}
        </span>
        <Button
          size="sm"
          variant={isExpiringSoon ? "default" : "outline"}
          onClick={() => navigate("/settings?tab=billing")}
          className="ml-4"
        >
          {isExpiringSoon ? "Upgrade Now" : "View Plans"}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
