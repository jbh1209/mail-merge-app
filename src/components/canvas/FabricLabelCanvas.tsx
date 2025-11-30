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

  // Single effect: render everything (grid + fields + zoom)
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    // 1. Clear everything except keep the canvas itself
    canvas.clear();
    canvas.backgroundColor = '#ffffff';

    // 2. Set zoom and dimensions
    canvas.setZoom(scale);
    canvas.setDimensions({
      width: mmToPx(templateSize.width) * scale,
      height: mmToPx(templateSize.height) * scale
    });

    // 3. Draw grid if enabled
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
      }
      // Horizontal lines
      for (let y = 0; y <= height; y += gridSize) {
        const line = new Line([0, y, width, y], gridOptions);
        canvas.add(line);
      }
    }

    // 4. Create all field objects fresh
    fields.forEach(fieldConfig => {
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
      }
    });

    canvas.renderAll();
  }, [fields, sampleData, scale, showGrid, templateSize.width, templateSize.height]);

  return (
    <div className="relative border-2 border-border rounded-lg overflow-hidden shadow-lg bg-muted/20">
      <canvas ref={canvasRef} />
    </div>
  );
}
