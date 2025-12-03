import { useEffect, useRef } from 'react';
import { Canvas as FabricCanvas, Line } from 'fabric';
import { FieldConfig } from '@/lib/canvas-utils';
import { 
  createLabelTextField, 
  createAddressBlock, 
  createBarcodeField,
  createQRCodeField,
  createSequenceField
} from '@/lib/fabric-helpers';
import { validateFieldSize, getValidationBorderColor } from '@/lib/element-size-validation';
import { toast } from '@/hooks/use-toast';

interface FabricLabelCanvasProps {
  templateSize: { width: number; height: number }; // in mm
  fields: FieldConfig[];
  sampleData?: Record<string, any>;
  recordIndex?: number;
  scale: number;
  showGrid?: boolean;
  onFieldsChange?: (fields: FieldConfig[]) => void;
  onCanvasReady?: (canvas: FabricCanvas) => void;
  onFieldsSelected?: (fieldIds: string[]) => void;
}

export function FabricLabelCanvas({
  templateSize,
  fields,
  sampleData,
  recordIndex = 0,
  scale,
  showGrid = true,
  onFieldsChange,
  onCanvasReady,
  onFieldsSelected
}: FabricLabelCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<FabricCanvas | null>(null);
  const objectsRef = useRef<Map<string, any>>(new Map());
  const gridObjectsRef = useRef<any[]>([]);

  // Refs for callbacks to avoid canvas recreation
  const onFieldsChangeRef = useRef(onFieldsChange);
  const onFieldsSelectedRef = useRef(onFieldsSelected);
  const fieldsRef = useRef(fields);

  // Keep refs updated
  useEffect(() => {
    onFieldsChangeRef.current = onFieldsChange;
    onFieldsSelectedRef.current = onFieldsSelected;
    fieldsRef.current = fields;
  });

  // Single conversion function - everything at base scale
  const mmToPx = (mm: number) => mm * 3.7795;
  const pxToMm = (px: number) => px / 3.7795;

  // Initialize canvas once (only on mount or size change)
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

    return () => {
      canvas.dispose();
      objectsRef.current.clear();
      fabricCanvasRef.current = null;
    };
  }, [templateSize.width, templateSize.height]);

  // Setup event handlers (uses refs to avoid recreating canvas)
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const handleSelectionCreated = (e: any) => {
      if (!onFieldsSelectedRef.current) return;
      const selectedIds = (e.selected || [])
        .map((obj: any) => obj.fieldId)
        .filter(Boolean);
      onFieldsSelectedRef.current(selectedIds);
    };

    const handleSelectionUpdated = (e: any) => {
      if (!onFieldsSelectedRef.current) return;
      const selectedIds = (e.selected || [])
        .map((obj: any) => obj.fieldId)
        .filter(Boolean);
      onFieldsSelectedRef.current(selectedIds);
    };

    const handleSelectionCleared = () => {
      if (onFieldsSelectedRef.current) {
        onFieldsSelectedRef.current([]);
      }
    };

    const handleObjectModified = (e: any) => {
      const obj = e.target as any;
      if (!obj?.fieldId || !onFieldsChangeRef.current) return;
      
      const isGroup = obj.type === 'Group' || obj.type === 'group';
      
      // Get the ACTUAL rendered dimensions (including scale)
      const actualWidth = obj.getScaledWidth();
      const actualHeight = obj.getScaledHeight();
      
      // CRITICAL: Handle Groups (barcodes/QR codes) differently
      // For textboxes: reset scale to 1 after getting dimensions
      // For groups: DON'T reset scale (causes distortion)
      if (!isGroup) {
        obj.set({
          width: actualWidth,
          height: actualHeight,
          scaleX: 1,
          scaleY: 1
        });
        obj.setCoords();
      }
      
      const newPosition = {
        x: pxToMm(obj.left),
        y: pxToMm(obj.top)
      };
      
      // Find the field config to get original height for textboxes
      const fieldConfig = fieldsRef.current.find(f => f.id === obj.fieldId);
      const isTextbox = obj.type === 'textbox';
      
      // CRITICAL: For textboxes, preserve the CONFIGURED height
      // Textbox height is content-dependent (based on font size); we only track width changes
      // This prevents validation errors when the rendered height differs from configured height
      const newSize = {
        width: pxToMm(actualWidth),
        height: isTextbox && fieldConfig ? fieldConfig.size.height : pxToMm(actualHeight)
      };
      
      // Validate the updated field
      if (fieldConfig) {
        const updatedField = { ...fieldConfig, position: newPosition, size: newSize };
        const validation = validateFieldSize(updatedField);
        
        const borderColor = getValidationBorderColor(validation);
        obj.set({
          stroke: borderColor,
          strokeWidth: borderColor ? 2 : 0
        });
        
        if (validation.message) {
          toast({
            title: validation.severity === 'error' ? 'Size Too Small' : 'Size Warning',
            description: validation.message,
            variant: validation.severity === 'error' ? 'destructive' : 'default',
          });
        }
      }
      
      const updatedFields = fieldsRef.current.map(f => 
        f.id === obj.fieldId 
          ? { ...f, position: newPosition, size: newSize }
          : f
      );
      onFieldsChangeRef.current(updatedFields);
    };

    canvas.on('selection:created', handleSelectionCreated);
    canvas.on('selection:updated', handleSelectionUpdated);
    canvas.on('selection:cleared', handleSelectionCleared);
    canvas.on('object:modified', handleObjectModified);

    return () => {
      canvas.off('selection:created', handleSelectionCreated);
      canvas.off('selection:updated', handleSelectionUpdated);
      canvas.off('selection:cleared', handleSelectionCleared);
      canvas.off('object:modified', handleObjectModified);
    };
  }, []);

  // Keyboard handler (uses refs to avoid recreating canvas)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const canvas = fabricCanvasRef.current;
      if (!canvas) return;
      
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const activeObj = canvas.getActiveObject();
        if (activeObj && (activeObj as any).fieldId && onFieldsChangeRef.current) {
          const fieldId = (activeObj as any).fieldId;
          const updatedFields = fieldsRef.current.filter(f => f.id !== fieldId);
          onFieldsChangeRef.current(updatedFields);
          canvas.remove(activeObj);
          canvas.renderAll();
          if (onFieldsSelectedRef.current) {
            onFieldsSelectedRef.current([]);
          }
          e.preventDefault();
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Update text content when sample data changes (page navigation)
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    // Update text content of existing objects instead of recreating
    objectsRef.current.forEach((obj, fieldId) => {
      const fieldConfig = fields.find(f => f.id === fieldId);
      if (!fieldConfig) return;
      
      // Get new text value for this field
      let newText = '';
      if (fieldConfig.combinedFields) {
        // Address block - combine multiple fields
        newText = fieldConfig.combinedFields
          .map(f => sampleData?.[f] || '')
          .filter(Boolean)
          .join('\n');
      } else {
        newText = sampleData?.[fieldConfig.templateField] || '';
      }
      
      // Update only the text, preserve all other properties
      obj.set('text', newText);
    });
    
    canvas.renderAll();
  }, [sampleData, fields]);

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
      
      // CRITICAL: Send all grid lines to the back so they don't cover text
      gridObjectsRef.current.forEach(line => {
        canvas.sendObjectToBack(line);
      });
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

    // Process fields with async support for barcode/qrcode
    const processFields = async () => {
      const autoFitUpdates: FieldConfig[] = []; // BATCH: Collect all autoFit updates
      
      for (const fieldConfig of fields) {
        const existingObj = objectsRef.current.get(fieldConfig.id);

          if (existingObj) {
          // UPDATE existing object properties without recreating
          // CRITICAL: Always normalize scale to prevent compounding
          const updates: any = {
            left: mmToPx(fieldConfig.position.x),
            top: mmToPx(fieldConfig.position.y),
            width: mmToPx(fieldConfig.size.width),
            scaleX: 1,  // Always reset scale
            scaleY: 1,  // Always reset scale
            textAlign: fieldConfig.style.textAlign,
            fontWeight: fieldConfig.style.fontWeight,
            fontFamily: fieldConfig.style.fontFamily,
            fill: fieldConfig.style.color,
            selectable: !fieldConfig.locked,
            evented: !fieldConfig.locked,
            visible: fieldConfig.visible !== false,
          };

          // Apply fontSize ONLY if user has explicitly set one
          if (fieldConfig.userOverrideFontSize) {
            console.log('🔧 Applying user font size:', {
              fieldId: fieldConfig.id,
              fontSize: fieldConfig.userOverrideFontSize,
              previousFontSize: existingObj.fontSize,
              previousScale: { x: existingObj.scaleX, y: existingObj.scaleY }
            });
            updates.fontSize = fieldConfig.userOverrideFontSize;
          }

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
              obj = await createBarcodeField(fieldConfig, sampleData, 1);
              break;
            case 'qrcode':
              obj = await createQRCodeField(fieldConfig, sampleData, 1);
              break;
            case 'sequence':
              obj = createSequenceField(fieldConfig, recordIndex, 1);
              break;
            case 'text':
            default:
              obj = createLabelTextField(fieldConfig, sampleData, 1);
              break;
          }

          if (obj) {
            (obj as any).fieldId = fieldConfig.id;
            
            // Apply layer properties
            obj.set({
              selectable: !fieldConfig.locked,
              evented: !fieldConfig.locked,
              visible: fieldConfig.visible !== false,
            });
            
            // Validate size and apply visual indicator
            const validation = validateFieldSize(fieldConfig);
            const borderColor = getValidationBorderColor(validation);
            if (borderColor) {
              obj.set({
                stroke: borderColor,
                strokeWidth: 2
              });
            }
            
            // Show toast warning for new elements that are undersized
            if (validation.message && validation.severity === 'error') {
              toast({
                title: 'Size Too Small',
                description: validation.message,
                variant: 'destructive',
              });
            } else if (validation.message && validation.severity === 'warning') {
              toast({
                title: 'Size Warning',
                description: validation.message,
              });
            }
            
            canvas.add(obj);
            objectsRef.current.set(fieldConfig.id, obj);
            
            // Z-index will be handled by render order
            
            // BATCH: Collect autoFit update instead of sending immediately
            if (fieldConfig.autoFit && !fieldConfig.autoFitApplied) {
              const fittedFontSize = (obj as any).fontSize;
              if (fittedFontSize) {
                console.log('✅ fitTextToBox calculated fontSize:', {
                  fieldId: fieldConfig.id,
                  fittedFontSize,
                  originalFontSize: fieldConfig.style.fontSize
                });
                
                autoFitUpdates.push({
                  ...fieldConfig,
                  autoFitApplied: true,
                  style: { ...fieldConfig.style, fontSize: fittedFontSize }
                });
              }
            }
          }
        }
      }

      // Remove objects that no longer exist in fields
      objectsRef.current.forEach((obj, fieldId) => {
        if (!currentFieldIds.has(fieldId)) {
          canvas.remove(obj);
          objectsRef.current.delete(fieldId);
        }
      });
      
      // Apply z-index ordering while preserving selection
      const activeObject = canvas.getActiveObject();
      const activeObjectFieldId = (activeObject as any)?.fieldId;
      
      const sortedFields = [...fields].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
      
      // Collect objects in correct order
      const orderedObjects: any[] = [];
      sortedFields.forEach((field) => {
        const obj = objectsRef.current.get(field.id);
        if (obj) {
          canvas.remove(obj);
          orderedObjects.push(obj);
        }
      });
      
      // Re-add in sorted order (back to front)
      orderedObjects.forEach(obj => {
        canvas.add(obj);
      });
      
      // Restore selection
      if (activeObjectFieldId) {
        const objToSelect = objectsRef.current.get(activeObjectFieldId);
        if (objToSelect) {
          canvas.setActiveObject(objToSelect);
        }
      }
      
      // Re-add grid lines to back
      gridObjectsRef.current.forEach(line => {
        canvas.sendObjectToBack(line);
      });

      // BATCH: Send ALL autoFit updates at once AFTER the loop completes
      if (autoFitUpdates.length > 0 && onFieldsChangeRef.current) {
        setTimeout(() => {
          console.log('🔄 Batch sending autoFit updates:', autoFitUpdates.length);
          onFieldsChangeRef.current(autoFitUpdates);
        }, 0);
      }

      // Debugging: Track object lifecycle
      console.log('📊 Canvas field sync:', {
        fieldsCount: fields.length,
        objectsRefSize: objectsRef.current.size,
        fieldIds: fields.map(f => f.id),
        objectIds: Array.from(objectsRef.current.keys())
      });

      canvas.renderAll();
    };

    processFields();
  }, [fields, sampleData, recordIndex]); // Depend on fields, sampleData, and recordIndex

  return (
    <div className="relative border-2 border-border rounded-lg overflow-hidden shadow-lg bg-muted/20">
      <canvas ref={canvasRef} />
    </div>
  );
}
