// ============================================================================
// EDITOR STATUS BAR - Zoom, Record Navigation, Status Info
// ============================================================================

import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ChevronLeft, ChevronRight, Grid3X3 } from 'lucide-react';
import { DesignElement } from '@/lib/editor/types';

interface EditorStatusBarProps {
  zoom: number;
  pageIndex: number;
  totalPages: number;
  selectedCount: number;
  recordIndex: number;
  totalRecords: number;
  onPreviousRecord: () => void;
  onNextRecord: () => void;
  gridEnabled: boolean;
  pageSize: { width: number; height: number };
  selectedElement?: DesignElement;
}

export function EditorStatusBar({
  zoom,
  pageIndex,
  totalPages,
  selectedCount,
  recordIndex,
  totalRecords,
  onPreviousRecord,
  onNextRecord,
  gridEnabled,
  pageSize,
  selectedElement
}: EditorStatusBarProps) {
  return (
    <div className="flex items-center justify-between h-8 px-3 border-t bg-card text-xs">
      {/* Left Section - Page & Selection Info */}
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground">
          Page {pageIndex + 1} of {totalPages}
        </span>
        
        <Separator orientation="vertical" className="h-4" />
        
        <span className="text-muted-foreground">
          {pageSize.width} × {pageSize.height} mm
        </span>
        
        {selectedCount > 0 && (
          <>
            <Separator orientation="vertical" className="h-4" />
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {selectedCount} selected
            </Badge>
          </>
        )}
        
        {/* Show selected element dimensions */}
        {selectedElement && (
          <>
            <Separator orientation="vertical" className="h-4" />
            <span className="text-muted-foreground font-mono">
              {selectedElement.width.toFixed(1)} × {selectedElement.height.toFixed(1)} mm
            </span>
            <span className="text-muted-foreground/70">
              @ {selectedElement.x.toFixed(1)}, {selectedElement.y.toFixed(1)}
            </span>
          </>
        )}
      </div>
      
      {/* Center Section - Record Navigation */}
      {totalRecords > 0 && (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onPreviousRecord}
            disabled={recordIndex === 0}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="min-w-[80px] text-center text-muted-foreground">
            Record {recordIndex + 1} of {totalRecords}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onNextRecord}
            disabled={recordIndex >= totalRecords - 1}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
      
      {/* Right Section - Zoom & Grid Status */}
      <div className="flex items-center gap-3">
        {gridEnabled && (
          <div className="flex items-center gap-1 text-muted-foreground">
            <Grid3X3 className="h-3 w-3" />
            <span>Grid</span>
          </div>
        )}
        
        <Separator orientation="vertical" className="h-4" />
        
        {/* Keyboard shortcuts hint */}
        <span className="text-muted-foreground/70 hidden sm:inline">
          ⌘C Copy · ⌘V Paste · ⌘D Duplicate · ⌫ Delete
        </span>
        
        <Separator orientation="vertical" className="h-4" />
        
        <span className="font-medium">
          {Math.round(zoom * 100)}%
        </span>
      </div>
    </div>
  );
}
