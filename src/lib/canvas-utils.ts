// Canvas utility functions for coordinate conversion and layout calculations
import { calculateBestFitFontSize, measureText } from './text-measurement-utils';

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export type FieldType = 'text' | 'barcode' | 'qrcode' | 'sequence' | 'address_block';

export interface FieldConfig {
  id: string;
  templateField: string;
  position: Point; // in mm
  size: Size; // in mm
  style: {
    fontSize: number; // in pt
    fontFamily: string;
    fontWeight: 'normal' | 'bold';
    fontStyle: 'normal' | 'italic';
    textAlign: 'left' | 'center' | 'right';
    color: string;
    verticalAlign: 'top' | 'middle' | 'bottom';
  };
  maxLines?: number;
  overflow: 'truncate' | 'wrap' | 'shrink';
  autoFit?: boolean; // Enable auto-sizing for best fit
  autoFitApplied?: boolean; // Track if autoFit has already been applied
  userOverrideFontSize?: number; // Explicitly set font size by user (overrides autoFit)
  showLabel?: boolean;
  labelStyle?: {
    fontSize: number;
    color: string;
    position: 'above' | 'inline';
  };
  fieldType: FieldType;
  typeConfig?: {
    // For barcode
    barcodeFormat?: 'CODE128' | 'CODE39' | 'EAN13' | 'UPC';
    // For QR code
    qrErrorCorrection?: 'L' | 'M' | 'Q' | 'H';
    // For sequence
    sequenceStart?: number;
    sequencePrefix?: string;
    sequencePadding?: number;
  };
  combinedFields?: string[]; // For address_block type - contains all field names to render
}

/**
 * Convert millimeters to pixels for canvas display
 * @param mm - Value in millimeters
 * @param scale - Display scale factor
 * @returns Value in pixels
 */
export const mmToPx = (mm: number, scale: number = 1): number => {
  // 1mm ≈ 3.7795px at 96 DPI
  return mm * 3.7795 * scale;
};

/**
 * Convert pixels to millimeters
 * @param px - Value in pixels
 * @param scale - Display scale factor
 * @returns Value in millimeters
 */
export const pxToMm = (px: number, scale: number = 1): number => {
  return px / (3.7795 * scale);
};

/**
 * Snap coordinate to grid
 * @param value - Value to snap
 * @param gridSize - Grid size in mm
 * @param scale - Display scale factor
 * @returns Snapped value in mm
 */
export const snapToGrid = (value: number, gridSize: number = 1, scale: number = 1): number => {
  const pxGridSize = mmToPx(gridSize, scale);
  const pxValue = mmToPx(value, scale);
  const snapped = Math.round(pxValue / pxGridSize) * pxGridSize;
  return pxToMm(snapped, scale);
};

/**
 * Constrain point within bounds
 * @param point - Point to constrain
 * @param bounds - Bounding rectangle
 * @returns Constrained point
 */
export const constrainToBounds = (
  point: Point,
  itemSize: Size,
  bounds: Size
): Point => {
  return {
    x: Math.max(0, Math.min(point.x, bounds.width - itemSize.width)),
    y: Math.max(0, Math.min(point.y, bounds.height - itemSize.height))
  };
};

/**
 * Calculate optimal font size to fit text in bounds
 * @param text - Text to fit
 * @param bounds - Available space
 * @param maxFontSize - Maximum font size
 * @returns Optimal font size in pt
 */
export const calculateOptimalFontSize = (
  text: string,
  bounds: Size,
  maxFontSize: number = 18
): number => {
  // Rough estimation: 1pt ≈ 0.35mm width per character
  const charWidth = 0.35;
  const estimatedWidth = text.length * charWidth * maxFontSize;
  
  if (estimatedWidth <= bounds.width) {
    return maxFontSize;
  }
  
  return Math.max(8, Math.floor((bounds.width / text.length) / charWidth));
};

/**
 * Check if a field type supports text formatting controls
 */
export const isTextBasedFieldType = (fieldType: FieldType): boolean => {
  return fieldType === 'text' || fieldType === 'address_block';
};

/**
 * Detect field type from field name
 */
const detectFieldType = (fieldName: string): FieldType => {
  const lower = fieldName.toLowerCase();
  if (lower.includes('barcode') || lower.includes('sku') || lower.includes('upc')) return 'barcode';
  if (lower.includes('qr') || lower.includes('url') || lower.includes('link')) return 'qrcode';
  if (lower.includes('number') || lower.includes('sequence') || lower.includes('#')) return 'sequence';
  return 'text';
};

/**
 * Get field priority for space allocation
 */
const getFieldPriority = (fieldName: string): 'high' | 'medium' | 'low' => {
  const lower = fieldName.toLowerCase();
  if (lower.includes('address') || lower.includes('description') || lower.includes('notes')) return 'high';
  if (lower.includes('name') || lower.includes('title') || lower.includes('company')) return 'medium';
  return 'low'; // IDs, codes, short fields
};

/**
 * Estimate required width for text content
 */
const estimateRequiredWidth = (text: string, fontSize: number = 12): number => {
  // Rough estimation: ~0.6 times fontSize per character in mm
  const charWidthMm = fontSize * 0.6 * 0.35; // 0.35mm per pt at standard density
  return Math.max(20, Math.min(text.length * charWidthMm, 150));
};

/**
 * Estimate required height for text content
 */
const estimateRequiredHeight = (text: string, fieldType: FieldType, width: number, fontSize: number = 12): number => {
  if (fieldType !== 'text') {
    if (fieldType === 'barcode') return 12;
    if (fieldType === 'qrcode') return 15;
    return 8;
  }
  
  // Calculate how many lines needed
  const charWidthMm = fontSize * 0.6 * 0.35;
  const charsPerLine = Math.floor(width / charWidthMm);
  const lines = Math.ceil(text.length / Math.max(charsPerLine, 1));
  const lineHeightMm = fontSize * 0.5; // ~0.5mm per pt
  
  return Math.max(8, Math.min(lines * lineHeightMm + 4, 40));
};

/**
 * Simple fallback grid layout when AI is unavailable.
 * Creates a basic vertical stack of fields with uniform sizing.
 */
export const autoLayoutFieldsSimple = (
  fieldNames: string[],
  templateSize: Size,
  padding: number = 6,
  showLabels: boolean = false
): FieldConfig[] => {
  if (!fieldNames || fieldNames.length === 0) return [];

  const usableWidth = templateSize.width - 2 * padding;
  const usableHeight = templateSize.height - 2 * padding;
  const fieldCount = fieldNames.length;
  const fieldHeight = (usableHeight - (fieldCount - 1) * 2) / fieldCount; // 2mm spacing
  
  return fieldNames.map((name, index) => ({
    id: `field-${crypto.randomUUID()}`,
    templateField: name,
    position: { x: padding, y: padding + index * (fieldHeight + 2) },
    size: { width: usableWidth, height: fieldHeight },
    style: {
      fontSize: 10,
      fontFamily: 'Arial',
      fontWeight: 'normal',
      fontStyle: 'normal',
      textAlign: 'left' as const,
      color: '#000000',
      verticalAlign: 'top' as const
    },
    overflow: 'shrink' as const,
    autoFit: true,
    showLabel: showLabels,
    labelStyle: showLabels ? { fontSize: 6, color: '#666666', position: 'above' as const } : undefined,
    fieldType: detectFieldType(name),
    typeConfig: undefined
  }));
};

