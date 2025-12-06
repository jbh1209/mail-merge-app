import { useEffect, useRef, useCallback } from 'react';
import { Canvas as FabricCanvas, Line } from 'fabric';
import { FieldConfig } from '@/lib/canvas-utils';
import { 
  createLabelTextField, 
  createAddressBlock, 
  createBarcodeField,
  createQRCodeField,
  createSequenceField,
  createImageField,
  createShapeField
} from '@/lib/fabric-helpers';
import { validateFieldSize, getValidationBorderColor } from '@/lib/element-size-validation';
import { toast } from '@/hooks/use-toast';
import { Coordinates } from '@/lib/coordinates';

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

// Use centralized coordinate system
const mmToPx = Coordinates.mmToPx;
const pxToMm = Coordinates.pxToMm;

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
  const gridObjectsRef = useRef<any[]>([]);
  
  // Refs for callbacks to avoid stale closures and prevent effect re-runs
  const onFieldsChangeRef = useRef(onFieldsChange);
  const onFieldsSelectedRef = useRef(onFieldsSelected);
  const onCanvasReadyRef = useRef(onCanvasReady);
  const fieldsRef = useRef(fields);
  const sampleDataRef = useRef(sampleData);
  const recordIndexRef = useRef(recordIndex);
  
  // Track which fields have had autoFit updates sent to prevent infinite loops
  const autoFitSentRef = useRef<Set<string>>(new Set());
  
  // Track if user is currently interacting (dragging/scaling) to prevent position overwrites
  const isUserInteractingRef = useRef(false);

  // Keep refs updated on every render
  useEffect(() => {
    onFieldsChangeRef.current = onFieldsChange;
    onFieldsSelectedRef.current = onFieldsSelected;
    onCanvasReadyRef.current = onCanvasReady;
    fieldsRef.current = fields;
    sampleDataRef.current = sampleData;
    recordIndexRef.current = recordIndex;
  });

  // Helper: Find object by fieldId using Fabric's native method
  const findObjectByFieldId = useCallback((canvas: FabricCanvas, fieldId: string) => {
    return canvas.getObjects().find((obj: any) => obj.fieldId === fieldId);
  }, []);

  // =============================================================================
  // EFFECT 1: Canvas Initialization + ALL Event Handlers (runs once on mount/size change)
  // =============================================================================
  useEffect(() => {
    if (!canvasRef.current) return;

    const baseWidth = mmToPx(templateSize.width);
    const baseHeight = mmToPx(templateSize.height);

    // Create canvas with scaled dimensions immediately
    // Performance optimizations: renderOnAddRemove=false for batch operations
    const canvas = new FabricCanvas(canvasRef.current, {
      width: baseWidth * scale,
      height: baseHeight * scale,
      backgroundColor: '#ffffff',
      selection: true,
      preserveObjectStacking: true,
      renderOnAddRemove: false, // Batch renders - call requestRenderAll() explicitly
    });

    // Apply zoom immediately so objects render at correct size
    canvas.setZoom(scale);

    fabricCanvasRef.current = canvas;
    
    console.log(`🎨 Canvas created: ${baseWidth.toFixed(0)}x${baseHeight.toFixed(0)}px base, ${(baseWidth * scale).toFixed(0)}x${(baseHeight * scale).toFixed(0)}px scaled at ${scale}x zoom`);

    // ---- Selection Event Handlers ----
    const handleSelection = (e: any) => {
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

    // ---- Object Modified Handler ----
    const handleObjectModified = (e: any) => {
      const obj = e.target as any;
      if (!obj?.fieldId || !onFieldsChangeRef.current) return;
      
      const isGroup = obj.type === 'Group' || obj.type === 'group';
      const isTextbox = obj.type === 'textbox';
      
      // Get the ACTUAL rendered dimensions (including scale)
      const actualWidth = obj.getScaledWidth();
      const actualHeight = obj.getScaledHeight();
      
      // For non-groups: normalize scale to 1 after capturing dimensions
      if (!isGroup) {
        const updateProps: any = {
          width: actualWidth,
          scaleX: 1,
          scaleY: 1
        };
        
        // CRITICAL: Don't set height on Textbox - it auto-calculates from content
        if (!isTextbox) {
          updateProps.height = actualHeight;
        }
        
        obj.set(updateProps);
        obj.setCoords();
      }
      
      const newPosition = {
        x: pxToMm(obj.left),
        y: pxToMm(obj.top)
      };
      
      // Find the field config to preserve textbox height
      const fieldConfig = fieldsRef.current.find(f => f.id === obj.fieldId);
      
      // For textboxes, preserve the CONFIGURED height (not rendered height)
      const newSize = {
        width: pxToMm(actualWidth),
        height: isTextbox && fieldConfig ? fieldConfig.size.height : pxToMm(actualHeight)
      };
      
      // Validate and show visual feedback
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
      
      // Notify parent of position/size changes
      const updatedFields = fieldsRef.current.map(f => 
        f.id === obj.fieldId 
          ? { ...f, position: newPosition, size: newSize }
          : f
      );
      onFieldsChangeRef.current(updatedFields);
    };

    // ---- Object Removed Handler (for cleanup tracking) ----
    const handleObjectRemoved = (e: any) => {
      const obj = e.target;
      if (obj?.fieldId) {
        autoFitSentRef.current.delete(obj.fieldId);
      }
    };

    // ---- Keyboard Handler ----
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const activeObj = canvas.getActiveObject();
        if (activeObj && (activeObj as any).fieldId && onFieldsChangeRef.current) {
          const fieldId = (activeObj as any).fieldId;
          
          // Remove from canvas (Fabric handles cleanup via object:removed event)
          canvas.remove(activeObj);
          
          // Notify parent - send filtered array (deletion signal)
          const updatedFields = fieldsRef.current.filter(f => f.id !== fieldId);
          onFieldsChangeRef.current(updatedFields);
          
          // Clear selection
          if (onFieldsSelectedRef.current) {
            onFieldsSelectedRef.current([]);
          }
          
          canvas.requestRenderAll();
          e.preventDefault();
        }
      }
    };

    // Track interaction start/end to prevent Effect 2 from overwriting drag positions
    const handleInteractionStart = () => {
      isUserInteractingRef.current = true;
    };
    
    const handleInteractionEnd = (e: any) => {
      isUserInteractingRef.current = false;
      handleObjectModified(e);
    };

    // Register ALL event handlers
    canvas.on('selection:created', handleSelection);
    canvas.on('selection:updated', handleSelection);
    canvas.on('selection:cleared', handleSelectionCleared);
    canvas.on('object:moving', handleInteractionStart);
    canvas.on('object:scaling', handleInteractionStart);
    canvas.on('object:modified', handleInteractionEnd);
    canvas.on('object:removed', handleObjectRemoved);
    window.addEventListener('keydown', handleKeyDown);

    // Notify parent that canvas is ready (use ref to avoid stale closure)
    if (onCanvasReadyRef.current) {
      onCanvasReadyRef.current(canvas);
    }

    return () => {
      // Cleanup
      canvas.off('selection:created', handleSelection);
      canvas.off('selection:updated', handleSelection);
      canvas.off('selection:cleared', handleSelectionCleared);
      canvas.off('object:moving', handleInteractionStart);
      canvas.off('object:scaling', handleInteractionStart);
      canvas.off('object:modified', handleInteractionEnd);
      canvas.off('object:removed', handleObjectRemoved);
      window.removeEventListener('keydown', handleKeyDown);
      canvas.dispose();
      fabricCanvasRef.current = null;
    };
  }, [templateSize.width, templateSize.height]); // Only recreate canvas when SIZE changes, NOT zoom

  // =============================================================================
  // EFFECT 2: Field Synchronization (runs when fields/data change)
  // =============================================================================
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const syncFieldsToCanvas = async () => {
      const currentFieldIds = new Set(fields.map(f => f.id));
      const autoFitUpdates: FieldConfig[] = [];
      
      // Get all current field objects (excluding grid)
      const existingObjects = canvas.getObjects().filter((obj: any) => obj.fieldId);
      const existingFieldIds = new Set(existingObjects.map((obj: any) => obj.fieldId));

      // 1. REMOVE objects that no longer exist in fields
      existingObjects.forEach((obj: any) => {
        if (!currentFieldIds.has(obj.fieldId)) {
          canvas.remove(obj);
        }
      });

      // 2. CREATE or UPDATE objects for each field
      for (const fieldConfig of fields) {
        const existingObj = findObjectByFieldId(canvas, fieldConfig.id);

        if (existingObj) {
          // UPDATE existing object - just update properties, don't recreate
          updateExistingObject(existingObj, fieldConfig);
          
          // Update text content based on field type
          updateObjectText(existingObj, fieldConfig);
        } else {
          // CREATE new object
          const newObj = await createFieldObject(fieldConfig);
          
          if (newObj) {
            (newObj as any).fieldId = fieldConfig.id;
            
            // Apply layer properties
            newObj.set({
              selectable: !fieldConfig.locked,
              evented: !fieldConfig.locked,
              visible: fieldConfig.visible !== false,
            });
            
            // Validate and apply visual indicator
            const validation = validateFieldSize(fieldConfig);
            const borderColor = getValidationBorderColor(validation);
            if (borderColor) {
              newObj.set({ stroke: borderColor, strokeWidth: 2 });
            }
            
            // Show toast for size issues
            if (validation.message) {
              toast({
                title: validation.severity === 'error' ? 'Size Too Small' : 'Size Warning',
                description: validation.message,
                variant: validation.severity === 'error' ? 'destructive' : 'default',
              });
            }
            
            canvas.add(newObj);
            
            // Collect autoFit updates ONLY if not already sent
            if (fieldConfig.autoFit && !fieldConfig.autoFitApplied && !autoFitSentRef.current.has(fieldConfig.id)) {
              const fittedFontSize = (newObj as any).fontSize;
              if (fittedFontSize) {
                autoFitSentRef.current.add(fieldConfig.id); // Mark as sent
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

      // 3. Z-INDEX: Reorder by bringing to front in sorted order (lowest first, highest last)
      const sortedFields = [...fields].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
      
      sortedFields.forEach((field) => {
        const obj = findObjectByFieldId(canvas, field.id);
        if (obj) {
          canvas.bringObjectToFront(obj);
        }
      });
      
      // Ensure grid stays at the back
      gridObjectsRef.current.forEach(line => {
        canvas.sendObjectToBack(line);
      });

      // 4. BATCH: Send autoFit updates after processing (only new ones)
      if (autoFitUpdates.length > 0 && onFieldsChangeRef.current) {
        setTimeout(() => {
          onFieldsChangeRef.current!(autoFitUpdates);
        }, 0);
      }

      // SINGLE renderAll at the end
      canvas.requestRenderAll();
    };

    // Helper: Update existing object properties
    const updateExistingObject = (obj: any, fieldConfig: FieldConfig) => {
      // DON'T update position if user is currently dragging - prevents snapping back
      if (!isUserInteractingRef.current) {
        const targetX = mmToPx(fieldConfig.position.x);
        const targetY = mmToPx(fieldConfig.position.y);
        const targetWidth = mmToPx(fieldConfig.size.width);
        
        // TOLERANCE CHECK: Only update if difference exceeds 0.5px
        // This prevents micro-snapping from mm↔px conversion precision loss
        const tolerance = 0.5;
        const needsPositionUpdate = 
          Math.abs(obj.left - targetX) > tolerance || 
          Math.abs(obj.top - targetY) > tolerance ||
          Math.abs(obj.width - targetWidth) > tolerance;
        
        if (needsPositionUpdate) {
          obj.set({
            left: targetX,
            top: targetY,
            width: targetWidth,
            scaleX: 1,
            scaleY: 1,
          });
        }
      }
      
      // Always update non-positional properties
      obj.set({
        selectable: !fieldConfig.locked,
        evented: !fieldConfig.locked,
        visible: fieldConfig.visible !== false,
      });

      // Style properties (safe to always apply except fontSize)
      obj.set({
        textAlign: fieldConfig.style.textAlign,
        fontWeight: fieldConfig.style.fontWeight,
        fontFamily: fieldConfig.style.fontFamily,
        fill: fieldConfig.style.color,
      });

      // Only apply fontSize if explicitly set and not overridden by user
      if (fieldConfig.style.fontSize && !fieldConfig.userOverrideFontSize) {
        obj.set({ fontSize: fieldConfig.style.fontSize });
      } else if (fieldConfig.userOverrideFontSize) {
        obj.set({ fontSize: fieldConfig.userOverrideFontSize });
      }

      obj.setCoords();
    };

    // Helper: Update text content based on field type
    const updateObjectText = (obj: any, fieldConfig: FieldConfig) => {
      let newText = '';
      
      if (fieldConfig.fieldType === 'sequence') {
        const config = fieldConfig.typeConfig || {};
        const start = config.sequenceStart || 1;
        const prefix = config.sequencePrefix || '';
        const suffix = config.sequenceSuffix || '';
        const padding = config.sequencePadding || 0;
        
        const number = start + recordIndex;
        const paddedNumber = String(number).padStart(padding, '0');
        newText = prefix + paddedNumber + suffix;
      } else if (fieldConfig.combinedFields) {
        const lines = fieldConfig.combinedFields
          .map(f => sampleData?.[f] || '')
          .filter(Boolean);
        // Show placeholder if no data
        newText = lines.length > 0 ? lines.join('\n') : `[${fieldConfig.combinedFields.join(', ')}]`;
      } else {
        // Show placeholder if no data found
        newText = sampleData?.[fieldConfig.templateField] || `[${fieldConfig.templateField}]`;
      }
      
      // Only update if object has text property (textbox)
      if (obj.type === 'textbox' && obj.text !== newText) {
        obj.set('text', newText);
      }
    };

    // Helper: Create new field object
    const createFieldObject = async (fieldConfig: FieldConfig) => {
      switch (fieldConfig.fieldType) {
        case 'address_block':
          return createAddressBlock(fieldConfig, sampleData, 1);
        case 'barcode':
          return await createBarcodeField(fieldConfig, sampleData, 1);
        case 'qrcode':
          return await createQRCodeField(fieldConfig, sampleData, 1);
        case 'sequence':
          return createSequenceField(fieldConfig, recordIndex, 1);
        case 'image':
          return await createImageField(fieldConfig, 1);
        case 'shape':
          return createShapeField(fieldConfig, 1);
        case 'text':
        default:
          return createLabelTextField(fieldConfig, sampleData, 1);
      }
    };

    syncFieldsToCanvas();
  }, [fields, sampleData, recordIndex, findObjectByFieldId]);

  // =============================================================================
  // EFFECT 3: Visual Settings (grid, zoom - runs when display settings change)
  // =============================================================================
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    // Update zoom and dimensions
    canvas.setZoom(scale);
    canvas.setDimensions({
      width: mmToPx(templateSize.width) * scale,
      height: mmToPx(templateSize.height) * scale
    });

    // Remove old grid objects
    gridObjectsRef.current.forEach(obj => canvas.remove(obj));
    gridObjectsRef.current = [];

    // Draw grid if enabled
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
        canvas.sendObjectToBack(line);
        gridObjectsRef.current.push(line);
      }
      // Horizontal lines
      for (let y = 0; y <= height; y += gridSize) {
        const line = new Line([0, y, width, y], gridOptions);
        canvas.add(line);
        canvas.sendObjectToBack(line);
        gridObjectsRef.current.push(line);
      }
    }

    canvas.requestRenderAll();
  }, [scale, showGrid, templateSize.width, templateSize.height]);

  return (
    <div className="relative border-2 border-border rounded-lg overflow-hidden shadow-lg bg-muted/20">
      <canvas ref={canvasRef} />
    </div>
  );
}
