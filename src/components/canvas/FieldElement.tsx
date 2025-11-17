import { useRef, useState } from 'react';
import { FieldConfig, mmToPx, pxToMm, generateSampleText } from '@/lib/canvas-utils';
import { GripVertical, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FieldElementProps {
  field: FieldConfig;
  scale: number;
  isSelected: boolean;
  sampleData?: Record<string, any>;
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
          <div className="flex items-center h-full px-2">
            {field.showLabel && field.labelStyle?.position === 'inline' && (
              <span 
                className="mr-2 text-muted-foreground uppercase font-medium"
                style={{ 
                  fontSize: `${(field.labelStyle.fontSize / 72) * 96}px`,
                  color: field.labelStyle.color 
                }}
              >
                {field.templateField}:
              </span>
            )}
            <span style={{ 
              fontSize: `${(field.style.fontSize / 72) * 96}px`,
              fontFamily: field.style.fontFamily,
              fontWeight: field.style.fontWeight,
              fontStyle: field.style.fontStyle,
              color: field.style.color
            }}>
              {displayText}
            </span>
          </div>
        );
    }
  };

  return (
    <div
      className={`absolute cursor-move select-none transition-shadow ${
        isSelected ? 'ring-2 ring-primary shadow-lg z-10' : 'hover:ring-1 hover:ring-primary/50'
      } ${isDragging || isResizing ? 'cursor-grabbing' : ''}`}
      style={{
        left: `${mmToPx(field.position.x, scale)}px`,
        top: `${mmToPx(field.position.y, scale)}px`,
        width: `${mmToPx(field.size.width, scale)}px`,
        height: `${mmToPx(field.size.height, scale)}px`,
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        border: '1px solid #e5e7eb',
        borderRadius: '4px',
        overflow: 'hidden'
      }}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
    >
      {/* Label above field if enabled */}
      {field.showLabel && field.labelStyle?.position === 'above' && (
        <div 
          className="text-muted-foreground px-1 py-0.5 bg-background/80 border-b uppercase font-medium truncate"
          style={{ 
            fontSize: `${(field.labelStyle.fontSize / 72) * 96}px`,
            color: field.labelStyle.color 
          }}
        >
          {field.templateField}
        </div>
      )}

      {/* Field content */}
      <div 
        className="overflow-hidden"
        style={{
          height: field.showLabel && field.labelStyle?.position === 'above' ? 'calc(100% - 20px)' : '100%',
          textAlign: field.style.textAlign
        }}
      >
        {renderFieldContent()}
      </div>

      {/* Action buttons and type badge when selected */}
      {isSelected && (
        <>
          {/* Field type badge */}
          {field.fieldType !== 'text' && (
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-accent text-accent-foreground text-[10px] font-medium rounded-full shadow-lg">
              {field.fieldType === 'barcode' && 'Barcode'}
              {field.fieldType === 'qrcode' && 'QR Code'}
              {field.fieldType === 'sequence' && 'Sequence'}
            </div>
          )}
          
          <Button
            variant="destructive"
            size="icon"
            className="absolute -top-3 -right-3 h-6 w-6 p-0 rounded-full shadow-lg"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <X className="h-3 w-3" />
          </Button>

          <div className="absolute -top-3 -left-3 h-6 w-6 p-0 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center cursor-grab">
            <GripVertical className="h-3 w-3" />
          </div>

          {/* Resize handle */}
          <div
            className="absolute -bottom-2 -right-2 h-4 w-4 bg-primary rounded-full cursor-se-resize shadow-lg border-2 border-background"
            onMouseDown={handleResizeMouseDown}
          />
        </>
      )}
    </div>
  );
}
