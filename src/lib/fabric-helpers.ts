// Fabric.js helper functions for label field creation and text sizing
import { Canvas, Textbox, Group, Rect, Text, FabricObject } from 'fabric';
import { FieldConfig, FieldType } from './canvas-utils';

/**
 * Get field value from data with comprehensive matching strategies
 */
const getFieldValue = (fieldName: string, data: Record<string, any> | undefined): string | null => {
  if (!data) return null;
  
  // 1. Exact match
  if (data[fieldName] !== undefined) return String(data[fieldName]);
  
  // 2. Case-insensitive match
  const lowerField = fieldName.toLowerCase();
  const dataKeys = Object.keys(data);
  
  for (const key of dataKeys) {
    if (key.toLowerCase() === lowerField) {
      return String(data[key]);
    }
  }
  
  // 3. Normalized match (remove spaces, underscores, hyphens)
  const normalize = (s: string) => s.toLowerCase().replace(/[\s_-]/g, '');
  const normalizedField = normalize(fieldName);
  
  for (const key of dataKeys) {
    if (normalize(key) === normalizedField) {
      return String(data[key]);
    }
  }
  
  // 4. Partial match (contains)
  for (const key of dataKeys) {
    if (normalize(key).includes(normalizedField) || normalizedField.includes(normalize(key))) {
      return String(data[key]);
    }
  }
  
  console.warn(`⚠️ Field "${fieldName}" not found. Available keys:`, dataKeys);
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
 * Fit text to box using Fabric.js native capabilities
 */
function fitTextToBox(textbox: Textbox, maxWidth: number, maxHeight: number, minFontSize: number = 10): void {
  // Start with a large font size
  let fontSize = 24;
  textbox.set('fontSize', fontSize);
  
  // Use Fabric's native measurements for both dimensions
  textbox.setCoords();
  let actualHeight = textbox.calcTextHeight();
  let actualWidth = textbox.calcTextWidth();
  
  // Calculate scale factors based on both dimensions
  const heightRatio = maxHeight / actualHeight;
  const widthRatio = maxWidth / actualWidth;
  const scaleFactor = Math.min(heightRatio, widthRatio, 1); // Don't scale up
  
  // Apply as font size reduction (cleaner than using scaleY/scaleX)
  const finalFontSize = Math.max(minFontSize, Math.floor(fontSize * scaleFactor * 0.9));
  textbox.set('fontSize', finalFontSize);
}

export function createLabelTextField(
  fieldConfig: FieldConfig,
  sampleData?: Record<string, any>
): LabelFieldObject | null {
  const { templateField, position, size, style } = fieldConfig;
  const value = getFieldValue(templateField, sampleData);
  
  // If no data found, return empty string (no demo data!)
  const displayText = value || '';
  
  if (!value) {
    console.warn(`⚠️ No data for field "${templateField}"`);
  }
  
  const initialFontSize = style.fontSize || 24;
  
  // Calculate center point for positioning
  const centerX = position.x + size.width / 2;
  const centerY = position.y + size.height / 2;

  const textbox = new Textbox(displayText, {
    left: centerX,
    top: centerY,
    width: size.width,
    fontSize: initialFontSize,
    fontFamily: style.fontFamily || 'Arial',
    fontWeight: style.fontWeight || 'normal',
    fill: style.color || '#000000',
    textAlign: 'center',
    originX: 'center',
    originY: 'center',
    selectable: true,
    hasControls: true,
    hasBorders: true,
    lockRotation: true,
    splitByGrapheme: false,
  });

  (textbox as any).fieldName = templateField;
  (textbox as any).fieldType = fieldConfig.fieldType || 'text';
  (textbox as any).templateField = templateField;

  // Use auto-fit if enabled
  if (fieldConfig.autoFit) {
    fitTextToBox(textbox, size.width, size.height);
  }

  return textbox as LabelFieldObject;
}

export function createAddressBlock(
  fieldConfig: FieldConfig,
  sampleData?: Record<string, any>
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

  // No demo data - if empty, leave empty
  const displayText = lines.join('\n') || '';
  
  if (lines.length === 0) {
    console.warn(`⚠️ Address block empty - no data for fields:`, combinedFields);
  }
  
  const initialFontSize = 24;
  
  // Calculate center Y for vertical centering
  const centerY = position.y + size.height / 2;

  const textbox = new Textbox(displayText, {
    left: position.x,
    top: centerY,
    width: size.width,
    fontSize: initialFontSize,
    fontFamily: style.fontFamily || 'Arial',
    fontWeight: style.fontWeight || 'normal',
    fill: style.color || '#000000',
    textAlign: 'left',
    originX: 'left',
    originY: 'center', // Vertically center the block
    selectable: true,
    hasControls: true,
    hasBorders: true,
    lockRotation: true,
    splitByGrapheme: false,
  });

  (textbox as any).fieldName = combinedFields[0];
  (textbox as any).fieldType = 'address_block';
  (textbox as any).templateField = combinedFields[0];

  // Always auto-fit address blocks
  fitTextToBox(textbox, size.width, size.height, 10);

  return textbox as LabelFieldObject;
}

export function createBarcodeField(
  fieldConfig: FieldConfig
): Group {
  // Barcode implementation remains unchanged for now
  return new Group([], {
    left: fieldConfig.position.x,
    top: fieldConfig.position.y,
    width: fieldConfig.size.width,
    height: fieldConfig.size.height
  });
}

/**
 * Convert Fabric canvas to field configs for saving
 */
export function fabricToFieldConfigs(canvas: any): FieldConfig[] {
  const pxToMm = (px: number) => px / 3.7795;
  
  return canvas.getObjects().map((obj: any, index: number) => {
    const labelObj = obj as LabelFieldObject;
    
    return {
      id: `field-${index}`,
      templateField: labelObj.templateField || labelObj.fieldName || 'field',
      position: {
        x: pxToMm(obj.left || 0),
        y: pxToMm(obj.top || 0)
      },
      size: {
        width: pxToMm(obj.width || 50),
        height: pxToMm(obj.height || 10)
      },
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
      autoFit: true,
      showLabel: false,
      fieldType: labelObj.fieldType || 'text',
      combinedFields: labelObj.combinedFields
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
