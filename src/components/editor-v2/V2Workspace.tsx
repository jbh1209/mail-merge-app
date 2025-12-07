// =============================================================================
// V2 Editor Workspace - Canvas viewport with zoom/pan
// =============================================================================

import React, { forwardRef } from 'react';
import { Button } from '@/components/ui/button';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@/components/ui/tooltip';

interface V2WorkspaceProps {
  zoom: number;
  onZoomChange: (zoom: number) => void;
  selectedCount: number;
}

export const V2Workspace = forwardRef<HTMLDivElement, V2WorkspaceProps>(
  ({ zoom, onZoomChange, selectedCount }, ref) => {
    return (
      <div className="relative flex-1 overflow-hidden bg-muted/30">
        {/* Canvas Container */}
        <div className="absolute inset-0 flex items-center justify-center overflow-auto p-8">
          <div
            ref={ref}
            className="shadow-2xl ring-1 ring-border/50"
            style={{ minWidth: 400, minHeight: 300 }}
          />
        </div>

        {/* Floating Zoom Controls */}
        <div className="absolute bottom-4 right-4 flex items-center gap-1 rounded-lg border bg-card p-1 shadow-lg">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onZoomChange(Math.max(0.25, zoom - 0.25))}
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Zoom Out</TooltipContent>
          </Tooltip>

          <span className="w-12 text-center text-xs font-medium">
            {Math.round(zoom * 100)}%
          </span>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onZoomChange(Math.min(4, zoom + 0.25))}
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Zoom In</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onZoomChange(1)}
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Fit to Screen</TooltipContent>
          </Tooltip>
        </div>

        {/* Selection Info */}
        {selectedCount > 0 && (
          <div className="absolute left-4 top-4 rounded-lg border bg-card px-3 py-1.5 text-xs font-medium shadow-lg">
            {selectedCount} element{selectedCount !== 1 ? 's' : ''} selected
          </div>
        )}
      </div>
    );
  }
);

V2Workspace.displayName = 'V2Workspace';