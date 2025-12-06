// ============================================================================
// DESIGN EDITOR SHELL - Main Container
// ============================================================================
// This is the main container component for the Polotno-style design editor.
// It provides the overall layout with top bar, sidebars, canvas, and status bar.
// ============================================================================

import React, { useState, useCallback, useRef } from 'react';
import { EditorTopBar } from './EditorTopBar';
import { EditorLeftSidebar } from './EditorLeftSidebar';
import { EditorCanvas } from './EditorCanvas';
import { EditorRightSidebar } from './EditorRightSidebar';
import { EditorStatusBar } from './EditorStatusBar';
import type { DesignDocument, DesignPage, DesignElement, EditorState } from '@/lib/editor/types';
import type { CanvasEngine } from '@/lib/editor/engine';

export interface DesignEditorShellProps {
  // Document to edit
  document: DesignDocument;
  onDocumentChange?: (doc: DesignDocument) => void;
  
  // Sample data for VDP preview
  sampleData?: Record<string, unknown>[];
  availableFields?: string[];
  
  // Actions
  onSave?: (doc: DesignDocument) => void;
  onExport?: () => void;
  onClose?: () => void;
  
  // Read-only mode
  readOnly?: boolean;
}

export function DesignEditorShell({
  document,
  onDocumentChange,
  sampleData = [],
  availableFields = [],
  onSave,
  onExport,
  onClose,
  readOnly = false
}: DesignEditorShellProps) {
  // Editor state
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  const [zoom, setZoom] = useState(1);
  const [showGrid, setShowGrid] = useState(true);
  const [sampleDataIndex, setSampleDataIndex] = useState(0);
  const [leftSidebarTab, setLeftSidebarTab] = useState<'pages' | 'assets' | 'data'>('assets');
  
  // Canvas engine ref
  const engineRef = useRef<CanvasEngine | null>(null);
  
  // Get active page
  const activePage = document.pages[activePageIndex];
  
  // Get selected elements
  const selectedElements = activePage?.elements.filter(el => 
    selectedElementIds.includes(el.id)
  ) || [];
  
  // Current sample data record
  const currentSampleData = sampleData[sampleDataIndex] || {};
  
  // Handle document update (for page management)
  const handleDocumentUpdate = useCallback((updates: Partial<DesignDocument>) => {
    if (!onDocumentChange) return;
    onDocumentChange({
      ...document,
      ...updates
    });
  }, [document, onDocumentChange]);
  
  // Handle page update
  const handlePageUpdate = useCallback((pageIndex: number, updates: Partial<DesignPage>) => {
    if (!onDocumentChange) return;
    const updatedPages = [...document.pages];
    updatedPages[pageIndex] = {
      ...updatedPages[pageIndex],
      ...updates
    };
    onDocumentChange({
      ...document,
      pages: updatedPages
    });
  }, [document, onDocumentChange]);
  
  // Handle element updates
  const handleElementsChange = useCallback((elements: DesignElement[]) => {
    if (!activePage || !onDocumentChange) return;
    
    const updatedPages = [...document.pages];
    updatedPages[activePageIndex] = {
      ...activePage,
      elements
    };
    
    onDocumentChange({
      ...document,
      pages: updatedPages
    });
  }, [document, activePage, activePageIndex, onDocumentChange]);
  
  // Handle single element update
  const handleElementUpdate = useCallback((elementId: string, updates: Partial<DesignElement>) => {
    if (!activePage) return;
    
    const updatedElements = activePage.elements.map(el =>
      el.id === elementId ? { ...el, ...updates } : el
    );
    
    handleElementsChange(updatedElements);
  }, [activePage, handleElementsChange]);
  
  // Handle element deletion
  const handleElementDelete = useCallback((elementIds: string[]) => {
    if (!activePage) return;
    
    const updatedElements = activePage.elements.filter(
      el => !elementIds.includes(el.id)
    );
    
    handleElementsChange(updatedElements);
    setSelectedElementIds([]);
  }, [activePage, handleElementsChange]);
  
  // Handle add element
  const handleAddElement = useCallback((element: DesignElement) => {
    if (!activePage) return;
    
    handleElementsChange([...activePage.elements, element]);
    setSelectedElementIds([element.id]);
  }, [activePage, handleElementsChange]);
  
  // Handle sample data navigation
  const handlePreviousRecord = useCallback(() => {
    setSampleDataIndex(prev => Math.max(0, prev - 1));
  }, []);
  
  const handleNextRecord = useCallback(() => {
    setSampleDataIndex(prev => Math.min(sampleData.length - 1, prev + 1));
  }, [sampleData.length]);
  
  // Handle save
  const handleSave = useCallback(() => {
    onSave?.(document);
  }, [document, onSave]);
  
  if (!activePage) {
    return (
      <div className="flex items-center justify-center h-full bg-muted">
        <p className="text-muted-foreground">No pages in document</p>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col h-full bg-background">
      {/* Top Bar */}
      <EditorTopBar
        documentName={document.name}
        zoom={zoom}
        onZoomChange={setZoom}
        showGrid={showGrid}
        onShowGridChange={setShowGrid}
        onSave={handleSave}
        onExport={onExport}
        onClose={onClose}
        onAddElement={handleAddElement}
        selectedElements={selectedElements}
        onDeleteSelected={() => handleElementDelete(selectedElementIds)}
        canUndo={false}
        canRedo={false}
        onUndo={() => {}}
        onRedo={() => {}}
        pageSize={{ width: activePage.widthMm, height: activePage.heightMm }}
        readOnly={readOnly}
      />
      
      {/* Main Content Area */}
      <div className="flex flex-1 min-h-0">
        {/* Left Sidebar */}
        <EditorLeftSidebar
          document={document}
          pages={document.pages}
          activePageIndex={activePageIndex}
          onPageSelect={setActivePageIndex}
          activeTab={leftSidebarTab}
          onTabChange={setLeftSidebarTab}
          availableFields={availableFields}
          onAddElement={handleAddElement}
          onDocumentUpdate={handleDocumentUpdate}
          onPageUpdate={handlePageUpdate}
          pageSize={{ width: activePage.widthMm, height: activePage.heightMm }}
          readOnly={readOnly}
        />
        
        {/* Canvas Viewport */}
        <div className="flex-1 min-w-0">
          <EditorCanvas
            page={activePage}
            zoom={zoom}
            onZoomChange={setZoom}
            showGrid={showGrid}
            selectedElementIds={selectedElementIds}
            onSelectionChange={setSelectedElementIds}
            onElementsChange={handleElementsChange}
            sampleData={currentSampleData}
            recordIndex={sampleDataIndex}
            onEngineReady={(engine) => { engineRef.current = engine; }}
            readOnly={readOnly}
          />
        </div>
        
        {/* Right Sidebar - Inspector */}
        <EditorRightSidebar
          selectedElements={selectedElements}
          onElementUpdate={handleElementUpdate}
          availableFields={availableFields}
          readOnly={readOnly}
        />
      </div>
      
      {/* Status Bar */}
      <EditorStatusBar
        zoom={zoom}
        pageIndex={activePageIndex}
        totalPages={document.pages.length}
        selectedCount={selectedElementIds.length}
        recordIndex={sampleDataIndex}
        totalRecords={sampleData.length}
        onPreviousRecord={handlePreviousRecord}
        onNextRecord={handleNextRecord}
        gridEnabled={showGrid}
        pageSize={{ width: activePage.widthMm, height: activePage.heightMm }}
      />
    </div>
  );
}
