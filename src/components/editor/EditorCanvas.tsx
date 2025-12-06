// ============================================================================
// EDITOR CANVAS - Main Canvas Viewport with Polotno-style Styling
// ============================================================================

import React, { useRef, useEffect, useCallback } from 'react';
import type { DesignPage, DesignElement } from '@/lib/editor/types';
import type { CanvasEngine } from '@/lib/editor/engine';
import { cn } from '@/lib/utils';

interface EditorCanvasProps {
  page: DesignPage;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  showGrid: boolean;
  selectedElementIds: string[];
  onSelectionChange: (ids: string[]) => void;
  onElementsChange: (elements: DesignElement[]) => void;
  sampleData?: Record<string, unknown>;
  recordIndex?: number;
  onEngineReady?: (engine: CanvasEngine) => void;
  readOnly?: boolean;
}

// Conversion: 1mm = 3.7795275591 pixels at 96 DPI
const MM_TO_PX = 3.7795275591;

export function EditorCanvas({
  page,
  zoom,
  onZoomChange,
  showGrid,
  selectedElementIds,
  onSelectionChange,
  onElementsChange,
  sampleData,
  recordIndex = 0,
  onEngineReady,
  readOnly = false
}: EditorCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  
  // Calculate page dimensions in pixels
  const pageWidthPx = page.widthMm * MM_TO_PX * zoom;
  const pageHeightPx = page.heightMm * MM_TO_PX * zoom;
  
  // Handle wheel zoom
  const handleWheel = useCallback((e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      const newZoom = Math.min(4, Math.max(0.25, zoom + delta));
      onZoomChange(newZoom);
    }
  }, [zoom, onZoomChange]);
  
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);
  
  // Render grid lines
  const renderGrid = () => {
    if (!showGrid) return null;
    
    const gridSizeMm = 5; // 5mm grid
    const gridSizePx = gridSizeMm * MM_TO_PX * zoom;
    const horizontalLines = Math.ceil(page.heightMm / gridSizeMm);
    const verticalLines = Math.ceil(page.widthMm / gridSizeMm);
    
    return (
      <svg
        className="absolute inset-0 pointer-events-none"
        width={pageWidthPx}
        height={pageHeightPx}
      >
        {/* Vertical lines */}
        {Array.from({ length: verticalLines + 1 }).map((_, i) => (
          <line
            key={`v-${i}`}
            x1={i * gridSizePx}
            y1={0}
            x2={i * gridSizePx}
            y2={pageHeightPx}
            stroke="hsl(var(--border))"
            strokeWidth={i % 2 === 0 ? 0.5 : 0.25}
            opacity={0.5}
          />
        ))}
        {/* Horizontal lines */}
        {Array.from({ length: horizontalLines + 1 }).map((_, i) => (
          <line
            key={`h-${i}`}
            x1={0}
            y1={i * gridSizePx}
            x2={pageWidthPx}
            y2={i * gridSizePx}
            stroke="hsl(var(--border))"
            strokeWidth={i % 2 === 0 ? 0.5 : 0.25}
            opacity={0.5}
          />
        ))}
      </svg>
    );
  };
  
  // Get value from sample data for an element
  const getElementValue = (element: DesignElement): string => {
    if (element.staticContent) return element.staticContent;
    if (!element.dataField || !sampleData) return `{{${element.dataField || element.name || 'field'}}}`;
    
    const value = sampleData[element.dataField];
    if (value === undefined || value === null) return `{{${element.dataField}}}`;
    return String(value);
  };
  
  // Render a single element (simplified preview)
  const renderElement = (element: DesignElement) => {
    if (!element.visible) return null;
    
    const left = element.x * MM_TO_PX * zoom;
    const top = element.y * MM_TO_PX * zoom;
    const width = element.width * MM_TO_PX * zoom;
    const height = element.height * MM_TO_PX * zoom;
    const isSelected = selectedElementIds.includes(element.id);
    
    const fontSize = (element.style.fontSize || 12) * zoom * 0.75; // Approximate pt to px
    
    return (
      <div
        key={element.id}
        className={cn(
          "absolute cursor-move transition-shadow",
          isSelected && "ring-2 ring-primary ring-offset-1",
          element.locked && "cursor-not-allowed opacity-75"
        )}
        style={{
          left,
          top,
          width,
          height,
          transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
          zIndex: element.zIndex
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (!readOnly && !element.locked) {
            onSelectionChange([element.id]);
          }
        }}
      >
        {/* Element content based on kind */}
        {element.kind === 'text' || element.kind === 'address_block' ? (
          <div
            className="w-full h-full overflow-hidden p-0.5"
            style={{
              fontSize,
              fontFamily: element.style.fontFamily,
              fontWeight: element.style.fontWeight,
              fontStyle: element.style.fontStyle,
              textAlign: element.style.textAlign as any,
              color: element.style.color,
              lineHeight: 1.2,
              display: 'flex',
              alignItems: element.style.verticalAlign === 'middle' ? 'center' 
                : element.style.verticalAlign === 'bottom' ? 'flex-end' 
                : 'flex-start'
            }}
          >
            <span className="w-full">{getElementValue(element)}</span>
          </div>
        ) : element.kind === 'barcode' ? (
          <div className="w-full h-full flex items-center justify-center bg-muted/30 border border-dashed border-muted-foreground/30">
            <span className="text-xs text-muted-foreground">Barcode</span>
          </div>
        ) : element.kind === 'qr' ? (
          <div className="w-full h-full flex items-center justify-center bg-muted/30 border border-dashed border-muted-foreground/30">
            <span className="text-xs text-muted-foreground">QR</span>
          </div>
        ) : element.kind === 'sequence' ? (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{
              fontSize,
              fontFamily: element.style.fontFamily,
              fontWeight: element.style.fontWeight,
              color: element.style.color
            }}
          >
            {String(recordIndex + 1).padStart(
              (element.config as any)?.padding || 0, 
              '0'
            )}
          </div>
        ) : element.kind === 'shape' ? (
          <div
            className="w-full h-full"
            style={{
              backgroundColor: element.style.fill,
              border: `${(element.style.strokeWidth || 0.5) * zoom}px solid ${element.style.stroke}`,
              borderRadius: (element.config as any)?.shapeType === 'circle' ? '50%' : 0,
              opacity: element.style.opacity || 1
            }}
          />
        ) : element.kind === 'image' ? (
          <div className="w-full h-full flex items-center justify-center bg-muted/30 border border-dashed border-muted-foreground/30">
            <span className="text-xs text-muted-foreground">Image</span>
          </div>
        ) : null}
        
        {/* Selection handles */}
        {isSelected && !readOnly && (
          <>
            <div className="absolute -top-1 -left-1 w-2 h-2 bg-primary rounded-sm" />
            <div className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-sm" />
            <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-primary rounded-sm" />
            <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-primary rounded-sm" />
          </>
        )}
      </div>
    );
  };
  
  return (
    <div 
      ref={containerRef}
      className="w-full h-full bg-[hsl(var(--muted))] overflow-auto flex items-center justify-center p-8"
      onClick={() => onSelectionChange([])}
    >
      {/* Page container with shadow */}
      <div
        ref={canvasContainerRef}
        className="relative bg-white shadow-xl"
        style={{
          width: pageWidthPx,
          height: pageHeightPx,
          minWidth: pageWidthPx,
          minHeight: pageHeightPx,
          backgroundColor: page.backgroundColor || '#ffffff'
        }}
      >
        {/* Grid overlay */}
        {renderGrid()}
        
        {/* Elements */}
        {page.elements.map(renderElement)}
        
        {/* Bleed indicator (if configured) */}
        {page.bleedMm && page.bleedMm > 0 && (
          <div
            className="absolute border border-dashed border-rose-400/50 pointer-events-none"
            style={{
              left: -(page.bleedMm * MM_TO_PX * zoom),
              top: -(page.bleedMm * MM_TO_PX * zoom),
              right: -(page.bleedMm * MM_TO_PX * zoom),
              bottom: -(page.bleedMm * MM_TO_PX * zoom),
              width: (page.widthMm + page.bleedMm * 2) * MM_TO_PX * zoom,
              height: (page.heightMm + page.bleedMm * 2) * MM_TO_PX * zoom
            }}
          />
        )}
      </div>
    </div>
  );
}
