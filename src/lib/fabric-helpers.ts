// Fabric.js helper functions for label field creation and text sizing
import { Canvas, Textbox, Group, Rect, Text, FabricObject, Image as FabricImage } from 'fabric';
import { FieldConfig, FieldType } from './canvas-utils';
import { CoordinateSystem } from './canvas-coordinate-system';

/**
 * Get field value from data with comprehensive matching strategies
 */
const getFieldValue = (fieldName: string, data: Record<string, any> | undefined): string | null => {
  if (!data) {
    console.log(`📝 getFieldValue: No data provided for "${fieldName}"`);
    return null;
  }
  
  const dataKeys = Object.keys(data);
  console.log(`📝 Looking for "${fieldName}" in keys:`, dataKeys.slice(0, 5), `(${dataKeys.length} total)`);
  
  // Helper to check if value is valid (not null/undefined/empty)
  const isValidValue = (val: any): boolean => {
    if (val === null || val === undefined) return false;
    const str = String(val).trim();
    return str.length > 0 && str.toLowerCase() !== 'null';
  };

  // 1. Exact match
  if (data[fieldName] !== undefined && isValidValue(data[fieldName])) {
    console.log(`✅ Exact match: "${fieldName}" → "${data[fieldName]}"`);
    return String(data[fieldName]);
  }
  
  // 2. Case-insensitive match
  const lowerField = fieldName.toLowerCase();
  for (const key of dataKeys) {
    if (key.toLowerCase() === lowerField && isValidValue(data[key])) {
      console.log(`✅ Case-insensitive match: "${fieldName}" → "${key}" → "${data[key]}"`);
      return String(data[key]);
    }
  }
  
  // 3. Normalized match (remove spaces, underscores, hyphens)
  const normalize = (s: string) => s.toLowerCase().replace(/[\s_-]/g, '');
  const normalizedField = normalize(fieldName);
  
  for (const key of dataKeys) {
    if (normalize(key) === normalizedField && isValidValue(data[key])) {
      console.log(`✅ Normalized match: "${fieldName}" → "${key}" → "${data[key]}"`);
      return String(data[key]);
    }
  }
  
  // 4. Partial match (contains)
  for (const key of dataKeys) {
    if ((normalize(key).includes(normalizedField) || normalizedField.includes(normalize(key))) && isValidValue(data[key])) {
      console.log(`✅ Partial match: "${fieldName}" → "${key}" → "${data[key]}"`);
      return String(data[key]);
    }
  }
  
  console.warn(`❌ Field "${fieldName}" not found. Available keys:`, dataKeys);
  return null;
};

// Custom properties for label fields
export interface LabelFieldObject extends Textbox {
  fieldName: string;
  fieldType: FieldType;
  dataColumn?: string;
  combinedFields?: string[];
  templateField: string;
}

/**
 * Fit text to box using Fabric.js native capabilities with binary search
 */
function fitTextToBox(
  textbox: Textbox,
  maxWidth: number,
  maxHeight: number,
  minFontSize: number = 10
): void {
  // Binary search for optimal font size
  let high = 48; // Start with a larger max size
  let low = minFontSize;
  let bestFit = minFontSize;

  while (high - low > 1) {
    const mid = Math.floor((high + low) / 2);
    textbox.set('fontSize', mid);
    textbox.setCoords();

    const textHeight = textbox.calcTextHeight();
    const textWidth = textbox.calcTextWidth();

    if (textHeight <= maxHeight && textWidth <= maxWidth) {
      bestFit = mid;
      low = mid; // Can try larger
    } else {
      high = mid; // Must try smaller
    }
  }

  textbox.set('fontSize', bestFit);
  console.log(`📏 Fit text: "${textbox.text?.slice(0, 20)}..." to ${maxWidth.toFixed(0)}x${maxHeight.toFixed(0)}px → ${bestFit}pt`);
}

