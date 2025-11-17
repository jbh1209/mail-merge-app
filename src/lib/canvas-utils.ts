// Canvas utility functions for coordinate conversion and layout calculations

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

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
  maxFontSize: number = 12
): number => {
  // Rough estimation: 1pt ≈ 0.35mm width per character
  const charWidth = 0.35;
  const estimatedWidth = text.length * charWidth * maxFontSize;
  
  if (estimatedWidth <= bounds.width) {
    return maxFontSize;
  }
  
  return Math.max(6, Math.floor((bounds.width / text.length) / charWidth));
};

/**
 * Auto-layout fields in a template
 * @param fieldNames - Names of fields to layout
 * @param templateSize - Template dimensions
 * @param padding - Padding in mm
 * @returns Array of field configurations
 */
export const autoLayoutFields = (
  fieldNames: string[],
  templateSize: Size,
  padding: number = 2
): FieldConfig[] => {
  const usableHeight = templateSize.height - (padding * 2);
  const fieldHeight = Math.min(
    Math.floor(usableHeight / fieldNames.length) - 1,
    8
  );
  
  return fieldNames.map((name, index) => ({
    id: `field-${index}`,
    templateField: name,
    position: {
      x: padding,
      y: padding + (index * (fieldHeight + 1))
    },
    size: {
      width: templateSize.width - (padding * 2),
      height: fieldHeight
    },
    style: {
      fontSize: Math.min(10, fieldHeight * 1.2),
      fontFamily: 'Arial',
      fontWeight: 'normal',
      fontStyle: 'normal',
      textAlign: 'left',
      color: '#000000',
      verticalAlign: 'middle'
    },
    overflow: 'truncate'
  }));
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
