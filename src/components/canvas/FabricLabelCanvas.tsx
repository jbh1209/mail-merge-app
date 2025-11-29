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
      if (onFieldsChange) {
        // Convert back to field configs
        const updatedFields = fields.map((field, index) => {
          const objects = canvas.getObjects();
          const obj = objects[index];
          if (!obj) return field;

          const pxToMm = (px: number) => px / (3.7795 * scale);
          
          return {
            ...field,
            position: {
              x: pxToMm(obj.left || 0),
              y: pxToMm(obj.top || 0)
            },
            size: {
              width: pxToMm(obj.getScaledWidth()),
              height: pxToMm(obj.getScaledHeight())
            }
          };
        });
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
          obj = createAddressBlock(fieldConfig, sampleData);
          break;
        case 'barcode':
          obj = createBarcodeField(fieldConfig);
          break;
        case 'text':
        default:
          obj = createLabelTextField(fieldConfig, sampleData);
          break;
      }

      if (obj) {
        canvas.add(obj);
      }
    });

    canvas.renderAll();
  }, [fields, sampleData, templateSize, scale]);

  return (
    <div className="border-2 border-border rounded-lg overflow-hidden shadow-lg bg-muted/20">
      <canvas ref={canvasRef} />
    </div>
  );
}
