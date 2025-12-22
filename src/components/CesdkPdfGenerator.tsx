import { useState, useEffect } from "react";
import { Rocket, Loader2, AlertCircle, CheckCircle2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import CreativeEditorSDK from '@cesdk/cesdk-js';
import { batchExportWithCesdk, BatchExportProgress } from "@/lib/cesdk/pdfBatchExporter";
import { createPortal } from "react-dom";
import { PrintSettings } from "@/types/print-settings";

// Helper to get document terminology based on project type
const getDocumentName = (type: string, plural = false): string => {
  const names: Record<string, [string, string]> = {
    label: ['label', 'labels'],
    certificate: ['certificate', 'certificates'],
    card: ['card', 'cards'],
    badge: ['badge', 'badges'],
    shelf_strip: ['shelf strip', 'shelf strips'],
    custom: ['document', 'documents'],
  };
  const pair = names[type] || names.custom;
  return pair[plural ? 1 : 0];
};

interface CesdkPdfGeneratorProps {
  cesdk: CreativeEditorSDK | null;
  mergeJobId: string;
  dataRecords: Record<string, any>[];
  projectType?: string;
  projectImages?: { name: string; url: string }[];
  templateConfig: {
    widthMm: number;
    heightMm: number;
    labelsPerSheet?: number;
    isFullPage?: boolean;
    averyPartNumber?: string;
  };
  /** Print settings for professional output (bleed + crop marks) */
  printSettings?: PrintSettings;
  onComplete: (result: { outputUrl: string; pageCount: number }) => void;
  onError: (error: string) => void;
}

export function CesdkPdfGenerator({
  cesdk,
  mergeJobId,
  dataRecords,
  projectType = 'label',
  projectImages = [],
  templateConfig,
  printSettings,
  onComplete,
  onError,
}: CesdkPdfGeneratorProps) {
  const docName = getDocumentName(projectType);
  const docNamePlural = getDocumentName(projectType, true);
  const isFullPage = templateConfig.isFullPage;
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<BatchExportProgress | null>(null);
  const [completed, setCompleted] = useState<{
    outputUrl: string;
    pageCount: number;
  } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [cmykStatus, setCmykStatus] = useState<'pending' | 'success' | 'failed'>('pending');
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
        {
          ...templateConfig,
          projectType, // Pass project type for multi-page handling
          projectImages, // Pass projectImages for VDP image resolution
          printSettings, // Pass print settings for bleed + crop marks
        },
        mergeJobId,
        (progressUpdate) => {
          setProgress(progressUpdate);
          // Track CMYK conversion status
          if (progressUpdate.message?.includes('CMYK conversion failed')) {
            setCmykStatus('failed');
          } else if (progressUpdate.message === 'CMYK conversion complete') {
            setCmykStatus('success');
          }
        }
      );

      if (result.success && result.outputUrl) {
        toast({
          title: "PDF generated successfully",
          description: `Created ${result.pageCount} pages`,
        });
        
        // Store completed state for download button
        setCompleted({
          outputUrl: result.outputUrl,
          pageCount: result.pageCount || dataRecords.length,
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

  const handleDownload = async () => {
    if (!mergeJobId) return;

    setDownloading(true);
    try {
      // Get signed URL from edge function
      const { data, error } = await supabase.functions.invoke('get-download-url', {
        body: { mergeJobId },
      });

      if (error) throw error;
      if (!data?.signedUrl) throw new Error('No download URL returned');

      // Fetch the PDF
      const response = await fetch(data.signedUrl);
      if (!response.ok) throw new Error('Failed to fetch PDF');
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      
      // Create download link and trigger it
      const link = document.createElement('a');
      link.href = url;
      link.download = `${docNamePlural}-${mergeJobId.slice(0, 8)}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up after a delay
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      
      toast({
        title: "Download started",
        description: "Your PDF is downloading",
      });
    } catch (error: any) {
      console.error('Download error:', error);
      toast({
        title: "Download failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDownloading(false);
    }
  };

  const getProgressPercentage = (): number => {
    if (!progress) return 0;
    if (progress.phase === 'complete') return 100;
    if (progress.phase === 'error') return 0;
    if (progress.total === 0) return 0;
    
    // Weight phases: exporting 70%, converting 10%, uploading 10%, composing 10%
    const basePercent = (progress.current / progress.total) * 100;
    
    switch (progress.phase) {
      case 'exporting':
        return basePercent * 0.7;
      case 'converting':
        return 70 + basePercent * 0.1;
      case 'uploading':
        return 80 + basePercent * 0.1;
      case 'composing':
        return 90 + basePercent * 0.1;
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

  // Show completed state with download button
  if (completed) {
    return (
      <Card className="border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-green-700 dark:text-green-400">
            <CheckCircle2 className="h-5 w-5" />
            PDF Generated Successfully!
          </CardTitle>
          <CardDescription>
            Created {completed.pageCount} pages ready for download
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {cmykStatus === 'failed' && (
            <Alert variant="destructive" className="mb-2">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                CMYK conversion failed – PDF was exported in RGB instead. 
                This may not be suitable for professional printing.
              </AlertDescription>
            </Alert>
          )}
          <Button
            onClick={handleDownload}
            disabled={downloading}
            size="lg"
            className="w-full"
          >
            {downloading ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Opening PDF...
              </>
            ) : (
              <>
                <Download className="h-5 w-5 mr-2" />
                Download PDF
              </>
            )}
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            You can also access this PDF from the project's Merge Jobs tab
          </p>
        </CardContent>
      </Card>
    );
  }

  // Render an overlay during generation to hide the flickering canvas
  const GeneratingOverlay = () => {
    if (!generating) return null;
    
    return createPortal(
      <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-sm flex items-center justify-center">
        <Card className="w-[400px] max-w-[90vw] shadow-2xl">
          <CardHeader className="text-center pb-2">
            <CardTitle className="flex items-center justify-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              Generating PDFs
            </CardTitle>
            <CardDescription>
              Please wait while we export your {docNamePlural}...
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {progress && (
              <div className="space-y-2">
                <div className="flex items-center justify-center gap-2 text-sm font-medium">
                  {getPhaseIcon()}
                  <span>{progress.message}</span>
                </div>
                <Progress value={getProgressPercentage()} className="h-3" />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    {progress.phase === 'exporting' && `${docName.charAt(0).toUpperCase() + docName.slice(1)} ${progress.current} of ${progress.total}`}
                    {progress.phase === 'converting' && 'Converting to CMYK...'}
                    {progress.phase === 'uploading' && 'Uploading pages...'}
                    {progress.phase === 'composing' && (isFullPage ? 'Merging pages...' : 'Arranging on sheets...')}
                  </span>
                  <span>{Math.round(getProgressPercentage())}%</span>
                </div>
              </div>
            )}
            <p className="text-xs text-center text-muted-foreground">
              This may take a moment for large batches
            </p>
          </CardContent>
        </Card>
      </div>,
      document.body
    );
  };

  return (
    <>
      <GeneratingOverlay />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5" />
            Generate PDFs
          </CardTitle>
          <CardDescription>
            Export {dataRecords.length} {docNamePlural} using your template design
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
                Export {dataRecords.length} {docNamePlural}
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </>
  );
}
