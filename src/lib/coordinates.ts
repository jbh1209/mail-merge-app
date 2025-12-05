/**
 * SINGLE SOURCE OF TRUTH for all coordinate conversions
 * Used by: Canvas (Fabric.js), PDF Generation (pdf-lib), Layout Engine
 * 
 * All positions are stored in MILLIMETERS with TOP-LEFT origin
 * Canvas displays at 96 DPI (pixels)
 * PDF renders at 72 DPI (points)
 */

// Physical constants
const MM_PER_INCH = 25.4;
const CANVAS_DPI = 96;
const PDF_DPI = 72;

// Derived constants - calculated once, exported for direct use
export const PX_PER_MM = CANVAS_DPI / MM_PER_INCH;  // 3.7795275591
export const PT_PER_MM = PDF_DPI / MM_PER_INCH;     // 2.8346456693
export const PT_PER_PX = PDF_DPI / CANVAS_DPI;     // 0.75
export const PX_PER_PT = CANVAS_DPI / PDF_DPI;     // 1.333...

/**
 * Coordinate conversion utilities
 */
export const Coordinates = {
  // Constants (for direct access)
  DPI: CANVAS_DPI,
  PDF_DPI: PDF_DPI,
  MM_PER_INCH,
  PX_PER_MM,
  PT_PER_MM,
  PT_PER_PX,
  PX_PER_PT,

  // ==========================================
  // CANVAS CONVERSIONS (mm ↔ px)
  // ==========================================
  
  /**
   * Convert millimeters to canvas pixels
   * @param mm - Value in millimeters
   * @param scale - Optional display scale factor (for zoom)
   */
  mmToPx: (mm: number, scale: number = 1): number => {
    return mm * PX_PER_MM * scale;
  },

  /**
   * Convert canvas pixels to millimeters
   * @param px - Value in pixels
   * @param scale - Optional display scale factor (for zoom)
   */
  pxToMm: (px: number, scale: number = 1): number => {
    return px / (PX_PER_MM * scale);
  },

  // ==========================================
  // PDF CONVERSIONS (mm ↔ pt)
  // ==========================================
  
  /**
   * Convert millimeters to PDF points
   * @param mm - Value in millimeters
   */
  mmToPt: (mm: number): number => {
    return mm * PT_PER_MM;
  },

  /**
   * Convert PDF points to millimeters
   * @param pt - Value in points
   */
  ptToMm: (pt: number): number => {
    return pt / PT_PER_MM;
  },

  // ==========================================
  // FONT SIZE CONVERSIONS (pt ↔ px)
  // ==========================================
  
  /**
   * Convert font points to pixels (for canvas display)
   * @param pt - Font size in points
   */
  ptToPx: (pt: number): number => {
    return pt * PX_PER_PT;
  },

  /**
   * Convert font pixels to points (for PDF/storage)
   * @param px - Font size in pixels
   */
  pxToPt: (px: number): number => {
    return px * PT_PER_PX;
  },

  // ==========================================
  // FIELD CONFIG HELPERS (for Fabric.js)
  // ==========================================
  
  /**
   * Convert FieldConfig position/size from mm to px
   * @param config - Object with position {x, y} and size {width, height} in mm
   * @param scale - Optional display scale factor
   */
  fieldConfigToPx: (
    config: { position: { x: number; y: number }; size: { width: number; height: number } },
    scale: number = 1
  ): { position: { x: number; y: number }; size: { width: number; height: number } } => {
    return {
      position: {
        x: config.position.x * PX_PER_MM * scale,
        y: config.position.y * PX_PER_MM * scale,
      },
      size: {
        width: config.size.width * PX_PER_MM * scale,
        height: config.size.height * PX_PER_MM * scale,
      },
    };
  },

  /**
   * Convert template dimensions from mm to px
   * @param size - Object with width and height in mm
   * @param scale - Optional display scale factor
   */
  templateSizeToPx: (
    size: { width: number; height: number },
    scale: number = 1
  ): { width: number; height: number } => {
    return {
      width: size.width * PX_PER_MM * scale,
      height: size.height * PX_PER_MM * scale,
    };
  },
};

// Default export for convenience
export default Coordinates;
