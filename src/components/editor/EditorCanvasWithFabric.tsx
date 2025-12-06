import { useRef, useEffect, useState } from 'react';
import { DesignPage, DesignElement } from '@/lib/editor/types';
import { designElementsToFieldConfigs, fieldConfigsToDesignElements } from '@/lib/editor/adapters';
import { FabricLabelCanvas } from '@/components/canvas/FabricLabelCanvas';
import { FieldConfig } from '@/lib/canvas-utils';

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
  onCanvasReady
}: EditorCanvasWithFabricProps) {
  const fabricCanvasRef = useRef<any>(null);
  
  // Convert DesignElements to FieldConfigs for FabricLabelCanvas
  const fieldConfigs = designElementsToFieldConfigs(page.elements);
  
  // Handle field changes from canvas - convert back to DesignElements
  const handleFieldsChange = (updatedFields: FieldConfig[]) => {
    const updatedElements = fieldConfigsToDesignElements(updatedFields);
    onElementsChange(updatedElements);
  };
  
  // Handle canvas ready
  const handleCanvasReady = (canvas: any) => {
    fabricCanvasRef.current = canvas;
    onCanvasReady?.(canvas);
  };
  
  return (
    <div className="flex items-center justify-center w-full h-full bg-muted/40 overflow-auto p-8">
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
          onFieldsSelected={onSelectionChange}
        />
      </div>
    </div>
  );
}
