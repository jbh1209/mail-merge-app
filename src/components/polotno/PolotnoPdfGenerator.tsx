import { useState, useCallback } from "react";
import { Rocket, Loader2, AlertCircle, CheckCircle2, Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { createPortal } from "react-dom";
import { PrintSettings } from "@/types/print-settings";
import { 
  batchExportWithPolotno, 
  getLayoutFromPartNumber,
  BatchExportProgress,
  PrintConfig,
} from "@/lib/polotno/pdfBatchExporter";
import type { PolotnoEditorHandle, PolotnoScene } from '@/components/polotno';

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

// Determine if an error is likely transient (network/timeout)
const isTransientError = (error: string): boolean => {
  const transientPatterns = [
    'network', 'timeout', 'timed out', 'fetch failed', 'Failed to fetch',
    'connection', 'ECONNRESET', 'socket', '502', '503', '504',
  ];
  return transientPatterns.some(p => error.toLowerCase().includes(p.toLowerCase()));
};

interface PolotnoPdfGeneratorProps {
  editorHandle: PolotnoEditorHandle | null;
  mergeJobId: string;
  dataRecords: Record<string, string>[];
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

export function PolotnoPdfGenerator({
  editorHandle,
  mergeJobId,
  dataRecords,
  projectType = 'label',
  projectImages = [],
  templateConfig,
  printSettings,
  onComplete,
  onError,
}: PolotnoPdfGeneratorProps) {
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
  const [lastError, setLastError] = useState<string | null>(null);
  const { toast } = useToast();

  const handleGenerate = useCallback(async () => {
    if (!editorHandle) {
      onError('Editor not initialized');
      return;
    }

    if (dataRecords.length === 0) {
      onError('No data records to process');
      return;
    }

    setGenerating(true);
    setLastError(null);
    setProgress({
      phase: 'preparing',
      current: 0,
      total: dataRecords.length,
      message: 'Starting export...',
    });

    try {
      // Get base scene from editor
      const baseScene = editorHandle.getBaseScene();
      
      // Get layout from Avery part number if this is a label project
      let layout = null;
      if (!isFullPage && templateConfig.averyPartNumber) {
        console.log(`[PDFGen] Looking up layout for part number: ${templateConfig.averyPartNumber}`);
        layout = await getLayoutFromPartNumber(templateConfig.averyPartNumber);
        console.log(`[PDFGen] Layout result:`, layout 
          ? `${layout.columns}×${layout.rows} (${layout.labelsPerSheet} per sheet)` 
          : 'null (will use full page mode)');
      }

      // Convert print settings to PrintConfig format
      // Include clientRenderedMarks flag when using Polotno native crop marks
      const usePrintMarks = printSettings?.enablePrintMarks ?? false;
      const printConfig: PrintConfig | undefined = printSettings ? {
        enablePrintMarks: printSettings.enablePrintMarks,
        bleedMm: printSettings.bleedMm,
        cropMarkOffsetMm: printSettings.cropMarkOffsetMm,
        trimWidthMm: templateConfig.widthMm,
        trimHeightMm: templateConfig.heightMm,
        colorMode: printSettings.colorMode,
        region: printSettings.region?.toLowerCase() as 'us' | 'eu' | 'other',
        clientRenderedMarks: usePrintMarks, // Skip server-side marks when client renders them
      } : undefined;

      // Create export function that uses Polotno's native crop marks and bleed clipping
      const exportPdf = async (scene: PolotnoScene): Promise<Blob> => {
        return editorHandle.exportResolvedPdf(scene, {
          includeBleed: usePrintMarks,
          includeCropMarks: usePrintMarks, // Use Polotno native crop marks
          cropMarkSizeMm: printSettings?.cropMarkOffsetMm ?? 3,
          pixelRatio: 2,
        });
      };

      // Run batch export
      const result = await batchExportWithPolotno({
        baseScene,
        records: dataRecords,
        exportPdf,
        layout,
        printConfig,
        mergeJobId,
        onProgress: (progressUpdate) => {
          setProgress(progressUpdate);
          
          // Track CMYK conversion status from messages
          if (progressUpdate.message?.includes('CMYK conversion failed')) {
            setCmykStatus('failed');
          } else if (progressUpdate.message === 'CMYK conversion complete') {
            setCmykStatus('success');
          }
        },
      });

      if (result.success && result.outputUrl) {
        toast({
          title: "PDF generated successfully",
          description: `Created ${result.pageCount} pages`,
        });
        
        setCompleted({
          outputUrl: result.outputUrl,
          pageCount: result.pageCount,
        });
        
        onComplete({
          outputUrl: result.outputUrl,
          pageCount: result.pageCount,
        });
      } else {
        throw new Error(result.error || 'Export failed');
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Export failed';
      console.error('Generation error:', error);
      setLastError(message);
      toast({
        title: "PDF generation failed",
        description: message,
        variant: "destructive",
      });
      onError(message);
    } finally {
      setGenerating(false);
    }
  }, [editorHandle, dataRecords, isFullPage, templateConfig, printSettings, mergeJobId, toast, onComplete, onError]);

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

      const filename = `${docNamePlural}-${mergeJobId.slice(0, 8)}.pdf`;

      // Use fetch + blob approach to trigger proper browser download dialog
      const response = await fetch(data.signedUrl);
      if (!response.ok) throw new Error(`Failed to fetch PDF: ${response.status}`);
      
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      
      // Create hidden anchor and trigger download
      const link = document.createElement('a');
      link.style.display = 'none';
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      
      // Clean up immediately and revoke after delay
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
      
      toast({
        title: "Download started",
        description: `Downloading ${filename}`,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Download failed';
      console.error('Download error:', error);
      toast({
        title: "Download failed",
        description: message,
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
    
    // Weight phases: preparing 5%, exporting 50%, converting 15%, uploading 15%, composing 15%
    const basePercent = (progress.current / progress.total) * 100;
    
    switch (progress.phase) {
      case 'preparing':
        return 5;
      case 'exporting':
        return 5 + basePercent * 0.50;
      case 'converting':
        return 55 + basePercent * 0.15;
      case 'uploading':
        return 70 + basePercent * 0.15;
      case 'composing':
        return 85 + basePercent * 0.15;
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
                    {progress.phase === 'preparing' && 'Preparing...'}
                    {progress.phase === 'exporting' && `${docName.charAt(0).toUpperCase() + docName.slice(1)} ${progress.current} of ${progress.total}`}
                    {progress.phase === 'converting' && `Converting to CMYK...`}
                    {progress.phase === 'uploading' && 'Uploading pages...'}
                    {progress.phase === 'composing' && (isFullPage ? 'Processing...' : 'Arranging on sheets...')}
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
          {!editorHandle && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Please wait for the editor to initialize before generating PDFs.
              </AlertDescription>
            </Alert>
          )}

          {/* Show error with retry option for transient failures */}
          {lastError && !generating && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="flex flex-col gap-2">
                <span>{lastError}</span>
                {isTransientError(lastError) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleGenerate}
                    disabled={!editorHandle}
                    className="w-fit"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Retry Export
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          )}

          <Button
            onClick={handleGenerate}
            disabled={!editorHandle || generating || dataRecords.length === 0}
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
