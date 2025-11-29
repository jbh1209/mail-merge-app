/**
 * Single source of truth for label coordinate system
 * ALL coordinates stored as TOP-LEFT in MILLIMETERS
 * Conversion happens ONLY at render time
 */

export const LabelCoordinates = {
  // Standard constants
  DPI: 96,
  PX_PER_MM: 3.7795275591, // 96 DPI conversion
  PT_PER_MM: 2.8346456693, // For PDF (72pt/inch ÷ 25.4mm/inch)
  
  /**
   * Convert millimeters to canvas pixels for Fabric.js display
   */
  toCanvasPx: (mm: number, scale: number = 1): number => {
    return mm * 3.7795275591 * scale;
  },
  
  /**
   * Convert canvas pixels back to millimeters for storage
   */
  fromCanvasPx: (px: number, scale: number = 1): number => {
    return px / (3.7795275591 * scale);
  },
  
  /**
   * Convert millimeters to PDF points for pdf-lib
   */
  toPdfPt: (mm: number): number => {
    return (mm / 25.4) * 72;
  },
  
  /**
   * Convert PDF points back to millimeters
   */
  fromPdfPt: (pt: number): number => {
    return (pt / 72) * 25.4;
  }
};
