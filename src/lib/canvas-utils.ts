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
 * Intelligent auto-layout fields based on actual content
 * @param fieldNames - Names of fields to layout
 * @param templateSize - Template dimensions
 * @param sampleData - Sample data rows for content analysis
 * @param padding - Padding in mm
 * @param showLabels - Show field labels
 * @returns Array of optimized field configurations
 */
export const autoLayoutFields = (
  fieldNames: string[],
  templateSize: Size,
  sampleData: any[] = [],
  padding: number = 5,
  showLabels: boolean = false
): FieldConfig[] => {
  // Step 1: Analyze content requirements from sample data
  const fieldRequirements = fieldNames.map(fieldName => {
    const fieldType = detectFieldType(fieldName);
    const priority = getFieldPriority(fieldName);
    
    // Find max content length across all sample rows
    let maxContent = generateSampleText(fieldName); // fallback
    if (sampleData && sampleData.length > 0) {
      maxContent = sampleData.reduce((longest, row) => {
        const value = String(row[fieldName] || '');
        return value.length > longest.length ? value : longest;
      }, '');
    }
    
    return {
      fieldName,
      fieldType,
      priority,
      maxContent: maxContent || generateSampleText(fieldName),
      contentLength: maxContent.length
    };
  });
  
  // Step 2: Calculate layout strategy
  const labelHeightMm = showLabels ? 6 : 0;
  const usableHeight = templateSize.height - (padding * 2);
  const usableWidth = templateSize.width - (padding * 2);
  
  // Determine column layout based on available space and field count
  const useTwoColumns = templateSize.width > 100 && fieldNames.length >= 6;
  const columnWidth = useTwoColumns ? (usableWidth - 3) / 2 : usableWidth;
  const fieldsPerColumn = useTwoColumns ? Math.ceil(fieldNames.length / 2) : fieldNames.length;
  
  // Step 3: Calculate available height per field
  const baseAvailableHeight = (usableHeight - (labelHeightMm * fieldsPerColumn)) / fieldsPerColumn;
  
  // Step 4: Intelligent field sizing based on content
  const fields: FieldConfig[] = [];
  let currentY = [padding, padding]; // Track Y for each column
  
  fieldRequirements.forEach((req, index) => {
    const column = useTwoColumns && index >= fieldsPerColumn ? 1 : 0;
    
    // Reset Y for second column
    if (column === 1 && index === fieldsPerColumn) {
      currentY[1] = padding;
    }
    
    // Start with preferred font size and calculate space needed
    let fontSize = 12;
    
    // Adjust font size based on content length and priority
    if (req.contentLength > 100) {
      fontSize = 10; // Long content gets smaller font
    } else if (req.contentLength < 20 && req.priority === 'low') {
      fontSize = 11; // Short, low-priority content
    } else if (req.priority === 'high') {
      fontSize = 13; // High priority gets larger font
    }
    
    // Estimate required height based on content and width
    const estimatedHeight = estimateRequiredHeight(
      req.maxContent,
      req.fieldType,
      columnWidth,
      fontSize
    );
    
    // Use estimated height but constrain to available space
    const fieldHeight = Math.max(
      6, // minimum height
      Math.min(
        estimatedHeight,
        baseAvailableHeight - 2 // leave 2mm spacing
      )
    );
    
    // Add label space if showing labels
    const yPosition = currentY[column] + (showLabels ? labelHeightMm : 0);
    
    fields.push({
      id: `field-${index}`,
      templateField: req.fieldName,
      position: {
        x: padding + (column * (columnWidth + 3)),
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
      overflow: 'shrink', // Enable auto-fit
      autoFit: true,
      showLabel: showLabels,
      labelStyle: {
        fontSize: 6,
        color: '#666666',
        position: 'above'
      },
      fieldType: req.fieldType,
      typeConfig: req.fieldType === 'sequence' ? { sequenceStart: 1, sequencePadding: 3 } : undefined
    });
    
    // Advance Y position for next field
    currentY[column] += fieldHeight + 1 + (showLabels ? labelHeightMm : 0);
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
