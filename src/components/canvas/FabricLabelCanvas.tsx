import { useEffect, useRef } from 'react';
import { Canvas as FabricCanvas } from 'fabric';
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
  onFieldsChange?: (fields: FieldConfig[]) => void;
  onCanvasReady?: (canvas: FabricCanvas) => void;
}

export function FabricLabelCanvas({
  templateSize,
  fields,
  sampleData,
  scale,
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

    // Add grid background
    const gridSize = 5 * 3.7795 * scale; // 5mm grid
    const gridOptions = {
      stroke: '#e5e7eb',
      strokeWidth: 1,
      selectable: false,
      evented: false
    };

    // Notify parent that canvas is ready
    if (onCanvasReady) {
      onCanvasReady(canvas);
    }

    // Listen for object modifications
    canvas.on('object:modified', () => {
      if (onFieldsChange) {
        // Convert back to field configs
        const updatedFields = fields.map((field, index) => {
          const obj = canvas.item(index);
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

    return () => {
      canvas.dispose();
      fabricCanvasRef.current = null;
    };
  }, [templateSize, scale]);

  // Update fields when they change
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    // Clear existing objects
    canvas.clear();
    canvas.backgroundColor = '#ffffff';

    // Add fields
    fields.forEach(fieldConfig => {
      let obj;

      switch (fieldConfig.fieldType) {
        case 'address_block':
          obj = createAddressBlock(canvas, fieldConfig, sampleData);
          break;
        case 'barcode':
          obj = createBarcodeField(canvas, fieldConfig, sampleData);
          break;
        case 'text':
        default:
          obj = createLabelTextField(canvas, fieldConfig, sampleData);
          break;
      }

      canvas.add(obj);
    });

    canvas.renderAll();
  }, [fields, sampleData]);

  return (
    <div className="border-2 border-border rounded-lg overflow-hidden shadow-lg bg-muted/20">
      <canvas ref={canvasRef} />
    </div>
  );
}
