import { useRef, useState } from 'react';
import { FieldConfig, mmToPx, pxToMm, generateSampleText } from '@/lib/canvas-utils';
import { GripVertical, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FieldElementProps {
  field: FieldConfig;
  scale: number;
  isSelected: boolean;
  sampleData?: Record<string, any>;
  showAllLabels?: boolean;
  hasOverflow?: boolean;
  overflowPercentage?: number;
  onSelect: () => void;
  onMove: (position: { x: number; y: number }) => void;
  onResize: (size: { width: number; height: number }) => void;
  onMoveEnd: () => void;
  onDelete: () => void;
}

export function FieldElement({
  field,
  scale,
  isSelected,
  sampleData,
  showAllLabels = false,
  hasOverflow = false,
  overflowPercentage = 0,
  onSelect,
  onMove,
  onResize,
  onMoveEnd,
  onDelete
}: FieldElementProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; fieldX: number; fieldY: number } | null>(null);
  const resizeStartRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    
    onSelect();
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      fieldX: field.position.x,
      fieldY: field.position.y
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!dragStartRef.current) return;
      
      const deltaX = moveEvent.clientX - dragStartRef.current.x;
      const deltaY = moveEvent.clientY - dragStartRef.current.y;
      
      onMove({
        x: dragStartRef.current.fieldX + pxToMm(deltaX, scale),
        y: dragStartRef.current.fieldY + pxToMm(deltaY, scale)
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
      onMoveEnd();
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    
    setIsResizing(true);
    resizeStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      width: field.size.width,
      height: field.size.height
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!resizeStartRef.current) return;
      
      const deltaX = moveEvent.clientX - resizeStartRef.current.x;
      const deltaY = moveEvent.clientY - resizeStartRef.current.y;
      
      onResize({
        width: Math.max(10, resizeStartRef.current.width + pxToMm(deltaX, scale)),
        height: Math.max(5, resizeStartRef.current.height + pxToMm(deltaY, scale))
      });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      resizeStartRef.current = null;
      onMoveEnd();
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const displayText = sampleData?.[field.templateField] || generateSampleText(field.templateField);
  const shouldShowLabel = showAllLabels || field.showLabel;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect();
  };

  // Render field content based on type
  const renderFieldContent = () => {
    switch (field.fieldType) {
      case 'barcode':
        return (
          <div className="flex flex-col items-center justify-center h-full gap-1">
            <div className="flex gap-[1px] h-1/2 items-center">
              {Array.from({ length: 20 }).map((_, i) => (
                <div key={i} className="bg-black h-full" style={{ width: i % 3 === 0 ? '3px' : '2px' }} />
              ))}
            </div>
            <span className="text-[8px] font-mono">{displayText}</span>
          </div>
        );
      
      case 'qrcode':
        return (
          <div className="flex items-center justify-center h-full">
            <div className="grid grid-cols-8 grid-rows-8 gap-[1px] aspect-square h-4/5">
              {Array.from({ length: 64 }).map((_, i) => (
                <div key={i} className={`${Math.random() > 0.5 ? 'bg-black' : 'bg-white'} border border-gray-200`} />
              ))}
            </div>
          </div>
        );
      
      case 'sequence':
        return (
          <div className="flex items-center h-full px-2">
            <span className="font-mono font-semibold">
              {field.typeConfig?.sequencePrefix || '#'}
              {String(field.typeConfig?.sequenceStart || 1).padStart(field.typeConfig?.sequencePadding || 3, '0')}
            </span>
          </div>
        );
      
      default: // text
        return (
          <div 
            className="flex items-start h-full px-2 py-1"
            style={{
              overflow: 'hidden',
            }}
          >
            {field.showLabel && field.labelStyle?.position === 'inline' && (
              <span 
                className="mr-2 text-muted-foreground uppercase font-medium flex-shrink-0"
                style={{ 
                  fontSize: `${(field.labelStyle.fontSize / 72) * 96}px`,
                  color: field.labelStyle.color 
                }}
              >
                {field.templateField}:
              </span>
            )}
            <span 
              style={{ 
                fontSize: `${(field.style.fontSize / 72) * 96}px`,
                fontFamily: field.style.fontFamily,
                fontWeight: field.style.fontWeight,
                fontStyle: field.style.fontStyle,
                color: field.style.color,
                whiteSpace: (field.style as any).whiteSpace || 'normal',
                wordWrap: (field.style as any).wordWrap || 'normal',
                lineHeight: (field.style as any).lineHeight || '1.2',
                display: (field.style as any).display || 'block'
              }}
            >
              {displayText}
            </span>
          </div>
        );
    }
  };

  return (
    <div
      className="absolute"
      style={{
        left: `${mmToPx(field.position.x, scale)}px`,
        top: `${mmToPx(field.position.y, scale)}px`,
      }}
    >
      {/* Field Label - positioned above the field */}
      {shouldShowLabel && (
        <div
          className="text-muted-foreground font-medium mb-0.5 pointer-events-none select-none"
          style={{
            fontSize: `${(field.labelStyle?.fontSize || 6) * scale}pt`,
            lineHeight: 1.2
          }}
        >
          {field.templateField}
        </div>
      )}
      
      {/* Field Content */}
      <div
        className={`border-2 transition-all duration-150 ${
          hasOverflow 
            ? 'border-red-500 ring-2 ring-red-500/20' 
            : isSelected 
              ? 'border-primary ring-2 ring-primary/20 z-10' 
              : 'border-border/50 hover:border-border'
        } ${isDragging && 'cursor-grabbing opacity-70'} ${isResizing && 'opacity-70'}`}
        style={{
          width: `${mmToPx(field.size.width, scale)}px`,
          height: `${mmToPx(field.size.height, scale)}px`,
          cursor: isDragging ? 'grabbing' : 'grab',
          backgroundColor: 'rgba(255, 255, 255, 0.9)',
          borderRadius: '4px',
          overflow: 'hidden'
        }}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        title={hasOverflow ? `⚠️ Content overflow: ${overflowPercentage.toFixed(0)}%\nIncrease field height or reduce font size` : ''}
      >
        {renderFieldContent()}

        {/* Overflow warning badge */}
        {hasOverflow && (
          <div 
            className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold shadow-md z-20"
            title={`Content overflow: ${overflowPercentage.toFixed(0)}%`}
          >
            !
          </div>
        )}

        {/* Selected state actions */}
        {isSelected && (
          <div className="absolute top-1 right-1 flex gap-1">
            <Button
              size="sm"
              variant="destructive"
              className="h-5 w-5 p-0"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            >
              <X className="h-3 w-3" />
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="h-5 w-5 p-0 cursor-move"
              onMouseDown={(e) => {
                e.stopPropagation();
                handleMouseDown(e as any);
              }}
            >
              <GripVertical className="h-3 w-3" />
            </Button>
          </div>
        )}

        {/* Resize handle */}
        {isSelected && (
          <div
            className="absolute bottom-0 right-0 w-3 h-3 bg-primary cursor-nwse-resize"
            onMouseDown={handleResizeMouseDown}
            style={{ cursor: 'nwse-resize' }}
          />
        )}
      </div>
    </div>
  );
}
