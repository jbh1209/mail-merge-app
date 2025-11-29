// Fabric.js helper functions for label field creation and text sizing
import { Canvas, Textbox, Group, Rect, Text, FabricObject } from 'fabric';
import { FieldConfig, FieldType, generateSampleText } from './canvas-utils';

/**
 * Robust case-insensitive field value lookup with normalization
 * Handles spaces, underscores, hyphens, and partial matches
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
  
  // 3. Normalize both sides (remove spaces, underscores, hyphens)
  const normalize = (s: string) => s.toLowerCase().replace(/[\s_-]/g, '');
  const normalizedField = normalize(fieldName);
  
  for (const key of dataKeys) {
    if (normalize(key) === normalizedField) {
      return String(data[key]);
    }
  }
  
  // 4. Partial match (e.g., "address" matches "address_line_1")
  for (const key of dataKeys) {
    const normalizedKey = normalize(key);
    if (normalizedKey.includes(normalizedField) || normalizedField.includes(normalizedKey)) {
      return String(data[key]);
    }
  }
  
  console.warn(`⚠️ No match for "${fieldName}" in available keys:`, dataKeys);
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
 * Fabric.js-native text fitting using calcTextHeight() and ratio-based adjustment
 * Starts large and reduces until text fits within bounds
 */
function fitTextToBox(
  textbox: Textbox,
  maxWidth: number,
  maxHeight: number,
  minFontSize: number = 8
): void {
  // Start with a large font size (24pt)
  let fontSize = 24;
  textbox.set('fontSize', fontSize);
  
  // Use Fabric's actual measurement
  let actualHeight = textbox.calcTextHeight();
  
  // Simple ratio-based reduction until it fits
  let iterations = 0;
  const maxIterations = 10; // Safety limit
  
  while (actualHeight > maxHeight && fontSize > minFontSize && iterations < maxIterations) {
    const ratio = maxHeight / actualHeight;
    fontSize = Math.max(minFontSize, Math.floor(fontSize * ratio * 0.95)); // 0.95 for safety margin
    textbox.set('fontSize', fontSize);
    actualHeight = textbox.calcTextHeight();
    iterations++;
  }
  
  console.log(`📏 fitTextToBox: final fontSize=${fontSize}pt (${iterations} iterations)`);
  
  // If still too tall after reaching minFontSize, use scaleY as last resort
  if (actualHeight > maxHeight) {
    const scaleY = maxHeight / actualHeight;
    textbox.set('scaleY', scaleY);
    console.log(`⚠️ Applied scaleY=${scaleY.toFixed(2)} to fit`);
  }
}

/**
 * Create a Fabric text field with auto-fit sizing
 */
export function createLabelTextField(
  canvas: Canvas,
  fieldConfig: Partial<FieldConfig>,
  sampleData?: Record<string, any>,
  scale: number = 1
): LabelFieldObject {
  const mmToPx = (mm: number) => mm * 3.7795 * scale;
  
  const x = mmToPx(fieldConfig.position?.x || 0);
  const y = mmToPx(fieldConfig.position?.y || 0);
  const width = mmToPx(fieldConfig.size?.width || 50);
  const height = mmToPx(fieldConfig.size?.height || 20);

  // Get display text from sample data using case-insensitive lookup
  let displayText = '';
  if (fieldConfig.templateField) {
    const value = getFieldValue(fieldConfig.templateField, sampleData);
    if (value) {
      displayText = value;
      console.log('✅ Found data for', fieldConfig.templateField, ':', displayText);
    } else {
      displayText = generateSampleText(fieldConfig.templateField);
      console.log('⚠️ No data for', fieldConfig.templateField, '- using sample');
    }
  }

  // Use provided font size or default to max (24pt) and let Fabric fit it
  const initialFontSize = fieldConfig.style?.fontSize || 24;

  const textbox = new Textbox(displayText, {
    left: x,
    top: y,
    width: width,
    height: height,
    fontSize: initialFontSize,
    fontFamily: fieldConfig.style?.fontFamily || 'Arial',
    fontWeight: (fieldConfig.style?.fontWeight || 'normal') as any,
    fill: fieldConfig.style?.color || '#000000',
    textAlign: fieldConfig.style?.textAlign || 'left',
    selectable: true,
    hasControls: true,
    lockRotation: true,
    editable: false,
    borderColor: '#e5e7eb',
    cornerColor: '#3b82f6',
    cornerStyle: 'circle',
    transparentCorners: false,
    lockUniScaling: false,
    splitByGrapheme: false
  });

  // Use Fabric.js native text fitting if autoFit is enabled
  if (fieldConfig.autoFit) {
    fitTextToBox(textbox, width, height, 8);
  }

  // Add custom properties
  const fieldName = fieldConfig.templateField || 'field';
  (textbox as any).fieldName = fieldName;
  (textbox as any).fieldType = fieldConfig.fieldType || 'text';
  (textbox as any).templateField = fieldName;
  (textbox as any).dataColumn = fieldName;

  return textbox as LabelFieldObject;
}

/**
 * Create an address block (multi-line combined fields)
 */