export function createLabelTextField(
  fieldConfig: FieldConfig,
  sampleData?: Record<string, any>,
  scale: number = 1
): LabelFieldObject | null {
  const { templateField, position, size, style } = fieldConfig;
  const value = getFieldValue(templateField, sampleData);
  
  // Show placeholder with field name if no data found - visible for debugging
  const displayText = value || `[${templateField}]`;
  
  if (!value) {
    console.warn(`⚠️ No data for field "${templateField}" - showing placeholder`);
  }
  
  // Convert mm to px using centralized coordinate system
  const pxCoords = CoordinateSystem.fieldConfigToPx(fieldConfig, scale);
  
  const initialFontSize = style.fontSize || 24;

  console.log(`📍 Field "${templateField}": ${position.x.toFixed(1)},${position.y.toFixed(1)}mm → ${pxCoords.position.x.toFixed(0)},${pxCoords.position.y.toFixed(0)}px (TOP-LEFT)`);

  // Use TOP-LEFT origin - matches storage format, simpler
  const textbox = new Textbox(displayText, {
    left: pxCoords.position.x,
    top: pxCoords.position.y,
    width: pxCoords.size.width,
    fontSize: initialFontSize,
    fontFamily: style.fontFamily || 'Arial',
    fontWeight: style.fontWeight || 'normal',
    fill: style.color || '#000000',
    textAlign: style.textAlign || 'center',
    originX: 'left',  // TOP-LEFT coordinate system
    originY: 'top',   // TOP-LEFT coordinate system
    selectable: true,
    hasControls: true,
    hasBorders: true,
    lockRotation: true,
    splitByGrapheme: false,
  });

  (textbox as any).fieldName = templateField;
  (textbox as any).fieldType = fieldConfig.fieldType || 'text';
  (textbox as any).templateField = templateField;

  // Only auto-fit if enabled AND not already applied (prevents re-fitting on zoom)
  if (fieldConfig.autoFit && !fieldConfig.autoFitApplied) {
    fitTextToBox(textbox, pxCoords.size.width, pxCoords.size.height);
  }

  return textbox as LabelFieldObject;
}

export function createAddressBlock(
  fieldConfig: FieldConfig,
  sampleData?: Record<string, any>,
  scale: number = 1
): LabelFieldObject | null {
  const { position, size, style, combinedFields } = fieldConfig;

  if (!combinedFields || combinedFields.length === 0) {
    console.warn("createAddressBlock called without combinedFields");
    return null;
  }

  // Gather all field values
  const lines: string[] = [];
  for (const fieldName of combinedFields) {
    const value = getFieldValue(fieldName, sampleData);
    if (value && value.trim()) {
      lines.push(value.trim());
    }
  }

  // Show placeholder with field names if no data found
  const displayText = lines.length > 0 ? lines.join('\n') : `[${combinedFields.join(', ')}]`;
  
  if (lines.length === 0) {
    console.warn(`⚠️ Address block empty - no data for fields:`, combinedFields, '- showing placeholder');
  }
  
  // Convert mm to px using centralized coordinate system
  const pxCoords = CoordinateSystem.fieldConfigToPx(fieldConfig, scale);
  
  // Use user's font size setting instead of hardcoded value
  const initialFontSize = style.fontSize || 24;

  console.log(`📍 Address block: ${position.x.toFixed(1)},${position.y.toFixed(1)}mm → ${pxCoords.position.x.toFixed(0)},${pxCoords.position.y.toFixed(0)}px (TOP-LEFT)`);

  // Use TOP-LEFT origin - matches storage format
  const textbox = new Textbox(displayText, {
    left: pxCoords.position.x,
    top: pxCoords.position.y,
    width: pxCoords.size.width,
    fontSize: initialFontSize,
    fontFamily: style.fontFamily || 'Arial',
    fontWeight: style.fontWeight || 'normal',
    fill: style.color || '#000000',
    textAlign: style.textAlign || 'center',
    originX: 'left',  // TOP-LEFT coordinate system
    originY: 'top',   // TOP-LEFT coordinate system
    selectable: true,
    hasControls: true,
    hasBorders: true,
    lockRotation: true,
    splitByGrapheme: false,
  });

  (textbox as any).fieldName = combinedFields[0];
  (textbox as any).fieldType = 'address_block';
  (textbox as any).templateField = combinedFields[0];
  (textbox as any).combinedFields = combinedFields;

  // Only auto-fit if enabled AND not already applied (prevents re-fitting on zoom)
  if (fieldConfig.autoFit && !fieldConfig.autoFitApplied) {
    fitTextToBox(textbox, pxCoords.size.width, pxCoords.size.height, 10);
  }

  return textbox as LabelFieldObject;
}

