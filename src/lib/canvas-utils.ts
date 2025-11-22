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
 * Intelligent auto-layout with weighted space allocation
 * Analyzes content to give more space to longer fields, less to short fields
 */
export const autoLayoutFields = (
  fieldNames: string[],
  templateSize: Size,
  sampleData: any[] = [],
  padding: number = 5,
  showLabels: boolean = false
): FieldConfig[] => {
  if (!fieldNames || fieldNames.length === 0) return [];

  const usableWidth = templateSize.width - (padding * 2);
  const usableHeight = templateSize.height - (padding * 2);
  const MIN_FONT_SIZE = 8; // More readable minimum
  const TARGET_FONT_SIZE = 11; // Nice readable size
  const PADDING_PX = 6;

  console.log('🎨 AUTO-LAYOUT START:', { templateSize, fieldCount: fieldNames.length });

  // Step 1: Analyze content and assign weights
  const fieldAnalysis = fieldNames.map(fieldName => {
    const maxContent = sampleData.length > 0
      ? sampleData.reduce((longest, row) => {
          const value = String(row[fieldName] || '');
          return value.length > longest.length ? value : longest;
        }, '')
      : generateSampleText(fieldName);

    const sampleText = maxContent || generateSampleText(fieldName);
    const fieldType = detectFieldType(fieldName);
    const priority = getFieldPriority(fieldName);

    // Assign weight based on priority and content length
    let weight = 1.0;
    if (priority === 'high') weight = 2.5; // Addresses, descriptions get 2.5x space
    else if (priority === 'medium') weight = 1.5; // Names get 1.5x space
    else if (sampleText.length < 10) weight = 0.5; // Short fields (IDs) get 0.5x space

    return { fieldName, fieldType, priority, sampleText, weight };
  });

  // Step 2: Smart column strategy
  const useTwoColumns = fieldNames.length >= 5 && usableWidth > 100;
  const numColumns = useTwoColumns ? 2 : 1;
  const columnGap = 3;
  const columnWidth = useTwoColumns ? (usableWidth - columnGap) / 2 : usableWidth;

  // Distribute fields to columns (try to balance by weight)
  const columns: typeof fieldAnalysis[] = [[], []];
  if (useTwoColumns) {
    const totalWeight = fieldAnalysis.reduce((sum, f) => sum + f.weight, 0);
    let col1Weight = 0;
    
    fieldAnalysis.forEach(field => {
      if (col1Weight < totalWeight / 2 && columns[0].length < fieldAnalysis.length) {
        columns[0].push(field);
        col1Weight += field.weight;
      } else {
        columns[1].push(field);
      }
    });
  } else {
    columns[0] = fieldAnalysis;
  }

  // Step 3: Allocate height within each column based on weights
  const fields: FieldConfig[] = [];
  
  columns.forEach((columnFields, colIndex) => {
    if (columnFields.length === 0) return;

    const columnWeightSum = columnFields.reduce((sum, f) => sum + f.weight, 0);
    let currentY = padding;

    columnFields.forEach(field => {
      // Calculate proportional height with 15% headroom
      const proportionalHeight = (field.weight / columnWeightSum) * usableHeight;
      const heightWithHeadroom = proportionalHeight * 1.15; // Add 15% extra space
      const fieldHeightMm = Math.min(heightWithHeadroom, usableHeight * 0.4); // Cap at 40% of height

      // Calculate best-fit font size with generous container
      const containerWidthPx = mmToPx(columnWidth);
      const containerHeightPx = mmToPx(fieldHeightMm);

      const { fontSize } = calculateBestFitFontSize(
        field.sampleText,
        containerWidthPx,
        containerHeightPx,
        TARGET_FONT_SIZE,
        'Arial',
        'normal',
        MIN_FONT_SIZE,
        PADDING_PX
      );

      // Ensure we don't overflow column
      const finalHeight = Math.min(fieldHeightMm, usableHeight - (currentY - padding));

      const x = padding + (colIndex * (columnWidth + columnGap));

      fields.push({
        id: `field-${crypto.randomUUID()}`,
        templateField: field.fieldName,
        position: { x, y: currentY },
        size: { width: columnWidth, height: finalHeight },
        style: {
          fontSize,
          fontFamily: 'Arial',
          fontWeight: 'normal',
          fontStyle: 'normal',
          textAlign: 'left',
          color: '#000000',
          verticalAlign: 'top'
        },
        overflow: 'shrink',
        autoFit: true,
        showLabel: showLabels,
        labelStyle: showLabels ? { fontSize: 6, color: '#666666', position: 'above' } : undefined,
        fieldType: field.fieldType,
        typeConfig: field.fieldType === 'sequence' ? { sequenceStart: 1, sequencePadding: 3 } : undefined
      });

      currentY += finalHeight + 1.5; // Spacing between fields
    });
  });

  console.log('✅ AUTO-LAYOUT COMPLETE:', fields.map(f => ({
    name: f.templateField,
    fontSize: f.style.fontSize + 'pt',
    height: f.size.height.toFixed(1) + 'mm'
  })));

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
