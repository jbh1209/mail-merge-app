import { Download, FileText, Clock, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { format } from "date-fns";

interface MergeJob {
  id: string;
  status: 'queued' | 'processing' | 'complete' | 'error';
  total_pages: number;
  processed_pages: number;
  created_at: string;
  processing_started_at: string | null;
  processing_completed_at: string | null;
  output_url: string | null;
  error_message: string | null;
  template?: { name: string };
  data_source?: { row_count: number };
}

interface MergeJobsListProps {
  jobs: MergeJob[];
}

export function MergeJobsList({ jobs }: MergeJobsListProps) {
  if (jobs.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>No merge jobs yet</p>
        <p className="text-sm mt-1">Generate your first PDF to see it here</p>
      </div>
    );
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'complete':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-destructive" />;
      case 'processing':
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      case 'queued':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'complete':
        return <Badge variant="default">Complete</Badge>;
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
      case 'processing':
        return <Badge variant="secondary">Processing</Badge>;
      case 'queued':
        return <Badge variant="outline">Queued</Badge>;
      default:
        return null;
    }
  };

  const handleDownload = (url: string, jobId: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = `output_${jobId}.pdf`;
    link.click();
  };

  return (
    <div className="space-y-3">
      {jobs.map((job) => {
        const progress = job.total_pages > 0 
          ? (job.processed_pages / job.total_pages) * 100 
          : 0;

        return (
          <Card key={job.id} className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3 flex-1">
                {getStatusIcon(job.status)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">
                      {job.template?.name || 'Unknown Template'}
                    </p>
                    {getStatusBadge(job.status)}
                  </div>
                  
                  <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                    <span>{job.total_pages} pages</span>
                    <span>•</span>
                    <span>{format(new Date(job.created_at), 'MMM d, yyyy HH:mm')}</span>
                  </div>

                  {job.status === 'processing' && (
                    <div className="mt-2 space-y-1">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Processing...</span>
                        <span>{job.processed_pages} / {job.total_pages}</span>
                      </div>
                      <Progress value={progress} className="h-1" />
                    </div>
                  )}

                  {job.status === 'error' && job.error_message && (
                    <p className="text-sm text-destructive mt-2">
                      Error: {job.error_message}
                    </p>
                  )}

                  {job.status === 'complete' && job.processing_completed_at && job.processing_started_at && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Completed in {Math.round(
                        (new Date(job.processing_completed_at).getTime() - 
                         new Date(job.processing_started_at).getTime()) / 1000
                      )}s
                    </p>
                  )}
                </div>
              </div>

              {job.status === 'complete' && job.output_url && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownload(job.output_url!, job.id)}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
