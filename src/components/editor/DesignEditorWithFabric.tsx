import { useState, useRef, useCallback } from 'react';
import { DesignDocument, DesignPage, DesignElement } from '@/lib/editor/types';
import { 
  templateToDesignDocument, 
  fieldConfigsToDesignElements,
  designElementsToFieldConfigs
} from '@/lib/editor/adapters';
import { EditorTopBar } from './EditorTopBar';
import { EditorLeftSidebar } from './EditorLeftSidebar';
import { EditorRightSidebar } from './EditorRightSidebar';
import { EditorStatusBar } from './EditorStatusBar';
import { EditorCanvasWithFabric } from './EditorCanvasWithFabric';
import { fabricToFieldConfigs } from '@/lib/fabric-helpers';
import { useToast } from '@/hooks/use-toast';
import { useCanvasKeyboard } from '@/hooks/useCanvasKeyboard';

interface DesignEditorWithFabricProps {
  template: {
    id: string;
    name: string;
    width_mm: number;
    height_mm: number;
    design_config?: any;
  };
  projectId: string;
  sampleData?: Record<string, any>[];
  availableFields?: string[];
  onSave: (designConfig: any) => void;
  onClose: () => void;
}

/**
 * Full design editor using the new shell UI with Fabric.js canvas
 * This is the migration component that bridges old and new systems
 */