export function createAddressBlock(
  canvas: Canvas,
  fieldConfig: Partial<FieldConfig>,
  sampleData?: Record<string, any>,
  scale: number = 1
): LabelFieldObject {
  const addressFields = fieldConfig.combinedFields || [fieldConfig.templateField || 'address'];
  
  console.log('🔍 Address block data:', {
    combinedFields: addressFields,
    sampleDataKeys: sampleData ? Object.keys(sampleData) : 'undefined',
    sampleDataValues: sampleData
  });
  
  // Build address from combined fields using case-insensitive lookup
  const addressLines: string[] = [];
  addressFields.forEach(fieldName => {
    const value = getFieldValue(fieldName, sampleData);
    if (value) {
      addressLines.push(value);
      console.log('✅ Found data for', fieldName, ':', value);
    } else {
      addressLines.push(generateSampleText(fieldName));
      console.log('⚠️ No data for', fieldName, '- using sample');
    }
  });
  
  const displayText = addressLines.join('\n');
  
  // Convert mm to pixels
  const mmToPx = (mm: number) => mm * 3.7795 * scale;
  
  const x = mmToPx(fieldConfig.position?.x || 0);
  const y = mmToPx(fieldConfig.position?.y || 0);
  const width = mmToPx(fieldConfig.size?.width || 50);
  const height = mmToPx(fieldConfig.size?.height || 20);

  // Use provided font size or default to max (24pt) for address blocks
  const initialFontSize = fieldConfig.style?.fontSize || 24;
  
  console.log('📝 Creating address block:', { 
    widthMm: fieldConfig.size?.width?.toFixed(1), 
    heightMm: fieldConfig.size?.height?.toFixed(1),
    widthPx: width.toFixed(0), 
    heightPx: height.toFixed(0), 
    initialFontSize,
    lineCount: displayText.split('\n').length 
  });

  const textbox = new Textbox(displayText, {
    left: x,
    top: y,
    width: width,
    height: height,
    fontSize: initialFontSize,
    fontFamily: fieldConfig.style?.fontFamily || 'Arial',
    fontWeight: (fieldConfig.style?.fontWeight || 'normal') as any,
    fill: fieldConfig.style?.color || '#000000',
    textAlign: 'left',
    lineHeight: 1.2,
    selectable: true,
    hasControls: true,
    lockRotation: true,
    editable: false,
    borderColor: '#e5e7eb',
    cornerColor: '#3b82f6',
    cornerStyle: 'circle',
    transparentCorners: false,
    lockUniScaling: false,
    splitByGrapheme: false
  });

  // Use Fabric.js native text fitting - address blocks always auto-fit
  fitTextToBox(textbox, width, height, 10); // min 10pt for address blocks

  // Add custom properties
  (textbox as any).fieldName = addressFields[0];
  (textbox as any).fieldType = 'address_block';
  (textbox as any).templateField = addressFields[0];
  (textbox as any).combinedFields = addressFields;

  return textbox as LabelFieldObject;
}

/**
 * Create a barcode placeholder
 */
export function createBarcodeField(
  canvas: Canvas,
  fieldConfig: Partial<FieldConfig>,
  sampleData?: Record<string, any>,
  scale: number = 1
): Group {
  const mmToPx = (mm: number) => mm * 3.7795 * scale;
  
  const x = mmToPx(fieldConfig.position?.x || 0);
  const y = mmToPx(fieldConfig.position?.y || 0);
  const width = mmToPx(fieldConfig.size?.width || 40);
  const height = mmToPx(fieldConfig.size?.height || 12);

  // Create barcode bars
  const bars: Rect[] = [];
  const barCount = 20;
  const barWidth = (width * 0.8) / barCount;
  
  for (let i = 0; i < barCount; i++) {
    bars.push(new Rect({
      left: i * barWidth,
      top: 0,
      width: i % 3 === 0 ? barWidth * 1.5 : barWidth,
      height: height * 0.6,
      fill: '#000000'
    }));
  }

  // Add text below bars
  const fieldName = fieldConfig.templateField || 'barcode';
  const displayText = sampleData?.[fieldName] || generateSampleText(fieldName);
  const text = new Text(displayText, {
    left: width / 2,
    top: height * 0.65,
    fontSize: 8,
    fontFamily: 'monospace',
    fill: '#000000',
    originX: 'center'
  });

  const group = new Group([...bars, text], {
    left: x,
    top: y,
    width: width,
    height: height,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderColor: '#e5e7eb',
    cornerColor: '#3b82f6'
  });

  return group;
}

/**
 * Convert Fabric canvas to field configs for saving
 */
export function fabricToFieldConfigs(canvas: Canvas): FieldConfig[] {
  const pxToMm = (px: number) => px / 3.7795;
  
  return canvas.getObjects().map((obj, index) => {
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
  canvas: Canvas,
  fieldName: string,
  newValue: string
): void {
  canvas.getObjects().forEach(obj => {
    const labelObj = obj as LabelFieldObject;
    if (labelObj.fieldName === fieldName && obj instanceof Textbox) {
      obj.set('text', newValue);
    }
  });
  canvas.renderAll();
}
