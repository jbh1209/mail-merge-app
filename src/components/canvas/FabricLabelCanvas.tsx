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
  const objectRefsMap = useRef<Map<string, LabelFieldObject>>(new Map()); // Track objects by field ID
  const userModificationsRef = useRef<Map<string, { left: number; top: number; width: number; height: number }>>(new Map()); // Track user modifications

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

    const mmToPx = (mm: number) => mm * 3.7795 * scale;
    const width = mmToPx(templateSize.width);
    const height = mmToPx(templateSize.height);

    // Get current non-grid objects
    const currentObjects = canvas.getObjects().filter((obj: any) => obj.selectable !== false);
    
    // Create a map of existing fields by ID
    const existingFieldsMap = new Map<string, any>();
    currentObjects.forEach((obj: any) => {
      if (obj.fieldId) {
        existingFieldsMap.set(obj.fieldId, obj);
      }
    });

    // Track which fields we've processed
    const processedFieldIds = new Set<string>();

    // Update or create fields
    fields.forEach(fieldConfig => {
      const fieldId = fieldConfig.id || `${fieldConfig.templateField}-${fieldConfig.position?.x}-${fieldConfig.position?.y}`;
      processedFieldIds.add(fieldId);

      const existingObj = existingFieldsMap.get(fieldId);

      if (existingObj) {
        // Update existing object instead of recreating
        const newLeft = mmToPx(fieldConfig.position?.x || 0);
        const newTop = mmToPx(fieldConfig.position?.y || 0);
        const newWidth = mmToPx(fieldConfig.size?.width || 50);
        const newHeight = mmToPx(fieldConfig.size?.height || 10);

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
          (obj as any).fieldId = fieldId;
          canvas.add(obj);
        }
      }
    });

    // Remove objects that are no longer in fields
    currentObjects.forEach((obj: any) => {
      if (obj.fieldId && !processedFieldIds.has(obj.fieldId)) {
        canvas.remove(obj);
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
