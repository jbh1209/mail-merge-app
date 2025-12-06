import { useRef, useState, useCallback, useEffect } from 'react';
import { DesignPage, DesignElement } from '@/lib/editor/types';
import { designElementsToFieldConfigs, fieldConfigsToDesignElements } from '@/lib/editor/adapters';
import { FabricLabelCanvas } from '@/components/canvas/FabricLabelCanvas';
import { FloatingToolbar } from './FloatingToolbar';
import { FieldConfig } from '@/lib/canvas-utils';
import { Coordinates } from '@/lib/coordinates';

interface EditorCanvasWithFabricProps {
  page: DesignPage;
  zoom: number;
  showGrid: boolean;
  sampleData?: Record<string, any>;
  sampleDataIndex: number;
  selectedElementIds: string[];
  onElementsChange: (elements: DesignElement[]) => void;
  onSelectionChange: (ids: string[]) => void;
  onCanvasReady?: (canvas: any) => void;
  onElementUpdate?: (elementId: string, updates: Partial<DesignElement>) => void;
  onDuplicateElement?: (elementId: string) => void;
  onDeleteElement?: (elementId: string) => void;
  onBringForward?: (elementId: string) => void;
  onSendBackward?: (elementId: string) => void;
}

/**
 * Bridge component that wraps FabricLabelCanvas to work with DesignElement types
 * This provides the migration path from legacy FieldConfig to new DesignElement
 */
export function EditorCanvasWithFabric({
  page,
  zoom,
  showGrid,
  sampleData,
  sampleDataIndex,
  selectedElementIds,
  onElementsChange,
  onSelectionChange,
  onCanvasReady,
  onElementUpdate,
  onDuplicateElement,
  onDeleteElement,
  onBringForward,
  onSendBackward
}: EditorCanvasWithFabricProps) {
  const fabricCanvasRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Floating toolbar position state
  const [toolbarPosition, setToolbarPosition] = useState<{ x: number; y: number } | null>(null);
  
  // Convert DesignElements to FieldConfigs for FabricLabelCanvas
  const fieldConfigs = designElementsToFieldConfigs(page.elements);
  
  // Get selected element for toolbar
  const selectedElement = selectedElementIds.length === 1
    ? page.elements.find(el => el.id === selectedElementIds[0])
    : null;
  
  // Update toolbar position when selection changes
  const updateToolbarPosition = useCallback(() => {
    if (!fabricCanvasRef.current || selectedElementIds.length !== 1) {
      setToolbarPosition(null);
      return;
    }
    
    const canvas = fabricCanvasRef.current;
    const activeObject = canvas.getActiveObject();
    
    if (activeObject) {
      const boundingRect = activeObject.getBoundingRect();
      const containerRect = containerRef.current?.getBoundingClientRect();
      
      if (containerRect) {
        // Calculate center-top of the element relative to container
        const x = boundingRect.left + boundingRect.width / 2;
        const y = boundingRect.top;
        
        setToolbarPosition({ x, y });
      }
    } else {
      setToolbarPosition(null);
    }
  }, [selectedElementIds]);
  
  // Update toolbar position on selection changes
  useEffect(() => {
    updateToolbarPosition();
  }, [selectedElementIds, updateToolbarPosition]);
  
  // Handle field changes from canvas - convert back to DesignElements
  const handleFieldsChange = (updatedFields: FieldConfig[]) => {
    const updatedElements = fieldConfigsToDesignElements(updatedFields);
    onElementsChange(updatedElements);
    
    // Update toolbar position after field changes
    requestAnimationFrame(updateToolbarPosition);
  };
  
  // Handle canvas ready
  const handleCanvasReady = (canvas: any) => {
    fabricCanvasRef.current = canvas;
    onCanvasReady?.(canvas);
    
    // Listen for object modifications to update toolbar position
    canvas.on('object:moving', updateToolbarPosition);
    canvas.on('object:scaling', updateToolbarPosition);
    canvas.on('object:modified', updateToolbarPosition);
  };
  
  // Handle selection changes - update toolbar
  const handleSelectionChange = (ids: string[]) => {
    onSelectionChange(ids);
    
    // Small delay to allow Fabric.js to update selection
    requestAnimationFrame(updateToolbarPosition);
  };
  
  // Floating toolbar handlers
  const handleToolbarUpdate = useCallback((updates: Partial<DesignElement>) => {
    if (selectedElementIds.length === 1) {
      onElementUpdate?.(selectedElementIds[0], updates);
    }
  }, [selectedElementIds, onElementUpdate]);
  
  const handleDuplicate = useCallback(() => {
    if (selectedElementIds.length === 1) {
      onDuplicateElement?.(selectedElementIds[0]);
    }
  }, [selectedElementIds, onDuplicateElement]);
  
  const handleDelete = useCallback(() => {
    if (selectedElementIds.length === 1) {
      onDeleteElement?.(selectedElementIds[0]);
    }
  }, [selectedElementIds, onDeleteElement]);
  
  const handleBringForward = useCallback(() => {
    if (selectedElementIds.length === 1) {
      onBringForward?.(selectedElementIds[0]);
    }
  }, [selectedElementIds, onBringForward]);
  
  const handleSendBackward = useCallback(() => {
    if (selectedElementIds.length === 1) {
      onSendBackward?.(selectedElementIds[0]);
    }
  }, [selectedElementIds, onSendBackward]);
  
  return (
    <div 
      ref={containerRef}
      className="relative flex items-center justify-center w-full h-full bg-muted/40 overflow-auto p-8"
    >
      {/* Floating Toolbar */}
      {selectedElement && toolbarPosition && (
        <FloatingToolbar
          element={selectedElement}
          position={toolbarPosition}
          zoom={zoom}
          onUpdateElement={handleToolbarUpdate}
          onDuplicate={handleDuplicate}
          onDelete={handleDelete}
          onBringForward={handleBringForward}
          onSendBackward={handleSendBackward}
        />
      )}
      
      {/* Page container with drop shadow */}
      <div
        className="relative bg-background shadow-2xl"
        style={{
          width: page.widthMm * 3.7795275591 * zoom,
          height: page.heightMm * 3.7795275591 * zoom,
        }}
      >
        <FabricLabelCanvas
          templateSize={{ width: page.widthMm, height: page.heightMm }}
          fields={fieldConfigs}
          sampleData={sampleData}
          recordIndex={sampleDataIndex}
          scale={zoom}
          showGrid={showGrid}
          onFieldsChange={handleFieldsChange}
          onCanvasReady={handleCanvasReady}
          onFieldsSelected={handleSelectionChange}
        />
      </div>
    </div>
  );
}
