import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuotaCheck } from "@/hooks/useQuotaCheck";

interface QuotaExceededBannerProps {
  workspaceId: string | undefined;
}

export function QuotaExceededBanner({ workspaceId }: QuotaExceededBannerProps) {
  const { data: quota } = useQuotaCheck(workspaceId);
  const navigate = useNavigate();

  if (!quota?.isOverQuota) {
    return null;
  }

  return (
    <Alert className="border-destructive bg-destructive/10">
      <AlertTriangle className="h-4 w-4 text-destructive" />
      <AlertTitle>Quota Exceeded</AlertTitle>
      <AlertDescription className="flex items-center justify-between">
        <span>
          You've used {quota.used} of {quota.quota} pages this month. Upgrade to continue generating PDFs.
        </span>
        <Button
          size="sm"
          onClick={() => navigate("/settings?tab=billing")}
          className="ml-4"
        >
          Upgrade Now
        </Button>
      </AlertDescription>
    </Alert>
  );
}
