import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, X, AlertTriangle } from 'lucide-react';
import { SimpleLabelPreview } from './SimpleLabelPreview';
import { detectTextOverflow } from '@/lib/text-measurement-utils';
import { mmToPx } from '@/lib/canvas-utils';

interface LabelFullPagePreviewProps {
  open: boolean;
  onClose: () => void;
  template: any;
  designConfig: any;
  allDataRows: any[];
  fieldMappings: Record<string, string>;
}

export function LabelFullPagePreview({
  open,
  onClose,
  template,
  designConfig,
  allDataRows,
  fieldMappings
}: LabelFullPagePreviewProps) {
  const [currentPage, setCurrentPage] = useState(0);

  // Single label preview mode: 1 label per page
  const totalPages = allDataRows.length;
  const currentLabel = allDataRows[currentPage];

  // Count overset fields for current label
  const oversetCount = useMemo(() => {
    if (!currentLabel || !designConfig?.fields) return 0;
    
    const fields = designConfig.fields;
    let count = 0;
    
    fields.forEach((field: any) => {
      if (field.fieldType !== 'text') return;
      
      const dataColumn = fieldMappings[field.templateField];
      if (!dataColumn) return;
      
      const text = String(currentLabel[dataColumn] || '');
      if (!text) return;

      const containerWidth = mmToPx(field.size.width, 1);
      const containerHeight = mmToPx(field.size.height, 1);
      
      const overflow = detectTextOverflow(
        text,
        containerWidth,
        containerHeight,
        field.style.fontSize,
        field.style.fontFamily,
        field.style.fontWeight
      );

      if (overflow.hasOverflow) {
        count++;
      }
    });

    return count;
  }, [currentLabel, designConfig, fieldMappings]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft' && currentPage > 0) {
        setCurrentPage(p => p - 1);
      } else if (e.key === 'ArrowRight' && currentPage < totalPages - 1) {
        setCurrentPage(p => p + 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, currentPage, totalPages, onClose]);

  // Reset to page 0 when opening
  useEffect(() => {
    if (open) {
      setCurrentPage(0);
    }
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center">
      {/* Header with close button and label counter */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 py-4 bg-gradient-to-b from-black/60 to-transparent">
        <div className="flex items-center gap-3">
          <div className="text-white text-lg font-semibold">
            Label {currentPage + 1} of {totalPages}
          </div>
          {oversetCount > 0 && (
            <div className="flex items-center gap-2 bg-destructive/20 border border-destructive/40 px-3 py-1 rounded-full">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span className="text-destructive text-sm font-medium">
                {oversetCount} field{oversetCount !== 1 ? 's' : ''} overflow
              </span>
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="text-white hover:bg-white/20"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Previous button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
        disabled={currentPage === 0}
        className="absolute left-4 top-1/2 -translate-y-1/2 h-16 w-16 text-white hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <ChevronLeft className="h-10 w-10" />
      </Button>

      {/* Single label preview - centered and large */}
      <div className="w-full h-full flex items-center justify-center px-24">
        <SimpleLabelPreview
          template={template}
          designConfig={designConfig}
          dataRow={currentLabel}
          fieldMappings={fieldMappings}
          labelIndex={currentPage}
        />
      </div>

      {/* Next button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
        disabled={currentPage >= totalPages - 1}
        className="absolute right-4 top-1/2 -translate-y-1/2 h-16 w-16 text-white hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <ChevronRight className="h-10 w-10" />
      </Button>

      {/* Footer with keyboard hints */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center px-6 py-4 bg-gradient-to-t from-black/60 to-transparent">
        <div className="text-white/70 text-sm">
          Use <kbd className="px-2 py-1 bg-white/20 rounded">←</kbd> <kbd className="px-2 py-1 bg-white/20 rounded">→</kbd> arrow keys or click arrows to navigate • <kbd className="px-2 py-1 bg-white/20 rounded">ESC</kbd> to close
        </div>
      </div>
    </div>,
    document.body
  );
}
