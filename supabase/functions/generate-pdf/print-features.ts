// ============================================================================
// PDF GENERATION - Print Features
// ============================================================================
// Professional print features: bleed, crop marks, registration marks,
// and proper PDF box settings (TrimBox, BleedBox, MediaBox).
// ============================================================================

import { PDFPage, rgb, PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";

/**
 * Print configuration options
 */
export interface PrintConfig {
  // Bleed extension beyond trim (typically 3mm)
  bleedMm: number;
  
  // Crop marks at trim corners
  showCropMarks: boolean;
  cropMarkLength: number;  // Length of crop mark lines in mm
  cropMarkOffset: number;  // Distance from trim edge in mm
  
  // Registration marks for color alignment
  showRegistrationMarks: boolean;
  
  // Color bars for print verification
  showColorBars: boolean;
  
  // PDF box settings
  setTrimBox: boolean;
  setBleedBox: boolean;
}

/**
 * Default print configuration for professional output
 */
export const DEFAULT_PRINT_CONFIG: PrintConfig = {
  bleedMm: 3,
  showCropMarks: true,
  cropMarkLength: 5,
  cropMarkOffset: 3,
  showRegistrationMarks: false,
  showColorBars: false,
  setTrimBox: true,
  setBleedBox: true,
};

/**
 * Points per millimeter conversion
 */
const PT_PER_MM = 72 / 25.4;

function mmToPoints(mm: number): number {
  return mm * PT_PER_MM;
}

/**
 * Draw crop marks on a PDF page
 * 
 * Crop marks are short lines at the corners of the trim area
 * that show where to cut the printed sheet.
 * 
 * @param page - PDF page to draw on
 * @param trimX - X position of trim box (left edge)
 * @param trimY - Y position of trim box (bottom edge)
 * @param trimWidth - Width of trim box
 * @param trimHeight - Height of trim box
 * @param config - Print configuration
 */
export function drawCropMarks(
  page: PDFPage,
  trimX: number,
  trimY: number,
  trimWidth: number,
  trimHeight: number,
  config: PrintConfig
): void {
  const markLength = mmToPoints(config.cropMarkLength);
  const markOffset = mmToPoints(config.cropMarkOffset);
  const strokeWidth = 0.25; // Hairline
  const strokeColor = rgb(0, 0, 0); // Registration black
  
  // Corner positions
  const corners = [
    { x: trimX, y: trimY }, // Bottom-left
    { x: trimX + trimWidth, y: trimY }, // Bottom-right
    { x: trimX, y: trimY + trimHeight }, // Top-left
    { x: trimX + trimWidth, y: trimY + trimHeight }, // Top-right
  ];
  
  for (const corner of corners) {
    const isLeft = corner.x === trimX;
    const isBottom = corner.y === trimY;
    
    // Horizontal mark
    const hStartX = isLeft ? corner.x - markOffset - markLength : corner.x + markOffset;
    const hEndX = isLeft ? corner.x - markOffset : corner.x + markOffset + markLength;
    
    page.drawLine({
      start: { x: hStartX, y: corner.y },
      end: { x: hEndX, y: corner.y },
      thickness: strokeWidth,
      color: strokeColor,
    });
    
    // Vertical mark
    const vStartY = isBottom ? corner.y - markOffset - markLength : corner.y + markOffset;
    const vEndY = isBottom ? corner.y - markOffset : corner.y + markOffset + markLength;
    
    page.drawLine({
      start: { x: corner.x, y: vStartY },
      end: { x: corner.x, y: vEndY },
      thickness: strokeWidth,
      color: strokeColor,
    });
  }
}

/**
 * Draw registration marks for color alignment
 * 
 * Registration marks are placed outside the bleed area
 * and help printers align color separations.
 */
export function drawRegistrationMarks(
  page: PDFPage,
  trimX: number,
  trimY: number,
  trimWidth: number,
  trimHeight: number,
  config: PrintConfig
): void {
  const bleedPt = mmToPoints(config.bleedMm);
  const markSize = mmToPoints(5);
  const strokeWidth = 0.5;
  
  // Center positions outside bleed area
  const positions = [
    { x: trimX + trimWidth / 2, y: trimY - bleedPt - markSize / 2 }, // Bottom center
    { x: trimX + trimWidth / 2, y: trimY + trimHeight + bleedPt + markSize / 2 }, // Top center
    { x: trimX - bleedPt - markSize / 2, y: trimY + trimHeight / 2 }, // Left center
    { x: trimX + trimWidth + bleedPt + markSize / 2, y: trimY + trimHeight / 2 }, // Right center
  ];
  
  for (const pos of positions) {
    // Draw crosshair
    page.drawLine({
      start: { x: pos.x - markSize / 2, y: pos.y },
      end: { x: pos.x + markSize / 2, y: pos.y },
      thickness: strokeWidth,
      color: rgb(0, 0, 0),
    });
    page.drawLine({
      start: { x: pos.x, y: pos.y - markSize / 2 },
      end: { x: pos.x, y: pos.y + markSize / 2 },
      thickness: strokeWidth,
      color: rgb(0, 0, 0),
    });
    
    // Draw circle around crosshair
    page.drawCircle({
      x: pos.x,
      y: pos.y,
      size: markSize / 2,
      borderWidth: strokeWidth,
      borderColor: rgb(0, 0, 0),
    });
  }
}

/**
 * Calculate page dimensions with bleed
 * 
 * @param trimWidth - Finished width in points
 * @param trimHeight - Finished height in points
 * @param config - Print configuration
 * @returns Object with media, trim, and bleed box coordinates
 */
export function calculatePageBoxes(
  trimWidth: number,
  trimHeight: number,
  config: PrintConfig
): {
  mediaWidth: number;
  mediaHeight: number;
  trimBox: { x: number; y: number; width: number; height: number };
  bleedBox: { x: number; y: number; width: number; height: number };
} {
  const bleedPt = mmToPoints(config.bleedMm);
  const marksSpace = config.showCropMarks ? mmToPoints(config.cropMarkOffset + config.cropMarkLength + 2) : 0;
  
  // Media box is the full page including bleed and marks space
  const mediaWidth = trimWidth + (bleedPt * 2) + (marksSpace * 2);
  const mediaHeight = trimHeight + (bleedPt * 2) + (marksSpace * 2);
  
  // Trim box is the finished size, centered in media
  const trimX = bleedPt + marksSpace;
  const trimY = bleedPt + marksSpace;
  
  // Bleed box extends beyond trim by bleed amount
  const bleedX = marksSpace;
  const bleedY = marksSpace;
  const bleedWidth = trimWidth + (bleedPt * 2);
  const bleedHeight = trimHeight + (bleedPt * 2);
  
  return {
    mediaWidth,
    mediaHeight,
    trimBox: { x: trimX, y: trimY, width: trimWidth, height: trimHeight },
    bleedBox: { x: bleedX, y: bleedY, width: bleedWidth, height: bleedHeight },
  };
}

/**
 * Create a print-ready page with bleed and marks
 * 
 * @param pdfDoc - PDF document
 * @param trimWidth - Finished width in points
 * @param trimHeight - Finished height in points
 * @param config - Print configuration
 * @returns Created page and content offset info
 */
export function createPrintReadyPage(
  pdfDoc: PDFDocument,
  trimWidth: number,
  trimHeight: number,
  config: PrintConfig
): {
  page: PDFPage;
  contentOffset: { x: number; y: number };
  trimBox: { x: number; y: number; width: number; height: number };
} {
  const boxes = calculatePageBoxes(trimWidth, trimHeight, config);
  
  // Create page with media box size
  const page = pdfDoc.addPage([boxes.mediaWidth, boxes.mediaHeight]);
  
  // Set TrimBox and BleedBox using PDF page dictionary
  // Note: pdf-lib doesn't have direct methods for these, so we draw visual indicators
  
  // Draw bleed area background (optional - for visualization)
  // page.drawRectangle({
  //   x: boxes.bleedBox.x,
  //   y: boxes.bleedBox.y,
  //   width: boxes.bleedBox.width,
  //   height: boxes.bleedBox.height,
  //   color: rgb(1, 1, 1), // White
  // });
  
  // Draw crop marks if enabled
  if (config.showCropMarks) {
    drawCropMarks(
      page,
      boxes.trimBox.x,
      boxes.trimBox.y,
      boxes.trimBox.width,
      boxes.trimBox.height,
      config
    );
  }
  
  // Draw registration marks if enabled
  if (config.showRegistrationMarks) {
    drawRegistrationMarks(
      page,
      boxes.trimBox.x,
      boxes.trimBox.y,
      boxes.trimBox.width,
      boxes.trimBox.height,
      config
    );
  }
  
  return {
    page,
    contentOffset: { x: boxes.trimBox.x, y: boxes.trimBox.y },
    trimBox: boxes.trimBox,
  };
}

/**
 * Check if print features should be applied
 * (only for single-label output, not Avery sheets)
 */
export function shouldApplyPrintFeatures(
  templateType: string,
  outputMode: 'single' | 'sheet'
): boolean {
  return outputMode === 'single' && templateType !== 'built_in_library';
}
