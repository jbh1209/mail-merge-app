import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, TrendingUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useSubscription } from "@/hooks/useSubscription";

interface QuotaWarningModalProps {
  workspaceId: string | undefined;
}

export function QuotaWarningModal({ workspaceId }: QuotaWarningModalProps) {
  const { data: subscription } = useSubscription(workspaceId);
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [hasBeenDismissed, setHasBeenDismissed] = useState(false);

  useEffect(() => {
    if (!subscription?.features || hasBeenDismissed) return;

    const { pagesUsed, pagesQuota } = subscription.features;
    const percentageUsed = (pagesUsed / pagesQuota) * 100;

    // Show modal if usage is at 80% or above
    if (percentageUsed >= 80 && !isOpen) {
      setIsOpen(true);
    }
  }, [subscription, hasBeenDismissed, isOpen]);

  const handleDismiss = () => {
    setIsOpen(false);
    setHasBeenDismissed(true);
  };

  const handleUpgrade = () => {
    setIsOpen(false);
    navigate("/settings?tab=billing");
  };

  if (!subscription?.features) return null;

  const { pagesUsed, pagesQuota, tier } = subscription.features;
  const percentageUsed = (pagesUsed / pagesQuota) * 100;
  const remaining = pagesQuota - pagesUsed;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            <DialogTitle>Approaching Quota Limit</DialogTitle>
          </div>
          <DialogDescription>
            You've used {Math.round(percentageUsed)}% of your monthly page quota
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Usage this month</span>
              <span className="font-medium">
                {pagesUsed} / {pagesQuota} pages
              </span>
            </div>
            <Progress value={percentageUsed} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {remaining} pages remaining
            </p>
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <p className="text-sm">
              You're currently on the <span className="font-semibold capitalize">{tier}</span> plan.
              Upgrade to get more pages and access to advanced features.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleDismiss}>
            Remind Me Later
          </Button>
          <Button onClick={handleUpgrade}>
            <TrendingUp className="mr-2 h-4 w-4" />
            View Plans
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
