/**
 * Professional print settings for certificates, cards, badges (not labels)
 * Bleed and crop marks for commercial printing workflows
 */
export interface PrintSettings {
  /** Enable bleed and crop marks for professional printing */
  enablePrintMarks: boolean;
  /** Bleed in mm (3mm metric / 3.175mm = 1/8" imperial) */
  bleedMm: number;
  /** Crop mark offset in mm (3mm metric / 3.175mm = 1/8" imperial) */
  cropMarkOffsetMm: number;
  /** Region for display purposes */
  region: 'US' | 'EU';
}

/** 1/8 inch in mm (standard imperial bleed) */
const EIGHTH_INCH_MM = 25.4 / 8; // 3.175mm

/**
 * Get default print settings based on region
 * @param isUS - Whether to use US imperial measurements
 */
export function getDefaultPrintSettings(isUS: boolean): PrintSettings {
  return {
    enablePrintMarks: false,
    bleedMm: isUS ? EIGHTH_INCH_MM : 3,
    cropMarkOffsetMm: isUS ? EIGHTH_INCH_MM : 3,
    region: isUS ? 'US' : 'EU',
  };
}

/**
 * Format bleed dimension for display
 */
export function formatBleedDimension(bleedMm: number, isUS: boolean): string {
  if (isUS) {
    return '1/8"';
  }
  return `${bleedMm}mm`;
}
