import { FieldConfig, FieldType } from './canvas-utils';

/**
 * Minimum recommended sizes in mm for scannable elements
 * Based on industry standards for reliable scanning
 */
export const MINIMUM_SIZES = {
  barcode: {
    CODE128: { width: 30, height: 21 },
    CODE39: { width: 30, height: 21 },
    EAN13: { width: 37.29, height: 25.93 }, // Standard EAN-13 size
    UPCA: { width: 37.29, height: 25.93 }, // Same as EAN-13
    default: { width: 30, height: 21 }
  },
  qrcode: { width: 20, height: 20 },
  sequence: { width: 10, height: 8 } // Minimum for readable text
};

/**
 * Optimal recommended sizes for best scanning reliability
 */
export const RECOMMENDED_SIZES = {
  barcode: {
    CODE128: { width: 40, height: 30 },
    CODE39: { width: 40, height: 30 },
    EAN13: { width: 45, height: 30 },
    UPCA: { width: 45, height: 30 },
    default: { width: 40, height: 30 }
  },
  qrcode: { width: 25, height: 25 },
  sequence: { width: 20, height: 10 }
};

export interface ValidationResult {
  isValid: boolean;
  isBelowMinimum: boolean;
  isBelowRecommended: boolean;
  message?: string;
  severity: 'none' | 'warning' | 'error';
  details?: {
    currentSize: { width: number; height: number };
    minimumSize: { width: number; height: number };
    recommendedSize: { width: number; height: number };
  };
}

/**
 * Get minimum size requirements for a field type
 */
export function getMinimumSize(fieldType: FieldType, format?: string): { width: number; height: number } {
  switch (fieldType) {
    case 'barcode':
      if (format && format in MINIMUM_SIZES.barcode) {
        return MINIMUM_SIZES.barcode[format as keyof typeof MINIMUM_SIZES.barcode];
      }
      return MINIMUM_SIZES.barcode.default;
    case 'qrcode':
      return MINIMUM_SIZES.qrcode;
    case 'sequence':
      return MINIMUM_SIZES.sequence;
    default:
      return { width: 0, height: 0 }; // No minimum for text fields
  }
}

/**
 * Get recommended size for optimal scanning
 */
export function getRecommendedSize(fieldType: FieldType, format?: string): { width: number; height: number } {
  switch (fieldType) {
    case 'barcode':
      if (format && format in RECOMMENDED_SIZES.barcode) {
        return RECOMMENDED_SIZES.barcode[format as keyof typeof RECOMMENDED_SIZES.barcode];
      }
      return RECOMMENDED_SIZES.barcode.default;
    case 'qrcode':
      return RECOMMENDED_SIZES.qrcode;
    case 'sequence':
      return RECOMMENDED_SIZES.sequence;
    default:
      return { width: 0, height: 0 };
  }
}

/**
 * Validate field size against minimum requirements
 */
export function validateFieldSize(field: FieldConfig): ValidationResult {
  const { fieldType, size, typeConfig } = field;
  
  // Only validate barcode, qrcode, and sequence fields
  if (!['barcode', 'qrcode', 'sequence'].includes(fieldType)) {
    return {
      isValid: true,
      isBelowMinimum: false,
      isBelowRecommended: false,
      severity: 'none'
    };
  }

  const format = typeConfig?.barcodeFormat;
  const minimumSize = getMinimumSize(fieldType, format);
  const recommendedSize = getRecommendedSize(fieldType, format);

  const isBelowMinimum = size.width < minimumSize.width || size.height < minimumSize.height;
  const isBelowRecommended = size.width < recommendedSize.width || size.height < recommendedSize.height;

  let message = '';
  let severity: 'none' | 'warning' | 'error' = 'none';

  if (isBelowMinimum) {
    severity = 'error';
    const elementName = getFieldTypeName(fieldType, format);
    const widthIssue = size.width < minimumSize.width;
    const heightIssue = size.height < minimumSize.height;
    
    let issueDescription = '';
    if (widthIssue && heightIssue) {
      issueDescription = `Both dimensions too small. Current: ${size.width.toFixed(1)}×${size.height.toFixed(1)}mm, Minimum: ${minimumSize.width}×${minimumSize.height}mm`;
    } else if (widthIssue) {
      issueDescription = `Width too narrow: ${size.width.toFixed(1)}mm (minimum: ${minimumSize.width}mm)`;
    } else {
      issueDescription = `Height too short: ${size.height.toFixed(1)}mm (minimum: ${minimumSize.height}mm)`;
    }
    
    message = `⚠️ ${elementName}: ${issueDescription}`;
  } else if (isBelowRecommended) {
    severity = 'warning';
    const elementName = getFieldTypeName(fieldType, format);
    message = `⚡ ${elementName} may be difficult to scan. Recommended: ${recommendedSize.width}×${recommendedSize.height}mm, Current: ${size.width.toFixed(1)}×${size.height.toFixed(1)}mm`;
  }

  return {
    isValid: !isBelowMinimum,
    isBelowMinimum,
    isBelowRecommended,
    message,
    severity,
    details: {
      currentSize: size,
      minimumSize,
      recommendedSize
    }
  };
}

/**
 * Get user-friendly name for field type
 */
function getFieldTypeName(fieldType: FieldType, format?: string): string {
  switch (fieldType) {
    case 'barcode':
      return format ? `${format} barcode` : 'Barcode';
    case 'qrcode':
      return 'QR code';
    case 'sequence':
      return 'Sequential number';
    default:
      return 'Field';
  }
}

/**
 * Check if any fields in the design are below minimum size
 */
export function validateDesign(fields: FieldConfig[]): {
  hasErrors: boolean;
  hasWarnings: boolean;
  errors: ValidationResult[];
  warnings: ValidationResult[];
} {
  const errors: ValidationResult[] = [];
  const warnings: ValidationResult[] = [];

  fields.forEach(field => {
    const result = validateFieldSize(field);
    if (result.severity === 'error') {
      errors.push(result);
    } else if (result.severity === 'warning') {
      warnings.push(result);
    }
  });

  return {
    hasErrors: errors.length > 0,
    hasWarnings: warnings.length > 0,
    errors,
    warnings
  };
}

/**
 * Get appropriate border color based on validation result
 */
export function getValidationBorderColor(result: ValidationResult): string | undefined {
  switch (result.severity) {
    case 'error':
      return '#ef4444'; // red-500
    case 'warning':
      return '#f59e0b'; // amber-500
    default:
      return undefined;
  }
}
