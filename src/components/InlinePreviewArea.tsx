import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { SingleLabelPreview } from './SingleLabelPreview';
import { Badge } from '@/components/ui/badge';

interface InlinePreviewAreaProps {
  currentIndex: number;
  totalLabels: number;
  template: any;
  designConfig: any;
  allDataRows: any[];
  fieldMappings: Record<string, string>;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
  oversetCount: number;
}

export function InlinePreviewArea({
  currentIndex,
  totalLabels,
  template,
  designConfig,
  allDataRows,
  fieldMappings,
  onNext,
  onPrev,
  onClose,
  oversetCount
}: InlinePreviewAreaProps) {
  const currentLabel = allDataRows[currentIndex];

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && currentIndex > 0) {
        onPrev();
      } else if (e.key === 'ArrowRight' && currentIndex < totalLabels - 1) {
        onNext();
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, totalLabels, onNext, onPrev, onClose]);

  return (
    <div className="flex flex-col h-full">
      {/* Header with navigation */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b bg-background">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Design
          </Button>
          <div className="text-sm font-medium">
            Label {currentIndex + 1} of {totalLabels}
          </div>
        </div>
        
        {oversetCount > 0 && (
          <Badge variant="destructive" className="gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            {oversetCount} field{oversetCount !== 1 ? 's' : ''} overflow
          </Badge>
        )}
      </div>

      {/* Preview area */}
      <div className="flex-1 relative bg-muted/20 overflow-hidden">
        <SingleLabelPreview
          template={template}
          designConfig={designConfig}
          dataRow={currentLabel}
          fieldMappings={fieldMappings}
          labelIndex={currentIndex}
        />

        {/* Navigation arrows - positioned over preview */}
        <div className="absolute inset-0 flex items-center justify-between px-4 pointer-events-none">
          <Button
            variant="outline"
            size="icon"
            onClick={onPrev}
            disabled={currentIndex === 0}
            className="pointer-events-auto h-12 w-12 rounded-full bg-background/95 shadow-lg hover:bg-background border-2"
          >
            <ChevronLeft className="h-6 w-6" />
          </Button>
          
          <Button
            variant="outline"
            size="icon"
            onClick={onNext}
            disabled={currentIndex >= totalLabels - 1}
            className="pointer-events-auto h-12 w-12 rounded-full bg-background/95 shadow-lg hover:bg-background border-2"
          >
            <ChevronRight className="h-6 w-6" />
          </Button>
        </div>
      </div>

      {/* Footer hint */}
      <div className="flex-shrink-0 px-4 py-2 border-t bg-background">
        <div className="text-xs text-muted-foreground text-center">
          Use ← → arrow keys to navigate • ESC to return to design
        </div>
      </div>
    </div>
  );
}