export function DesignEditorWithFabric({
  template,
  projectId,
  sampleData = [],
  availableFields = [],
  onSave,
  onClose
}: DesignEditorWithFabricProps) {
  const { toast } = useToast();
  const fabricCanvasRef = useRef<any>(null);
  
  // Clipboard for copy/paste
  const clipboardRef = useRef<DesignElement[]>([]);
  
  // Convert template to DesignDocument format
  const [document, setDocument] = useState<DesignDocument>(() => 
    templateToDesignDocument(template)
  );
  
  // Editor state
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  const [zoom, setZoom] = useState(2);
  const [showGrid, setShowGrid] = useState(true);
  const [sampleDataIndex, setSampleDataIndex] = useState(0);
  const [leftSidebarTab, setLeftSidebarTab] = useState<'pages' | 'assets' | 'data'>('data');
  
  const activePage = document.pages[activePageIndex];
  const currentSampleData = sampleData[sampleDataIndex];
  
  // Get selected elements for TopBar and RightSidebar
  const selectedElements = activePage?.elements.filter(el => 
    selectedElementIds.includes(el.id)
  ) || [];
  
  // Handle document update (for page management)
  const handleDocumentUpdate = useCallback((updates: Partial<DesignDocument>) => {
    setDocument(prev => ({
      ...prev,
      ...updates
    }));
  }, []);
  
  // Handle page update
  const handlePageUpdate = useCallback((pageIndex: number, updates: Partial<DesignPage>) => {
    setDocument(prev => ({
      ...prev,
      pages: prev.pages.map((page, i) => 
        i === pageIndex 
          ? { ...page, ...updates }
          : page
      )
    }));
  }, []);
  
  // Handle element changes from canvas
  const handleElementsChange = useCallback((elements: DesignElement[]) => {
    setDocument(prev => ({
      ...prev,
      pages: prev.pages.map((page, i) => 
        i === activePageIndex 
          ? { ...page, elements }
          : page
      )
    }));
  }, [activePageIndex]);
  
  // Handle element update from inspector or floating toolbar
  const handleElementUpdate = useCallback((elementId: string, updates: Partial<DesignElement>) => {
    setDocument(prev => ({
      ...prev,
      pages: prev.pages.map((page, i) => 
        i === activePageIndex 
          ? {
              ...page,
              elements: page.elements.map(el => 
                el.id === elementId ? { ...el, ...updates } : el
              )
            }
          : page
      )
    }));
  }, [activePageIndex]);
  
  // Handle element deletion
  const handleElementDelete = useCallback((elementId: string) => {
    setDocument(prev => ({
      ...prev,
      pages: prev.pages.map((page, i) => 
        i === activePageIndex 
          ? {
              ...page,
              elements: page.elements.filter(el => el.id !== elementId)
            }
          : page
      )
    }));
    setSelectedElementIds(prev => prev.filter(id => id !== elementId));
  }, [activePageIndex]);
  
  // Handle delete selected (from TopBar or keyboard)
  const handleDeleteSelected = useCallback((ids?: string[]) => {
    const idsToDelete = ids || selectedElementIds;
    if (idsToDelete.length === 0) return;
    
    setDocument(prev => ({
      ...prev,
      pages: prev.pages.map((page, i) => 
        i === activePageIndex 
          ? {
              ...page,
              elements: page.elements.filter(el => !idsToDelete.includes(el.id))
            }
          : page
      )
    }));
    setSelectedElementIds([]);
  }, [activePageIndex, selectedElementIds]);
  
  // Handle duplicate element
  const handleDuplicateElement = useCallback((elementId: string) => {
    const element = activePage?.elements.find(el => el.id === elementId);
    if (!element) return;
    
    const newElement: DesignElement = {
      ...element,
      id: `element-${crypto.randomUUID().slice(0, 8)}`,
      x: element.x + 5, // Offset by 5mm
      y: element.y + 5,
      zIndex: Math.max(0, ...(activePage?.elements || []).map(el => el.zIndex)) + 1
    };
    
    setDocument(prev => ({
      ...prev,
      pages: prev.pages.map((page, i) => 
        i === activePageIndex 
          ? { ...page, elements: [...page.elements, newElement] }
          : page
      )
    }));
    
    setSelectedElementIds([newElement.id]);
  }, [activePageIndex, activePage?.elements]);
  
  // Handle duplicate selected (keyboard shortcut)
  const handleDuplicateSelected = useCallback((ids: string[]) => {
    const elementsToDuplicate = activePage?.elements.filter(el => ids.includes(el.id)) || [];
    if (elementsToDuplicate.length === 0) return;
    
    const maxZIndex = Math.max(0, ...(activePage?.elements || []).map(el => el.zIndex));
    const newElements: DesignElement[] = elementsToDuplicate.map((element, i) => ({
      ...element,
      id: `element-${crypto.randomUUID().slice(0, 8)}`,
      x: element.x + 5,
      y: element.y + 5,
      zIndex: maxZIndex + i + 1
    }));
    
    setDocument(prev => ({
      ...prev,
      pages: prev.pages.map((page, i) => 
        i === activePageIndex 
          ? { ...page, elements: [...page.elements, ...newElements] }
          : page
      )
    }));
    
    setSelectedElementIds(newElements.map(el => el.id));
  }, [activePageIndex, activePage?.elements]);
  
  // Handle nudge elements (keyboard shortcuts)
  const handleNudgeElements = useCallback((ids: string[], dx: number, dy: number) => {
    setDocument(prev => ({
      ...prev,
      pages: prev.pages.map((page, i) => 
        i === activePageIndex 
          ? {
              ...page,
              elements: page.elements.map(el => 
                ids.includes(el.id) 
                  ? { ...el, x: el.x + dx, y: el.y + dy }
                  : el
              )
            }
          : page
      )
    }));
  }, [activePageIndex]);
  
  // Handle bring forward
  const handleBringForward = useCallback((elementId: string) => {
    const element = activePage?.elements.find(el => el.id === elementId);
    if (!element) return;
    
    const currentZ = element.zIndex;
    const elementsAbove = activePage?.elements.filter(el => el.zIndex > currentZ) || [];
    
    if (elementsAbove.length === 0) return; // Already on top
    
    const nextZ = Math.min(...elementsAbove.map(el => el.zIndex));
    
    setDocument(prev => ({
      ...prev,
      pages: prev.pages.map((page, i) => 
        i === activePageIndex 
          ? {
              ...page,
              elements: page.elements.map(el => {
                if (el.id === elementId) return { ...el, zIndex: nextZ };
                if (el.zIndex === nextZ) return { ...el, zIndex: currentZ };
                return el;
              })
            }
          : page
      )
    }));
  }, [activePageIndex, activePage?.elements]);
  
  // Handle send backward
  const handleSendBackward = useCallback((elementId: string) => {
    const element = activePage?.elements.find(el => el.id === elementId);
    if (!element) return;
    
    const currentZ = element.zIndex;
    const elementsBelow = activePage?.elements.filter(el => el.zIndex < currentZ) || [];
    
    if (elementsBelow.length === 0) return; // Already on bottom
    
    const prevZ = Math.max(...elementsBelow.map(el => el.zIndex));
    
    setDocument(prev => ({
      ...prev,
      pages: prev.pages.map((page, i) => 
        i === activePageIndex 
          ? {
              ...page,
              elements: page.elements.map(el => {
                if (el.id === elementId) return { ...el, zIndex: prevZ };
                if (el.zIndex === prevZ) return { ...el, zIndex: currentZ };
                return el;
              })
            }
          : page
      )
    }));
  }, [activePageIndex, activePage?.elements]);
  
  // Handle select all
  const handleSelectAll = useCallback(() => {
    if (activePage) {
      setSelectedElementIds(activePage.elements.map(el => el.id));
    }
  }, [activePage]);
  
  // Handle copy
  const handleCopy = useCallback(() => {
    const elementsToCopy = activePage?.elements.filter(el => 
      selectedElementIds.includes(el.id)
    ) || [];
    clipboardRef.current = elementsToCopy;
    
    toast({
      title: "Copied",
      description: `${elementsToCopy.length} element(s) copied`,
    });
  }, [activePage?.elements, selectedElementIds, toast]);
  
  // Handle paste
  const handlePaste = useCallback(() => {
    if (clipboardRef.current.length === 0) return;
    
    const maxZIndex = Math.max(0, ...(activePage?.elements || []).map(el => el.zIndex));
    const newElements: DesignElement[] = clipboardRef.current.map((element, i) => ({
      ...element,
      id: `element-${crypto.randomUUID().slice(0, 8)}`,
      x: element.x + 10,
      y: element.y + 10,
      zIndex: maxZIndex + i + 1
    }));
    
    setDocument(prev => ({
      ...prev,
      pages: prev.pages.map((page, i) => 
        i === activePageIndex 
          ? { ...page, elements: [...page.elements, ...newElements] }
          : page
      )
    }));
    
    setSelectedElementIds(newElements.map(el => el.id));
    
    toast({
      title: "Pasted",
      description: `${newElements.length} element(s) pasted`,
    });
  }, [activePageIndex, activePage?.elements, toast]);
  
  // Handle adding new element
  const handleAddElement = useCallback((element: DesignElement) => {
    const maxZIndex = Math.max(0, ...(activePage?.elements || []).map(el => el.zIndex));
    const newElement: DesignElement = {
      ...element,
      id: element.id || `element-${crypto.randomUUID().slice(0, 8)}`,
      zIndex: maxZIndex + 1
    };
    
    setDocument(prev => ({
      ...prev,
      pages: prev.pages.map((page, i) => 
        i === activePageIndex 
          ? { ...page, elements: [...page.elements, newElement] }
          : page
      )
    }));
    
    setSelectedElementIds([newElement.id]);
  }, [activePageIndex, activePage?.elements]);
  
  // Navigation for sample data
  const handlePreviousRecord = useCallback(() => {
    setSampleDataIndex(prev => Math.max(0, prev - 1));
  }, []);
  
  const handleNextRecord = useCallback(() => {
    setSampleDataIndex(prev => Math.min(sampleData.length - 1, prev + 1));
  }, [sampleData.length]);
  
  // Setup keyboard shortcuts
  useCanvasKeyboard({
    selectedElementIds,
    elements: activePage?.elements || [],
    onDeleteElements: handleDeleteSelected,
    onDuplicateElements: handleDuplicateSelected,
    onNudgeElements: handleNudgeElements,
    onSelectAll: handleSelectAll,
    onClearSelection: () => setSelectedElementIds([]),
    onCopy: handleCopy,
    onPaste: handlePaste,
    enabled: true
  });
  
  // Save handler - captures from Fabric.js canvas
  const handleSave = useCallback(() => {
    if (!fabricCanvasRef.current) {
      toast({
        title: "Save Error",
        description: "Canvas not ready. Please try again.",
        variant: "destructive"
      });
      return;
    }
    
    // Capture directly from Fabric.js canvas
    const capturedFields = fabricToFieldConfigs(fabricCanvasRef.current, 1);
    
    console.log('💾 Saving design config with', capturedFields.length, 'fields');
    
    const designConfig = {
      fields: capturedFields,
      canvasSettings: {
        backgroundColor: '#ffffff',
        showGrid,
        snapToGrid: true,
        gridSize: 1,
        showAllLabels: false,
        defaultLabelFontSize: 6
      }
    };
    
    onSave(designConfig);
  }, [showGrid, onSave, toast]);
  
  // Export handler (placeholder)
  const handleExport = useCallback(() => {
    toast({
      title: "Export",
      description: "PDF export will be triggered from the merge job runner."
    });
  }, [toast]);
  
  // Handle canvas ready
  const handleCanvasReady = useCallback((canvas: any) => {
    fabricCanvasRef.current = canvas;
  }, []);
  
  if (!activePage) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        No page available
      </div>
    );
  }
  
  const pageSize = { width: activePage.widthMm, height: activePage.heightMm };
  
  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Top Bar */}
      <EditorTopBar
        documentName={document.name}
        zoom={zoom}
        onZoomChange={setZoom}
        showGrid={showGrid}
        onShowGridChange={setShowGrid}
        canUndo={false}
        canRedo={false}
        onUndo={() => {}}
        onRedo={() => {}}
        onSave={handleSave}
        onExport={handleExport}
        onClose={onClose}
        onAddElement={handleAddElement}
        selectedElements={selectedElements}
        onDeleteSelected={() => handleDeleteSelected()}
        pageSize={pageSize}
        activePage={activePage}
        onPageUpdate={(updates) => handlePageUpdate(activePageIndex, updates)}
      />
      
      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <EditorLeftSidebar
          document={document}
          pages={document.pages}
          activePageIndex={activePageIndex}
          onPageSelect={setActivePageIndex}
          availableFields={availableFields}
          onAddElement={handleAddElement}
          onDocumentUpdate={handleDocumentUpdate}
          onPageUpdate={handlePageUpdate}
          activeTab={leftSidebarTab}
          onTabChange={setLeftSidebarTab}
          pageSize={pageSize}
        />
        
        {/* Canvas Viewport */}
        <div className="flex-1 overflow-hidden">
          <EditorCanvasWithFabric
            page={activePage}
            zoom={zoom}
            showGrid={showGrid}
            sampleData={currentSampleData}
            sampleDataIndex={sampleDataIndex}
            selectedElementIds={selectedElementIds}
            onElementsChange={handleElementsChange}
            onSelectionChange={setSelectedElementIds}
            onCanvasReady={handleCanvasReady}
            onElementUpdate={handleElementUpdate}
            onDuplicateElement={handleDuplicateElement}
            onDeleteElement={handleElementDelete}
            onBringForward={handleBringForward}
            onSendBackward={handleSendBackward}
          />
        </div>
        
        {/* Right Sidebar */}
        <EditorRightSidebar
          selectedElements={selectedElements}
          availableFields={availableFields}
          onElementUpdate={handleElementUpdate}
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
        pageSize={pageSize}
        selectedElement={selectedElements[0]}
      />
    </div>
  );
}
