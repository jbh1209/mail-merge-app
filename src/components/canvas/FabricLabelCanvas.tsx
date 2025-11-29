import { useEffect, useRef } from 'react';
import { Canvas as FabricCanvas, Line } from 'fabric';
import { FieldConfig } from '@/lib/canvas-utils';
import { 
  createLabelTextField, 
  createAddressBlock, 
  createBarcodeField,
  LabelFieldObject 
} from '@/lib/fabric-helpers';

interface FabricLabelCanvasProps {
  templateSize: { width: number; height: number }; // in mm
  fields: FieldConfig[];
  sampleData?: Record<string, any>;
  scale: number;
  showGrid?: boolean;
  onFieldsChange?: (fields: FieldConfig[]) => void;
  onCanvasReady?: (canvas: FabricCanvas) => void;
}

export function FabricLabelCanvas({
  templateSize,
  fields,
  sampleData,
  scale,
  showGrid = true,
  onFieldsChange,
  onCanvasReady
}: FabricLabelCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<FabricCanvas | null>(null);
  const isInternalUpdate = useRef(false); // Prevent feedback loop

  // Initialize Fabric canvas
  useEffect(() => {
    if (!canvasRef.current) return;

    // Convert mm to pixels (96 DPI)
    const mmToPx = (mm: number) => mm * 3.7795 * scale;
    const width = mmToPx(templateSize.width);
    const height = mmToPx(templateSize.height);

    const canvas = new FabricCanvas(canvasRef.current, {
      width: width,
      height: height,
      backgroundColor: '#ffffff',
      selection: true,
      preserveObjectStacking: true
    });

    fabricCanvasRef.current = canvas;

    // Add grid background if enabled
    if (showGrid) {
      const gridSize = 5 * 3.7795 * scale; // 5mm grid
      const gridOptions = {
        stroke: '#e5e7eb',
        strokeWidth: 1,
        selectable: false,
        evented: false
      };

      // Draw grid lines
      for (let x = 0; x <= width; x += gridSize) {
        const line = new Line([x, 0, x, height], gridOptions);
        canvas.add(line);
      }
      for (let y = 0; y <= height; y += gridSize) {
        const line = new Line([0, y, width, y], gridOptions);
        canvas.add(line);
      }
    }

    // Notify parent that canvas is ready
    if (onCanvasReady) {
      onCanvasReady(canvas);
    }

    // Listen for object modifications
    canvas.on('object:modified', () => {
      // Set flag to prevent re-render from triggering
      isInternalUpdate.current = true;
      
      if (onFieldsChange) {
        // Use fabricToFieldConfigs for proper conversion
        const { fabricToFieldConfigs } = require('@/lib/fabric-helpers');
        const updatedFields = fabricToFieldConfigs(canvas, scale);
        onFieldsChange(updatedFields);
      }
    });

    // Listen for selection events
    canvas.on('selection:created', (e) => {
      // Field selection sync with parent state
      console.log('Field selected:', e.selected);
    });

    canvas.on('selection:cleared', () => {
      // Clear selection state
      console.log('Selection cleared');
    });

    return () => {
      canvas.dispose();
      fabricCanvasRef.current = null;
    };
  }, [templateSize, scale, showGrid]);

  // Update fields when they change
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    // If this is an internal update (from user drag), skip re-rendering
    if (isInternalUpdate.current) {
      isInternalUpdate.current = false;
      return;
    }

    console.log('🖼️ FabricLabelCanvas received:', {
      templateSize,
      fieldsCount: fields.length,
      sampleDataExists: !!sampleData,
      sampleDataKeys: sampleData ? Object.keys(sampleData) : [],
      firstFieldCombinedFields: fields[0]?.combinedFields
    });

    // Clear existing objects
    canvas.clear();
    canvas.backgroundColor = '#ffffff';

    // RE-DRAW GRID (it was cleared above) - only if showGrid is true
    const mmToPx = (mm: number) => mm * 3.7795 * scale;
    const width = mmToPx(templateSize.width);
    const height = mmToPx(templateSize.height);
    
    if (showGrid) {
      const gridSize = 5 * 3.7795 * scale; // 5mm grid
      const gridOptions = {
        stroke: '#e5e7eb',
        strokeWidth: 1,
        selectable: false,
        evented: false
      };

      // Draw vertical grid lines
      for (let x = 0; x <= width; x += gridSize) {
        const line = new Line([x, 0, x, height], gridOptions);
        canvas.add(line);
      }
      // Draw horizontal grid lines
      for (let y = 0; y <= height; y += gridSize) {
        const line = new Line([0, y, width, y], gridOptions);
        canvas.add(line);
      }
    }

    // Add fields
    fields.forEach(fieldConfig => {
      let obj;

      console.log('🎨 Rendering field:', {
        type: fieldConfig.fieldType,
        field: fieldConfig.templateField,
        size: `${fieldConfig.size?.width?.toFixed(1)}x${fieldConfig.size?.height?.toFixed(1)}mm`
      });

      switch (fieldConfig.fieldType) {
        case 'address_block':
          obj = createAddressBlock(fieldConfig, sampleData, scale);
          break;
        case 'barcode':
          obj = createBarcodeField(fieldConfig, scale);
          break;
        case 'text':
        default:
          obj = createLabelTextField(fieldConfig, sampleData, scale);
          break;
      }

      if (obj) {
        canvas.add(obj);
      }
    });

    canvas.renderAll();
  }, [fields, sampleData, templateSize, scale, showGrid]);

  return (
    <div className="relative border-2 border-border rounded-lg overflow-hidden shadow-lg bg-muted/20">
      <canvas ref={canvasRef} />
      
      {/* Debug Panel - Development Only */}
      {process.env.NODE_ENV === 'development' && sampleData && (
        <div className="absolute top-2 right-2 bg-black/90 text-white text-xs p-3 rounded-lg max-w-xs space-y-1 font-mono">
          <div className="font-bold text-yellow-400">Debug Info</div>
          <div>Fields: {fields.length}</div>
          <div>Scale: {scale.toFixed(2)}</div>
          <div className="border-t border-gray-600 pt-1 mt-1">
            <div className="text-yellow-300">Sample Data Keys:</div>
            <div className="text-xs opacity-75">
              {Object.keys(sampleData).slice(0, 5).join(', ')}
              {Object.keys(sampleData).length > 5 && '...'}
            </div>
          </div>
          <div className="border-t border-gray-600 pt-1 mt-1">
            <div className="text-yellow-300">Field Matches:</div>
            {fields.slice(0, 3).map((f) => {
              const hasData = f.combinedFields 
                ? f.combinedFields.some(field => sampleData[field])
                : sampleData[f.templateField];
              return (
                <div key={f.id} className="flex items-center gap-1">
                  <span className={hasData ? 'text-green-400' : 'text-red-400'}>
                    {hasData ? '✓' : '✗'}
                  </span>
                  <span className="truncate">{f.templateField}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
