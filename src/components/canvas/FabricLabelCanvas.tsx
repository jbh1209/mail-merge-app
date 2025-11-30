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
  const objectRefsMap = useRef<Map<string, LabelFieldObject>>(new Map()); // Track objects by field ID
  const userModificationsRef = useRef<Map<string, { left: number; top: number; width: number; height: number }>>(new Map()); // Track user modifications

  // Initialize Fabric canvas
  useEffect(() => {
    if (!canvasRef.current) return;

    // Convert mm to pixels at base scale (96 DPI) - zoom applied separately
    const mmToPx = (mm: number) => mm * 3.7795;
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

    // Notify parent that canvas is ready
    if (onCanvasReady) {
      onCanvasReady(canvas);
    }

    // Listen for object modifications
    canvas.on('object:modified', (e) => {
      const obj = e.target as any;
      
      // Store user modifications locally (don't trigger re-render)
      if (obj && obj.fieldId) {
        userModificationsRef.current.set(obj.fieldId, {
          left: obj.left,
          top: obj.top,
          width: obj.getScaledWidth(),
          height: obj.getScaledHeight()
        });
      }
      
      // Reset scale transforms to prevent compounding
      if (obj && (obj.scaleX !== 1 || obj.scaleY !== 1)) {
        obj.set({
          width: obj.getScaledWidth(),
          height: obj.getScaledHeight(),
          scaleX: 1,
          scaleY: 1
        });
        obj.setCoords();
      }
      
      canvas.renderAll();
      
      // Only update parent on explicit save, not on every drag
      // This prevents the feedback loop
    });

    // Listen for selection events
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
      objectRefsMap.current.clear(); // Clear object tracking on canvas disposal
    };
  }, [templateSize]); // Only recreate on template size change, NOT scale

  // Separate effect for zoom - use viewport transform instead of recreation
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const mmToPxBase = (mm: number) => mm * 3.7795; // Base conversion without scale
    
    // Apply zoom via viewport transform
    canvas.setZoom(scale);
    canvas.setDimensions({
      width: mmToPxBase(templateSize.width) * scale,
      height: mmToPxBase(templateSize.height) * scale
    });
    canvas.renderAll();
  }, [scale, templateSize]);

  // Separate effect for grid visibility - doesn't recreate canvas
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const mmToPxBase = (mm: number) => mm * 3.7795; // Base conversion
    const width = mmToPxBase(templateSize.width);
    const height = mmToPxBase(templateSize.height);

    // Remove existing grid lines
    const objects = canvas.getObjects();
    objects.forEach((obj: any) => {
      if (obj.data?.isGridLine) {
        canvas.remove(obj);
      }
    });

    // Add grid lines if enabled
    if (showGrid) {
      const gridSize = 5 * 3.7795; // 5mm grid at base scale
      const gridOptions = {
        stroke: '#e5e7eb',
        strokeWidth: 1,
        selectable: false,
        evented: false,
        data: { isGridLine: true }
      };

      // Draw grid lines
      for (let x = 0; x <= width; x += gridSize) {
        const line = new Line([x, 0, x, height], gridOptions);
        canvas.add(line);
        canvas.sendObjectToBack(line); // Keep grid behind all objects
      }
      for (let y = 0; y <= height; y += gridSize) {
        const line = new Line([0, y, width, y], gridOptions);
        canvas.add(line);
        canvas.sendObjectToBack(line); // Keep grid behind all objects
      }
    }

    canvas.renderAll();
  }, [showGrid, scale, templateSize]);

  // Update fields when they change - use object updates instead of clear/redraw
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    console.log('🖼️ FabricLabelCanvas updating:', {
      templateSize,
      fieldsCount: fields.length,
      sampleDataExists: !!sampleData,
      sampleDataKeys: sampleData ? Object.keys(sampleData) : [],
      firstFieldCombinedFields: fields[0]?.combinedFields
    });

    const mmToPxBase = (mm: number) => mm * 3.7795; // Base conversion without scale

    // Track which fields we've processed
    const processedFieldIds = new Set<string>();

    // Update or create fields
    fields.forEach(fieldConfig => {
      // CRITICAL: Always use fieldConfig.id for stable tracking
      const fieldId = fieldConfig.id;
      if (!fieldId) {
        console.warn('⚠️ Field missing id:', fieldConfig.templateField);
        return;
      }
      
      processedFieldIds.add(fieldId);

      // Use objectRefsMap for consistent object tracking
      const existingObj = objectRefsMap.current.get(fieldId);

      if (existingObj) {
        // Update existing object instead of recreating (use base scale)
        const newLeft = mmToPxBase(fieldConfig.position?.x || 0);
        const newTop = mmToPxBase(fieldConfig.position?.y || 0);
        const newWidth = mmToPxBase(fieldConfig.size?.width || 50);
        const newHeight = mmToPxBase(fieldConfig.size?.height || 10);

        // Check for user modifications and preserve them
        const userMod = userModificationsRef.current.get(fieldId);
        if (userMod) {
          // Use user's modification instead of prop values
          existingObj.set({
            left: userMod.left,
            top: userMod.top,
            width: userMod.width,
            height: userMod.height,
          });
        } else {
          // Use prop values
          existingObj.set({
            left: newLeft,
            top: newTop,
            width: newWidth,
            height: newHeight,
          });
        }

        // CRITICAL: Apply style properties from fieldConfig for text-based fields
        if (fieldConfig.fieldType === 'text' || fieldConfig.fieldType === 'address_block') {
          existingObj.set({
            fontFamily: fieldConfig.style.fontFamily || 'Arial, sans-serif',
            fontSize: fieldConfig.style.fontSize || 24,
            fontWeight: fieldConfig.style.fontWeight || 'normal',
            textAlign: fieldConfig.style.textAlign || 'center',
          });
        }

        // CRITICAL: Always update text content when sampleData changes
        if (fieldConfig.fieldType === 'address_block' && fieldConfig.combinedFields) {
          // Address block - combine all fields
          const lines: string[] = [];
          for (const fn of fieldConfig.combinedFields) {
            // Use getFieldValue helper from fabric-helpers
            const value = sampleData?.[fn] || '';
            if (value && String(value).trim()) {
              lines.push(String(value).trim());
            }
          }
          existingObj.set('text', lines.join('\n') || '');
        } else {
          // Single field
          const value = sampleData?.[fieldConfig.templateField] || '';
          existingObj.set('text', String(value));
        }
        
        existingObj.setCoords();
      } else {
        // Create new object
        let obj;

        console.log('🎨 Creating new field:', {
          type: fieldConfig.fieldType,
          field: fieldConfig.templateField,
          size: `${fieldConfig.size?.width?.toFixed(1)}x${fieldConfig.size?.height?.toFixed(1)}mm`
        });

        switch (fieldConfig.fieldType) {
          case 'address_block':
            obj = createAddressBlock(fieldConfig, sampleData, 1); // Always create at scale=1
            break;
          case 'barcode':
            obj = createBarcodeField(fieldConfig, 1); // Always create at scale=1
            break;
          case 'text':
          default:
            obj = createLabelTextField(fieldConfig, sampleData, 1); // Always create at scale=1
            break;
        }

        if (obj) {
          (obj as any).fieldId = fieldId;
          canvas.add(obj);
          // CRITICAL: Track the new object in objectRefsMap
          objectRefsMap.current.set(fieldId, obj as LabelFieldObject);
        }
      }
    });

    // Remove objects that are no longer in fields
    const currentObjects = canvas.getObjects().filter((obj: any) => obj.selectable !== false && !obj.data?.isGridLine);
    currentObjects.forEach((obj: any) => {
      if (obj.fieldId && !processedFieldIds.has(obj.fieldId)) {
        canvas.remove(obj);
        objectRefsMap.current.delete(obj.fieldId);
      }
    });

    canvas.renderAll();
  }, [fields, sampleData, templateSize]); // scale removed - zoom handled separately

  return (
    <div className="relative border-2 border-border rounded-lg overflow-hidden shadow-lg bg-muted/20">
      <canvas ref={canvasRef} />
    </div>
  );
}
