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
        border: '1px solid hsl(var(--border))',
        borderRadius: '2px'
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Field Label */}
      <div className="absolute -top-5 left-0 text-xs text-muted-foreground bg-background px-1 rounded-t border border-b-0 border-border">
        {field.templateField}
      </div>

      {/* Field Content */}
      <div
        className="w-full h-full overflow-hidden flex items-center px-1"
        style={{
          fontSize: `${field.style.fontSize * scale * 0.5}px`,
          fontFamily: field.style.fontFamily,
          fontWeight: field.style.fontWeight,
          fontStyle: field.style.fontStyle,
          textAlign: field.style.textAlign,
          color: field.style.color,
          alignItems: field.style.verticalAlign === 'top' ? 'flex-start' : 
                     field.style.verticalAlign === 'bottom' ? 'flex-end' : 'center'
        }}
      >
        <span className="truncate">{displayText}</span>
      </div>

      {/* Action Buttons */}
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
          <div className="cursor-grab">
            <GripVertical className="h-3 w-3 text-muted-foreground" />
          </div>
        </div>
      )}

      {/* Resize Handle */}
      {isSelected && (
        <div
          className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize bg-primary rounded-tl"
          onMouseDown={handleResizeMouseDown}
        />
      )}
    </div>
  );
}
