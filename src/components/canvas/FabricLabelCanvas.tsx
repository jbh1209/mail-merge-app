import { useEffect, useRef } from 'react';
import { Canvas as FabricCanvas, Line } from 'fabric';
import { FieldConfig } from '@/lib/canvas-utils';
import { 
  createLabelTextField, 
  createAddressBlock, 
  createBarcodeField
} from '@/lib/fabric-helpers';

interface FabricLabelCanvasProps {
  templateSize: { width: number; height: number }; // in mm
  fields: FieldConfig[];
  sampleData?: Record<string, any>;
  scale: number;
  showGrid?: boolean;
  onFieldsChange?: (fields: FieldConfig[]) => void;
  onCanvasReady?: (canvas: FabricCanvas) => void;
  onFieldSelected?: (fieldId: string | null) => void;
}

export function FabricLabelCanvas({
  templateSize,
  fields,
  sampleData,
  scale,
  showGrid = true,
  onFieldsChange,
  onCanvasReady,
  onFieldSelected
}: FabricLabelCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<FabricCanvas | null>(null);
  const objectsRef = useRef<Map<string, any>>(new Map());
  const gridObjectsRef = useRef<any[]>([]);

  // Single conversion function - everything at base scale
  const mmToPx = (mm: number) => mm * 3.7795;

  // Initialize canvas once
  useEffect(() => {
    if (!canvasRef.current) return;

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

    if (onCanvasReady) {
      onCanvasReady(canvas);
    }

    // Selection events
    canvas.on('selection:created', (e) => {
      const obj = e.selected?.[0] as any;
      if (obj?.fieldId && onFieldSelected) {
        onFieldSelected(obj.fieldId);
      }
    });

    canvas.on('selection:cleared', () => {
      if (onFieldSelected) {
        onFieldSelected(null);
      }
    });

    return () => {
      canvas.dispose();
      fabricCanvasRef.current = null;
    };
  }, [templateSize.width, templateSize.height]);

  // Clear objects when sample data changes (page navigation)
  useEffect(() => {
    objectsRef.current.clear();
  }, [sampleData]);

  // Draw grid
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    // Remove old grid objects
    gridObjectsRef.current.forEach(obj => canvas.remove(obj));
    gridObjectsRef.current = [];

    if (showGrid) {
      const width = mmToPx(templateSize.width);
      const height = mmToPx(templateSize.height);
      const gridSize = mmToPx(5); // 5mm grid
      const gridOptions = {
        stroke: '#e5e7eb',
        strokeWidth: 1,
        selectable: false,
        evented: false
      };

      // Vertical lines
      for (let x = 0; x <= width; x += gridSize) {
        const line = new Line([x, 0, x, height], gridOptions);
        canvas.add(line);
        gridObjectsRef.current.push(line);
      }
      // Horizontal lines
      for (let y = 0; y <= height; y += gridSize) {
        const line = new Line([0, y, width, y], gridOptions);
        canvas.add(line);
        gridObjectsRef.current.push(line);
      }
    }

    canvas.renderAll();
  }, [showGrid, templateSize.width, templateSize.height]);

  // Update zoom and dimensions
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    canvas.setZoom(scale);
    canvas.setDimensions({
      width: mmToPx(templateSize.width) * scale,
      height: mmToPx(templateSize.height) * scale
    });

    canvas.renderAll();
  }, [scale, templateSize.width, templateSize.height]);

  // Smart update: modify existing objects or create new ones
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    // Track which fields exist in current data
    const currentFieldIds = new Set(fields.map(f => f.id));

    fields.forEach(fieldConfig => {
      const existingObj = objectsRef.current.get(fieldConfig.id);

      if (existingObj) {
        // UPDATE existing object properties without recreating
        const updates: any = {
          left: mmToPx(fieldConfig.position.x),
          top: mmToPx(fieldConfig.position.y),
          width: mmToPx(fieldConfig.size.width),
          fontSize: fieldConfig.style.fontSize,
          textAlign: fieldConfig.style.textAlign,
          fontWeight: fieldConfig.style.fontWeight,
          fontFamily: fieldConfig.style.fontFamily,
          fill: fieldConfig.style.color,
        };

        existingObj.set(updates);
        existingObj.setCoords();
      } else {
        // CREATE new object only if it doesn't exist
        let obj;

        switch (fieldConfig.fieldType) {
          case 'address_block':
            obj = createAddressBlock(fieldConfig, sampleData, 1);
            break;
          case 'barcode':
            obj = createBarcodeField(fieldConfig, 1);
            break;
          case 'text':
          default:
            obj = createLabelTextField(fieldConfig, sampleData, 1);
            break;
        }

        if (obj) {
          (obj as any).fieldId = fieldConfig.id;
          canvas.add(obj);
          objectsRef.current.set(fieldConfig.id, obj);
        }
      }
    });

    // Remove objects that no longer exist in fields
    objectsRef.current.forEach((obj, fieldId) => {
      if (!currentFieldIds.has(fieldId)) {
        canvas.remove(obj);
        objectsRef.current.delete(fieldId);
      }
    });

    canvas.renderAll();
  }, [fields, sampleData]);

  return (
    <div className="relative border-2 border-border rounded-lg overflow-hidden shadow-lg bg-muted/20">
      <canvas ref={canvasRef} />
    </div>
  );
}
