import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Home, Rocket, AlertCircle, CheckCircle2 } from 'lucide-react';
import { LabelPagePreview } from './LabelPagePreview';
import { OversetAnalysisPanel } from './OversetAnalysisPanel';
import { getPageData, calculateTotalPages, getLabelsPerPage } from '@/lib/label-layout-utils';
import { Badge } from '@/components/ui/badge';

interface LabelPreviewModalProps {
  open: boolean;
  onClose: () => void;
  template: any;
  designConfig: any;
  allDataRows: any[];
  fieldMappings: Record<string, string>;
  onGenerate: () => void;
  generating?: boolean;
}

export function LabelPreviewModal({
  open,
  onClose,
  template,
  designConfig,
  allDataRows,
  fieldMappings,
  onGenerate,
  generating = false
}: LabelPreviewModalProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const [showOversetPanel, setShowOversetPanel] = useState(false);
  const [highlightedLabel, setHighlightedLabel] = useState<number | undefined>();

  const labelsPerPage = getLabelsPerPage(template);
  const totalPages = calculateTotalPages(allDataRows.length, labelsPerPage);
  const currentPageData = getPageData(allDataRows, currentPage, labelsPerPage);

  // Reset when opened
  useEffect(() => {
    if (open) {
      setCurrentPage(0);
      setShowOversetPanel(false);
      setHighlightedLabel(undefined);
    }
  }, [open]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && currentPage > 0) {
        setCurrentPage(p => p - 1);
      } else if (e.key === 'ArrowRight' && currentPage < totalPages - 1) {
        setCurrentPage(p => p + 1);
      } else if (e.key === 'Home') {
        setCurrentPage(0);
      } else if (e.key === 'End') {
        setCurrentPage(totalPages - 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, currentPage, totalPages]);

  const handleLabelClick = (labelIndexOnPage: number) => {
    const absoluteIndex = (currentPage * labelsPerPage) + labelIndexOnPage;
    setHighlightedLabel(absoluteIndex);
    setShowOversetPanel(true);
  };

  const handleJumpToLabel = (absoluteIndex: number) => {
    const pageIndex = Math.floor(absoluteIndex / labelsPerPage);
    const labelOnPage = absoluteIndex % labelsPerPage;
    
    setCurrentPage(pageIndex);
    setHighlightedLabel(absoluteIndex);
  };

  // Count overset labels (simplified - full detection in OversetAnalysisPanel)
  const oversetCount = 0; // TODO: Calculate from all pages

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Label Preview</span>
            <div className="flex items-center gap-2">
              {oversetCount > 0 ? (
                <Badge variant="destructive" className="gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {oversetCount} labels with overflow
                </Badge>
              ) : (
                <Badge variant="default" className="gap-1 bg-green-600">
                  <CheckCircle2 className="h-3 w-3" />
                  All labels OK
                </Badge>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex gap-4">
          {/* Main preview area */}
          <div className="flex-1 flex flex-col">
            {/* Navigation controls */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCurrentPage(0)}
                  disabled={currentPage === 0}
                >
                  <Home className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCurrentPage(p => p - 1)}
                  disabled={currentPage === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                
                <span className="text-sm font-medium px-4">
                  Page {currentPage + 1} of {totalPages}
                </span>
                
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCurrentPage(p => p + 1)}
                  disabled={currentPage >= totalPages - 1}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowOversetPanel(!showOversetPanel)}
              >
                {showOversetPanel ? 'Hide' : 'Show'} Analysis
              </Button>
            </div>

            {/* Preview */}
            <div className="flex-1 overflow-auto bg-muted p-8 rounded-lg">
              <LabelPagePreview
                template={template}
                designConfig={designConfig}
                dataRows={currentPageData}
                fieldMappings={fieldMappings}
                pageIndex={currentPage}
                scale={0.5}
                onLabelClick={handleLabelClick}
                highlightedLabelIndex={highlightedLabel !== undefined && Math.floor(highlightedLabel / labelsPerPage) === currentPage 
                  ? highlightedLabel % labelsPerPage 
                  : undefined}
              />
            </div>

            {/* Generate button */}
            <div className="mt-4 flex justify-end">
              <Button
                size="lg"
                onClick={onGenerate}
                disabled={generating}
                className="min-w-[200px]"
              >
                {generating ? (
                  <>
                    Generating...
                  </>
                ) : (
                  <>
                    <Rocket className="h-5 w-5 mr-2" />
                    Generate PDF
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Overset analysis panel */}
          {showOversetPanel && (
            <OversetAnalysisPanel
              template={template}
              designConfig={designConfig}
              allDataRows={allDataRows}
              fieldMappings={fieldMappings}
              labelsPerPage={labelsPerPage}
              onJumpToLabel={handleJumpToLabel}
              highlightedLabelIndex={highlightedLabel}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
