import { useState, useRef, useEffect } from "react";
import { Rocket, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import CreativeEditorSDK from '@cesdk/cesdk-js';
import { batchExportWithCesdk, BatchExportProgress } from "@/lib/cesdk/pdfBatchExporter";

interface CesdkPdfGeneratorProps {
  cesdk: CreativeEditorSDK | null;
  mergeJobId: string;
  dataRecords: Record<string, any>[];
  templateConfig: {
    widthMm: number;
    heightMm: number;
    labelsPerSheet?: number;
    isFullPage?: boolean;
  };
  onComplete: (result: { outputUrl: string; pageCount: number }) => void;
  onError: (error: string) => void;
}

export function CesdkPdfGenerator({
  cesdk,
  mergeJobId,
  dataRecords,
  templateConfig,
  onComplete,
  onError,
}: CesdkPdfGeneratorProps) {
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<BatchExportProgress | null>(null);
  const { toast } = useToast();

  const handleGenerate = async () => {
    if (!cesdk) {
      onError('Editor not initialized');
      return;
    }

    if (dataRecords.length === 0) {
      onError('No data records to process');
      return;
    }

    setGenerating(true);
    setProgress({
      phase: 'exporting',
      current: 0,
      total: dataRecords.length,
      message: 'Starting export...',
    });

    try {
      const result = await batchExportWithCesdk(
        cesdk,
        dataRecords,
        templateConfig,
        mergeJobId,
        setProgress
      );

      if (result.success && result.outputUrl) {
        toast({
          title: "PDF generated successfully",
          description: `Created ${result.pageCount} pages`,
        });
        onComplete({
          outputUrl: result.outputUrl,
          pageCount: result.pageCount || dataRecords.length,
        });
      } else {
        throw new Error(result.error || 'Export failed');
      }
    } catch (error: any) {
      console.error('Generation error:', error);
      toast({
        title: "PDF generation failed",
        description: error.message,
        variant: "destructive",
      });
      onError(error.message);
    } finally {
      setGenerating(false);
    }
  };

  const getProgressPercentage = (): number => {
    if (!progress) return 0;
    if (progress.phase === 'complete') return 100;
    if (progress.phase === 'error') return 0;
    if (progress.total === 0) return 0;
    
    // Weight phases: exporting 80%, composing 15%, uploading 5%
    const basePercent = (progress.current / progress.total) * 100;
    
    switch (progress.phase) {
      case 'exporting':
        return basePercent * 0.8;
      case 'composing':
        return 80 + basePercent * 0.15;
      case 'uploading':
        return 95 + basePercent * 0.05;
      default:
        return basePercent;
    }
  };

  const getPhaseIcon = () => {
    if (!progress) return null;
    
    switch (progress.phase) {
      case 'complete':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      default:
        return <Loader2 className="h-4 w-4 animate-spin" />;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Rocket className="h-5 w-5" />
          Generate PDFs
        </CardTitle>
        <CardDescription>
          Export {dataRecords.length} labels using your template design
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!cesdk && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Please wait for the editor to initialize before generating PDFs.
            </AlertDescription>
          </Alert>
        )}

        {progress && generating && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              {getPhaseIcon()}
              <span>{progress.message}</span>
            </div>
            <Progress value={getProgressPercentage()} className="h-2" />
            <p className="text-xs text-muted-foreground text-right">
              {Math.round(getProgressPercentage())}%
            </p>
          </div>
        )}

        <Button
          onClick={handleGenerate}
          disabled={!cesdk || generating || dataRecords.length === 0}
          size="lg"
          className="w-full"
        >
          {generating ? (
            <>
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Rocket className="h-5 w-5 mr-2" />
              Generate {dataRecords.length} PDFs
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
