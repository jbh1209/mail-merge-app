// Canvas utility functions for coordinate conversion and layout calculations

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export type FieldType = 'text' | 'barcode' | 'qrcode' | 'sequence';

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
 * Auto-layout fields in a template
 * @param fieldNames - Names of fields to layout
 * @param templateSize - Template dimensions
 * @param padding - Padding in mm
 * @returns Array of field configurations
 */
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
 * Intelligent field height based on field name
 */
const getSmartFieldHeight = (fieldName: string, baseHeight: number): number => {
  const lower = fieldName.toLowerCase();
  
  // Address fields need more space
  if (lower.includes('address') || lower.includes('street')) return Math.max(baseHeight * 1.5, 15);
  
  // ID/code fields can be shorter
  if (lower.includes('id') || lower.includes('code') || lower.includes('sku')) return Math.max(baseHeight * 0.7, 6);
  
  // QR codes and barcodes need square/rectangular space
  if (lower.includes('barcode')) return Math.max(baseHeight * 0.8, 10);
  if (lower.includes('qr')) return Math.max(baseHeight, 12);
  
  return baseHeight;
};

export const autoLayoutFields = (
  fieldNames: string[],
  templateSize: Size,
  padding: number = 5,
  showLabels: boolean = false
): FieldConfig[] => {
  // Label height in mm when labels are shown
  const labelHeightMm = showLabels ? 6 : 0;
  const usableHeight = templateSize.height - (padding * 2);
  const usableWidth = templateSize.width - (padding * 2);
  
  // Determine if we should use two-column layout for wide templates
  const useTwoColumns = templateSize.width > 100 && fieldNames.length > 4;
  const columnWidth = useTwoColumns ? (usableWidth - 2) / 2 : usableWidth;
  
  let currentY = padding;
  const fields: FieldConfig[] = [];
  
  fieldNames.forEach((name, index) => {
    const column = useTwoColumns && index >= Math.ceil(fieldNames.length / 2) ? 1 : 0;
    const baseFieldHeight = Math.min(
      Math.floor(usableHeight / (useTwoColumns ? Math.ceil(fieldNames.length / 2) : fieldNames.length)) - 1,
      12
    );
    
    const fieldHeight = getSmartFieldHeight(name, baseFieldHeight);
    const fieldType = detectFieldType(name);
    
    // Reset Y for second column
    if (column === 1 && index === Math.ceil(fieldNames.length / 2)) {
      currentY = padding;
    }
    
    const fontSize = Math.min(18, Math.max(12, fieldHeight * 1.3));
    
    // Add extra space for label if showing labels
    const yPosition = currentY + (showLabels ? labelHeightMm : 0);
    
    fields.push({
      id: `field-${index}`,
      templateField: name,
      position: {
        x: padding + (column * (columnWidth + 2)),
        y: yPosition
      },
      size: {
        width: columnWidth,
        height: fieldHeight
      },
      style: {
        fontSize,
        fontFamily: 'Arial',
        fontWeight: 'normal',
        fontStyle: 'normal',
        textAlign: 'left',
        color: '#000000',
        verticalAlign: 'middle'
      },
      overflow: 'shrink', // Default to auto-fit
      autoFit: true,
      showLabel: showLabels,
      labelStyle: {
        fontSize: 6,
        color: '#666666',
        position: 'above'
      },
      fieldType,
      typeConfig: fieldType === 'sequence' ? { sequenceStart: 1, sequencePadding: 3 } : undefined
    });
    
    // Add field height plus padding, plus label space if showing labels
    currentY += fieldHeight + 1 + (showLabels ? labelHeightMm : 0);
  });
  
  return fields;
};

/**
 * Generate sample text for preview
 * @param fieldName - Field name
 * @returns Sample text
 */
export const generateSampleText = (fieldName: string): string => {
  const samples: Record<string, string> = {
    name: 'John Doe',
    first_name: 'Jane',
    last_name: 'Smith',
    company: 'Acme Corp',
    address: '123 Main Street',
    address_line_1: '123 Main Street',
    address_line_2: 'Suite 100',
    city: 'New York',
    state: 'NY',
    zip: '10001',
    country: 'USA',
    email: 'john@example.com',
    phone: '(555) 123-4567',
    title: 'Senior Manager',
    product_name: 'Premium Widget',
    sku: 'SKU-12345',
    price: '$29.99',
    date: '2024-01-15'
  };
  
  const normalized = fieldName.toLowerCase().replace(/[_\s-]/g, '_');
  return samples[normalized] || fieldName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};
