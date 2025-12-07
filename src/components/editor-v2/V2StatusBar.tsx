// =============================================================================
// V2 Editor Status Bar
// =============================================================================

import React from 'react';
import type { DesignPage } from '@/lib/editor-v2/types';

interface V2StatusBarProps {
  activePage: DesignPage;
  selectedCount: number;
  zoom: number;
}

export function V2StatusBar({ activePage, selectedCount, zoom }: V2StatusBarProps) {
  return (
    <div className="flex h-7 items-center justify-between border-t bg-muted/30 px-4 text-xs text-muted-foreground">
      <div className="flex items-center gap-4">
        <span>
          Page: <span className="font-medium text-foreground">{activePage.name}</span>
        </span>
        <span>
          Size: {activePage.widthMm}mm × {activePage.heightMm}mm
        </span>
        <span>
          Elements: {activePage.elements.length}
        </span>
      </div>
      <div className="flex items-center gap-4">
        {selectedCount > 0 && (
          <span className="text-primary">
            {selectedCount} selected
          </span>
        )}
        <span>
          Zoom: {Math.round(zoom * 100)}%
        </span>
      </div>
    </div>
  );
}