export async function createBarcodeField(
  fieldConfig: FieldConfig,
  sampleData?: Record<string, any>,
  scale: number = 1
): Promise<Group> {
  const { generateBarcodeSVG } = await import('./barcode-svg-utils');
  const pxCoords = CoordinateSystem.fieldConfigToPx(fieldConfig, scale);
  
  // Get barcode value from data
  const value = getFieldValue(fieldConfig.templateField, sampleData) || '123456789012';
  const format = fieldConfig.typeConfig?.barcodeFormat || 'CODE128';
  
  try {
    // Generate SVG barcode
    const svgString = generateBarcodeSVG(value, format, {
      width: pxCoords.size.width,
      height: pxCoords.size.height,
    });
    
    // Load SVG into Fabric.js
    const { loadSVGFromString } = await import('fabric');
    
    return new Promise((resolve) => {
      loadSVGFromString(svgString).then(({ objects, options }) => {
        const group = new Group(objects, {
          left: pxCoords.position.x,
          top: pxCoords.position.y,
          originX: 'left',
          originY: 'top',
          selectable: true,
          hasControls: true,
          lockRotation: true,
        });
        
        (group as any).fieldType = 'barcode';
        (group as any).templateField = fieldConfig.templateField;
        (group as any).typeConfig = fieldConfig.typeConfig;
        
        resolve(group);
      });
    });
  } catch (error) {
    console.error('Error creating barcode:', error);
    // Fallback to placeholder
    const rect = new Rect({
      width: pxCoords.size.width,
      height: pxCoords.size.height,
      fill: '#e0e0e0',
      stroke: '#999',
    });
    
    const text = new Text('BARCODE\nERROR', {
      fontSize: 12,
      fill: '#ff0000',
      textAlign: 'center',
      originX: 'center',
      originY: 'center',
    });
    
    const group = new Group([rect, text], {
      left: pxCoords.position.x,
      top: pxCoords.position.y,
      originX: 'left',
      originY: 'top',
    });
    
    (group as any).fieldType = 'barcode';
    (group as any).templateField = fieldConfig.templateField;
    return group;
  }
}

export async function createQRCodeField(
  fieldConfig: FieldConfig,
  sampleData?: Record<string, any>,
  scale: number = 1
): Promise<Group> {
  const { generateQRCodeSVG } = await import('./barcode-svg-utils');
  const pxCoords = CoordinateSystem.fieldConfigToPx(fieldConfig, scale);
  
  // Get QR code value from data
  const value = getFieldValue(fieldConfig.templateField, sampleData) || 'https://example.com';
  
  try {
    // Generate SVG QR code
    const svgString = generateQRCodeSVG(value, {
      width: pxCoords.size.width,
      height: pxCoords.size.height,
      ecLevel: fieldConfig.typeConfig?.qrErrorCorrection || 'M',
    });
    
    // Load SVG into Fabric.js
    const { loadSVGFromString } = await import('fabric');
    
    return new Promise((resolve) => {
      loadSVGFromString(svgString).then(({ objects, options }) => {
        const group = new Group(objects, {
          left: pxCoords.position.x,
          top: pxCoords.position.y,
          originX: 'left',
          originY: 'top',
          selectable: true,
          hasControls: true,
          lockRotation: true,
        });
        
        (group as any).fieldType = 'qrcode';
        (group as any).templateField = fieldConfig.templateField;
        (group as any).typeConfig = fieldConfig.typeConfig;
        
        resolve(group);
      });
    });
  } catch (error) {
    console.error('Error creating QR code:', error);
    // Fallback to placeholder
    const rect = new Rect({
      width: pxCoords.size.width,
      height: pxCoords.size.height,
      fill: '#e0e0e0',
      stroke: '#999',
    });
    
    const text = new Text('QR CODE\nERROR', {
      fontSize: 12,
      fill: '#ff0000',
      textAlign: 'center',
      originX: 'center',
      originY: 'center',
    });
    
    const group = new Group([rect, text], {
      left: pxCoords.position.x,
      top: pxCoords.position.y,
      originX: 'left',
      originY: 'top',
    });
    
    (group as any).fieldType = 'qrcode';
    (group as any).templateField = fieldConfig.templateField;
    return group;
  }
}

