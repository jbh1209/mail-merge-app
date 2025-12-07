// =============================================================================
// DESIGN EDITOR V2 - UI SHELL
// =============================================================================
// Polotno-style editor shell with tabbed side panel, workspace, and pages
// timeline. This is the main container for the V2 editor experience.
// =============================================================================

import React, { useEffect, useMemo, useRef, useCallback } from 'react';
import { useEditorV2Store } from '@/state/editorV2Store';
import type { DesignDocument, DesignPage, DesignElement } from '@/lib/editor-v2/types';
import type { CanvasEngine } from '@/lib/editor-v2/engine';
import { V2TopBar } from './V2TopBar';
import { V2SidePanel } from './V2SidePanel';
import { V2Workspace } from './V2Workspace';
import { V2PagesTimeline } from './V2PagesTimeline';
import { V2StatusBar } from './V2StatusBar';
import { TooltipProvider } from '@/components/ui/tooltip';

export interface DesignEditorV2ShellProps {
  document: DesignDocument;
  engine: CanvasEngine;
  onDocumentChange?: (doc: DesignDocument) => void;
}

export function DesignEditorV2Shell({ document, engine, onDocumentChange }: DesignEditorV2ShellProps) {
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);

  const {
    document: storeDocument,
    activePageId,
    selectedElementIds,
    zoom,
    showGrid,
    setDocument,
    setActivePage,
    setSelection,
    setZoom,
    toggleGrid,
    addPage,
    addElement,
    updatePage,
    updateElement,
    removeElement
  } = useEditorV2Store();

  // Calculate activePage BEFORE using it in effects
  const activePage: DesignPage | undefined = useMemo(() => {
    if (!storeDocument) return undefined;
    return storeDocument.pages.find(page => page.id === activePageId) ?? storeDocument.pages[0];
  }, [storeDocument, activePageId]);

  const activePageRef = useRef<DesignPage | null>(null);

  // Keep store in sync with prop document
  useEffect(() => {
    setDocument(document);
  }, [document, setDocument]);

  // Keep ref updated
  useEffect(() => {
    activePageRef.current = activePage ?? null;
  }, [activePage]);

  // Mount the canvas engine once
  useEffect(() => {
    if (!canvasContainerRef.current) return;
    engine.mount(canvasContainerRef.current, { enableGrid: showGrid }, {
      onSelectionChange: ids => setSelection(ids),
      onElementsChange: elements => {
        const page = activePageRef.current;
        if (!page) return;
        updatePage(page.id, { elements });
      }
    });

    return () => engine.unmount();
  }, [engine, setSelection, updatePage]);

  // Sync grid state
  useEffect(() => {
    engine.setGrid(showGrid);
  }, [engine, showGrid]);

  // Load the active page into the engine
  useEffect(() => {
    if (!activePage) return;
    engine.loadPage(activePage);
  }, [activePage, engine]);

  // Keep zoom state and engine synchronized
  useEffect(() => {
    engine.setZoom(zoom);
  }, [engine, zoom]);

  // Propagate document changes upward
  useEffect(() => {
    if (storeDocument) {
      onDocumentChange?.(storeDocument);
    }
  }, [storeDocument, onDocumentChange]);

  // Handler for adding elements (used by side panel)
  const handleAddElement = useCallback((element: DesignElement) => {
    if (!activePage) return;
    addElement(activePage.id, element);
    engine.addElement(element);
  }, [activePage, addElement, engine]);

  // Handler for selecting elements from layers panel
  const handleSelectElement = useCallback((elementId: string) => {
    setSelection([elementId]);
    engine.setSelection([elementId]);
  }, [setSelection, engine]);

  // Handler for updating elements from layers panel
  const handleUpdateElement = useCallback((elementId: string, updates: Partial<DesignElement>) => {
    if (!activePage) return;
    updateElement(activePage.id, elementId, updates);
    engine.updateElement(elementId, updates);
  }, [activePage, updateElement, engine]);

  // Handler for removing elements
  const handleRemoveElement = useCallback((elementId: string) => {
    if (!activePage) return;
    removeElement(activePage.id, elementId);
    engine.removeElement(elementId);
  }, [activePage, removeElement, engine]);

  if (!storeDocument || !activePage) {
    return (
      <div className="flex h-full items-center justify-center bg-muted/30">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading editor...</p>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex h-full flex-col bg-background">
        {/* Top Bar */}
        <V2TopBar
          documentName={storeDocument.name}
          zoom={zoom}
          onZoomChange={setZoom}
          showGrid={showGrid}
          onToggleGrid={toggleGrid}
        />

        {/* Main Content Area */}
        <div className="flex min-h-0 flex-1">
          {/* Left Side Panel */}
          <V2SidePanel
            activePage={activePage}
            selectedElementIds={selectedElementIds}
            onAddElement={handleAddElement}
            onSelectElement={handleSelectElement}
            onUpdateElement={handleUpdateElement}
            onRemoveElement={handleRemoveElement}
          />

          {/* Center: Workspace + Timeline */}
          <div className="flex min-w-0 flex-1 flex-col">
            {/* Canvas Workspace */}
            <V2Workspace
              ref={canvasContainerRef}
              zoom={zoom}
              onZoomChange={setZoom}
              selectedCount={selectedElementIds.length}
            />

            {/* Pages Timeline */}
            <V2PagesTimeline
              pages={storeDocument.pages}
              activePageId={activePage.id}
              onPageSelect={setActivePage}
              onAddPage={() => {
                const newPage: DesignPage = {
                  id: crypto.randomUUID(),
                  name: `Page ${storeDocument.pages.length + 1}`,
                  widthMm: activePage.widthMm,
                  heightMm: activePage.heightMm,
                  background: { color: '#ffffff' },
                  elements: []
                };
                addPage(newPage);
              }}
            />
          </div>
        </div>

        {/* Status Bar */}
        <V2StatusBar
          activePage={activePage}
          selectedCount={selectedElementIds.length}
          zoom={zoom}
        />
      </div>
    </TooltipProvider>
  );
}
