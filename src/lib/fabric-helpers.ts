// Fabric.js helper functions for label field creation and text sizing
import { Canvas, Textbox, Group, Rect, Text, FabricObject } from 'fabric';
import { FieldConfig, FieldType, generateSampleText } from './canvas-utils';

// Custom properties for label fields
export interface LabelFieldObject extends Textbox {
  fieldName: string;
  fieldType: FieldType;
  dataColumn?: string;
  combinedFields?: string[];
  templateField: string;
}

/**
 * Binary search to find optimal font size that fits both width and height
 */
export function autoFitFontSize(
  text: string,
  maxWidth: number,
  maxHeight: number,
  minSize: number = 6,
  maxSize: number = 24,
  fontFamily: string = 'Arial',
  fontWeight: string = 'normal'
): number {
  let low = minSize;
  let high = maxSize;
  let bestFit = minSize;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    
    // Create temporary textbox to measure
    const testBox = new Textbox(text, {
      fontSize: mid,
      fontFamily,
      fontWeight: fontWeight as any,
      width: maxWidth,
      splitByGrapheme: false
    });

    const textHeight = testBox.calcTextHeight();
    const textWidth = testBox.width || 0;

    if (textHeight <= maxHeight && textWidth <= maxWidth) {
      bestFit = mid;
      low = mid + 1; // Try larger
    } else {
      high = mid - 1; // Try smaller
    }
  }

  return bestFit;
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
  const fieldName = fieldConfig.templateField || 'field';
  const displayText = sampleData?.[fieldName] || generateSampleText(fieldName);
  
  // Convert mm to pixels (96 DPI: 1mm ≈ 3.7795px)
  const mmToPx = (mm: number) => mm * 3.7795 * scale;
  
  const x = mmToPx(fieldConfig.position?.x || 0);
  const y = mmToPx(fieldConfig.position?.y || 0);
  const width = mmToPx(fieldConfig.size?.width || 50);
  const height = mmToPx(fieldConfig.size?.height || 10);

  // Auto-fit font size if enabled
  let fontSize = fieldConfig.style?.fontSize || 12;
  if (fieldConfig.autoFit) {
    fontSize = autoFitFontSize(
      displayText,
      width - 8, // padding
      height - 4,
      6,
      fieldConfig.style?.fontSize || 18,
      fieldConfig.style?.fontFamily || 'Arial',
      fieldConfig.style?.fontWeight || 'normal'
    );
  }

  const textbox = new Textbox(displayText, {
    left: x,
    top: y,
    width: width,
    height: height,
    fontSize: fontSize,
    fontFamily: fieldConfig.style?.fontFamily || 'Arial',
    fontWeight: (fieldConfig.style?.fontWeight || 'normal') as any,
    fill: fieldConfig.style?.color || '#000000',
    textAlign: fieldConfig.style?.textAlign || 'left',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    padding: 4,
    borderColor: '#e5e7eb',
    cornerColor: '#3b82f6',
    cornerStyle: 'circle',
    transparentCorners: false,
    lockUniScaling: false,
    splitByGrapheme: false
  });

  // Add custom properties
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
  const addressLines = addressFields
    .map(f => sampleData?.[f] || generateSampleText(f))
    .filter(line => line && String(line).trim() !== '');
  
  const displayText = addressLines.join('\n');
  
  // Convert mm to pixels
  const mmToPx = (mm: number) => mm * 3.7795 * scale;
  
  const x = mmToPx(fieldConfig.position?.x || 0);
  const y = mmToPx(fieldConfig.position?.y || 0);
  const width = mmToPx(fieldConfig.size?.width || 50);
  const height = mmToPx(fieldConfig.size?.height || 20);

  // Auto-fit font size for address blocks
  const fontSize = autoFitFontSize(
    displayText,
    width - 8,
    height - 4,
    8, // min 8pt for addresses
    fieldConfig.style?.fontSize || 14,
    fieldConfig.style?.fontFamily || 'Arial',
    fieldConfig.style?.fontWeight || 'normal'
  );

  const textbox = new Textbox(displayText, {
    left: x,
    top: y,
    width: width,
    height: height,
    fontSize: fontSize,
    fontFamily: fieldConfig.style?.fontFamily || 'Arial',
    fontWeight: (fieldConfig.style?.fontWeight || 'normal') as any,
    fill: fieldConfig.style?.color || '#000000',
    textAlign: 'left',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    padding: 4,
    lineHeight: 1.3,
    borderColor: '#e5e7eb',
    cornerColor: '#3b82f6',
    cornerStyle: 'circle',
    transparentCorners: false,
    lockUniScaling: false,
    splitByGrapheme: false
  });

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