export function createSequenceField(
  fieldConfig: FieldConfig,
  recordIndex: number,
  scale: number = 1
): LabelFieldObject {
  const pxCoords = CoordinateSystem.fieldConfigToPx(fieldConfig, scale);
  
  // Calculate sequence value
  const config = fieldConfig.typeConfig || {};
  const start = config.sequenceStart || 1;
  const prefix = config.sequencePrefix || '';
  const suffix = config.sequenceSuffix || '';
  const padding = config.sequencePadding || 0;
  
  const number = start + recordIndex;
  const paddedNumber = String(number).padStart(padding, '0');
  const displayText = prefix + paddedNumber + suffix;
  
  const textbox = new Textbox(displayText, {
    left: pxCoords.position.x,
    top: pxCoords.position.y,
    width: pxCoords.size.width,
    fontSize: fieldConfig.style.fontSize || 24,
    fontFamily: fieldConfig.style.fontFamily || 'Arial',
    fontWeight: fieldConfig.style.fontWeight || 'normal',
    fill: fieldConfig.style.color || '#000000',
    textAlign: fieldConfig.style.textAlign || 'center',
    originX: 'left',
    originY: 'top',
    selectable: true,
    hasControls: true,
    hasBorders: true,
    lockRotation: true,
  });
  
  (textbox as any).fieldName = fieldConfig.templateField;
  (textbox as any).fieldType = 'sequence';
  (textbox as any).templateField = fieldConfig.templateField;
  (textbox as any).typeConfig = fieldConfig.typeConfig;
  
  // Store intended dimensions for validation preservation
  (textbox as any).intendedWidth = fieldConfig.size.width;
  (textbox as any).intendedHeight = fieldConfig.size.height;
  
  return textbox as LabelFieldObject;
}

/**
 * Convert Fabric canvas to field configs for saving
 * Since we use originX/Y: 'left'/'top', obj.left and obj.top ARE top-left coords
 * This makes conversion trivial!
 */
export function fabricToFieldConfigs(canvas: any, scale: number = 1): FieldConfig[] {
  const pxToMm = (px: number) => px / (3.7795 * scale);
  
  return canvas.getObjects()
    .filter((obj: any) => obj.type === 'textbox' || obj.type === 'Group' || obj.type === 'group')
    .map((obj: any, index: number) => {
      const labelObj = obj as LabelFieldObject;
      const isGroup = obj.type === 'Group' || obj.type === 'group';
      
      // Preserve the existing field ID instead of generating new ones
      const fieldId = (obj as any).fieldId || `field-${index}`;
      
      // Since originX/Y is 'left'/'top', these ARE top-left coordinates!
      const baseConfig = {
        id: fieldId,
        templateField: labelObj.templateField || labelObj.fieldName || 'field',
        position: {
          x: pxToMm(obj.left || 0),  // Already top-left
          y: pxToMm(obj.top || 0)    // Already top-left
        },
        size: {
          width: pxToMm(obj.getScaledWidth()),
          height: pxToMm(obj.getScaledHeight())
        },
        zIndex: index,
        locked: (obj as any).locked || false,
        visible: (obj as any).visible !== false
      };
      
      // For Groups (QR/barcode), preserve their typeConfig and fieldType
      if (isGroup) {
        return {
          ...baseConfig,
          fieldType: (obj as any).fieldType || 'qrcode',
          typeConfig: (obj as any).typeConfig || {},
          style: {
            fontSize: 12,
            fontFamily: 'Arial',
            fontWeight: 'normal',
            fontStyle: 'normal',
            textAlign: 'center',
            color: '#000000',
            verticalAlign: 'middle'
          },
          overflow: 'shrink',
          autoFit: false,
          showLabel: false
        };
      }
      
      // For textboxes, preserve all existing properties
      return {
        ...baseConfig,
        style: {
          fontSize: (obj as Textbox).fontSize || 12,
          fontFamily: (obj as Textbox).fontFamily || 'Arial',
          fontWeight: ((obj as Textbox).fontWeight as any) || 'normal',
          fontStyle: 'normal',
          textAlign: ((obj as Textbox).textAlign as any) || 'left',
          color: (obj as Textbox).fill as string || '#000000',
          verticalAlign: 'top'
        },
        overflow: 'shrink',
        autoFit: (obj as any).autoFit !== false,
        showLabel: (obj as any).showLabel || false,
        fieldType: labelObj.fieldType || 'text',
        combinedFields: labelObj.combinedFields,
        typeConfig: (obj as any).typeConfig
      };
    });
}

/**
 * Update field text with new data
 */
export function updateFieldData(
  canvas: any,
  fieldName: string,
  newValue: string
): void {
  canvas.getObjects().forEach((obj: any) => {
    const labelObj = obj as LabelFieldObject;
    if (labelObj.fieldName === fieldName && obj instanceof Textbox) {
      obj.set('text', newValue);
    }
  });
  canvas.renderAll();
}
