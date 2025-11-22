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
 * Intelligent auto-layout fields based on actual content with ZERO overflow
 * Uses actual text measurement to PREVENT overflow before it happens
 */
export const autoLayoutFields = (
  fieldNames: string[],
  templateSize: Size,
  sampleData: any[] = [],
  padding: number = 5,
  showLabels: boolean = false
): FieldConfig[] => {
  if (!fieldNames || fieldNames.length === 0) {
    return [];
  }

  const usableWidth = templateSize.width - (padding * 2);
  const usableHeight = templateSize.height - (padding * 2);
  const MIN_FONT_SIZE = 7; // Minimum readable font size
  const PREFERRED_FONT_SIZE = 12; // Start with this and shrink if needed
  const PADDING_PX = 6; // Padding inside fields

  console.log('🎨 AUTO-LAYOUT START:', { 
    templateSize, 
    usableWidth, 
    usableHeight, 
    fieldCount: fieldNames.length,
    hasSampleData: sampleData.length > 0
  });

  // Step 1: Analyze each field's content requirements using REAL sample data
  const fieldRequirements = fieldNames.map(fieldName => {
    // Find longest content for this field across all sample rows
    const maxContent = sampleData.length > 0
      ? sampleData.reduce((longest, row) => {
          const value = String(row[fieldName] || '');
          return value.length > longest.length ? value : longest;
        }, '')
      : generateSampleText(fieldName);

    const sampleText = maxContent || generateSampleText(fieldName);
    const fieldType = detectFieldType(fieldName);
    const priority = getFieldPriority(fieldName);

    return {
      fieldName,
      fieldType,
      priority,
      sampleText,
      contentLength: sampleText.length
    };
  });

  // Step 2: Determine layout strategy (1 or 2 columns)
  const useTwoColumns = fieldNames.length >= 4 && usableWidth > 100;
  const numColumns = useTwoColumns ? 2 : 1;
  const columnGap = 2;
  const columnWidth = useTwoColumns 
    ? (usableWidth - columnGap) / 2 
    : usableWidth;
  const fieldsPerColumn = Math.ceil(fieldNames.length / numColumns);

  console.log('📐 LAYOUT STRATEGY:', { useTwoColumns, numColumns, columnWidth, fieldsPerColumn });

  // Step 3: Calculate field dimensions using ACTUAL text measurement
  const measuredFields = fieldRequirements.map((req, index) => {
    const column = Math.floor(index / fieldsPerColumn);
    const containerWidthPx = mmToPx(columnWidth);
    
    // Start with equal height distribution
    const initialHeightMm = (usableHeight / fieldsPerColumn) - 1;
    const containerHeightPx = mmToPx(initialHeightMm);

    // Use calculateBestFitFontSize to find font that makes content fit PERFECTLY
    const { fontSize, willFit, overflowPercentage } = calculateBestFitFontSize(
      req.sampleText,
      containerWidthPx,
      containerHeightPx,
      PREFERRED_FONT_SIZE,
      'Arial',
      'normal',
      MIN_FONT_SIZE,
      PADDING_PX
    );

    // Measure actual text dimensions with the calculated font size
    const measurement = measureText(
      req.sampleText,
      'Arial',
      fontSize,
      'normal',
      containerWidthPx - (PADDING_PX * 2)
    );

    // Calculate required height in mm with padding
    const paddingMm = pxToMm(PADDING_PX * 2);
    const requiredHeightMm = pxToMm(measurement.height) + paddingMm;
    
    // Use the larger of: initial equal distribution OR actual required height
    const fieldHeightMm = Math.max(initialHeightMm, requiredHeightMm);

    if (!willFit) {
      console.warn(`⚠️ FIELD "${req.fieldName}" content may not fit perfectly`, {
        fontSize,
        overflowPercentage,
        contentLength: req.sampleText.length,
        containerHeightPx,
        requiredHeightPx: measurement.height
      });
    } else {
      console.log(`✅ FIELD "${req.fieldName}" fits perfectly`, {
        fontSize,
        height: fieldHeightMm.toFixed(1) + 'mm'
      });
    }

    return {
      ...req,
      column,
      fontSize,
      width: columnWidth,
      height: fieldHeightMm,
      willFit,
      overflowPercentage
    };
  });

  // Step 4: Optimize space allocation - shrink if total height exceeds available space
  const columnHeights = Array(numColumns).fill(0);
  measuredFields.forEach(f => {
    columnHeights[f.column] += f.height + 1;
  });

  const maxColumnHeight = Math.max(...columnHeights);
  const needsShrinking = maxColumnHeight > usableHeight;

  if (needsShrinking) {
    console.log('📏 SHRINKING FIELDS - Total height exceeds available space', {
      maxColumnHeight: maxColumnHeight.toFixed(1) + 'mm',
      usableHeight: usableHeight.toFixed(1) + 'mm'
    });
    
    const shrinkFactor = (usableHeight - fieldsPerColumn) / maxColumnHeight; // Leave 1mm per field for spacing
    
    measuredFields.forEach(f => {
      const oldHeight = f.height;
      f.height = f.height * shrinkFactor;
      
      // Recalculate font size for new height
      const newHeightPx = mmToPx(f.height);
      const newWidthPx = mmToPx(f.width);
      const { fontSize } = calculateBestFitFontSize(
        f.sampleText,
        newWidthPx,
        newHeightPx,
        PREFERRED_FONT_SIZE,
        'Arial',
        'normal',
        MIN_FONT_SIZE,
        PADDING_PX
      );
      f.fontSize = fontSize;
      
      console.log(`  Shrunk "${f.fieldName}": ${oldHeight.toFixed(1)}mm → ${f.height.toFixed(1)}mm, font: ${fontSize}pt`);
    });
  }

  // Step 5: Create final field configurations
  const fields: FieldConfig[] = [];
  const columnY: number[] = Array(numColumns).fill(padding);

  measuredFields.forEach(field => {
    const x = padding + (field.column * (columnWidth + columnGap));
    const y = columnY[field.column];

    fields.push({
      id: `field-${crypto.randomUUID()}`,
      templateField: field.fieldName,
      position: { x, y },
      size: { width: field.width, height: field.height },
      style: {
        fontSize: field.fontSize,
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
      labelStyle: showLabels ? {
        fontSize: 6,
        color: '#666666',
        position: 'above'
      } : undefined,
      fieldType: field.fieldType,
      typeConfig: field.fieldType === 'sequence' ? { sequenceStart: 1, sequencePadding: 3 } : undefined
    });

    columnY[field.column] += field.height + 1;
  });

  console.log('✅ AUTO-LAYOUT COMPLETE:', { 
    totalFields: fields.length,
    finalHeights: columnY.map((y, i) => `Column ${i + 1}: ${(y - padding).toFixed(1)}mm`),
    fields: fields.map(f => ({
      name: f.templateField,
      fontSize: f.style.fontSize,
      height: f.size.height.toFixed(1) + 'mm'
    }))
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
