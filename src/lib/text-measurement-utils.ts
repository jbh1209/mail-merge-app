// Text measurement utilities for dynamic font sizing and overflow detection

export interface TextMeasurement {
  width: number;
  height: number;
  lineCount: number;
}

export interface FitResult {
  fontSize: number;
  willFit: boolean;
  overflowPercentage: number;
}

/**
 * Measure rendered text dimensions using Canvas API
 */
export function measureText(
  text: string,
  fontFamily: string,
  fontSize: number,
  fontWeight: string = 'normal',
  maxWidth?: number
): TextMeasurement {
  // Create temporary canvas for measurement
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  if (!ctx) {
    return { width: 0, height: 0, lineCount: 0 };
  }

  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  
  if (!maxWidth) {
    // Single line measurement
    const metrics = ctx.measureText(text);
    return {
      width: metrics.width,
      height: fontSize * 1.2, // Approximate line height
      lineCount: 1
    };
  }

  // Multi-line measurement with wrapping
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  
  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  
  if (currentLine) {
    lines.push(currentLine);
  }

  const maxLineWidth = Math.max(...lines.map(line => ctx.measureText(line).width));
  const lineHeight = fontSize * 1.2;
  const totalHeight = lines.length * lineHeight;

  return {
    width: maxLineWidth,
    height: totalHeight,
    lineCount: lines.length
  };
}

/**
 * Calculate the best-fit font size for text within a container
 */
export function calculateBestFitFontSize(
  text: string,
  containerWidth: number,
  containerHeight: number,
  maxFontSize: number,
  fontFamily: string = 'Arial',
  fontWeight: string = 'normal',
  minFontSize: number = 6,
  padding: number = 12
): FitResult {
  if (!text || text.trim() === '') {
    return { fontSize: maxFontSize, willFit: true, overflowPercentage: 0 };
  }

  const availableWidth = containerWidth - padding;
  const availableHeight = containerHeight - padding;

  // Binary search for optimal font size
  let low = minFontSize;
  let high = maxFontSize;
  let bestFit = minFontSize;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const measurement = measureText(text, fontFamily, mid, fontWeight, availableWidth);

    if (measurement.height <= availableHeight && measurement.width <= availableWidth) {
      bestFit = mid;
      low = mid + 1; // Try larger
    } else {
      high = mid - 1; // Try smaller
    }
  }

  // Check if even minimum font size fits
  const finalMeasurement = measureText(text, fontFamily, bestFit, fontWeight, availableWidth);
  const willFit = finalMeasurement.height <= availableHeight;
  
  const overflowPercentage = willFit 
    ? 0 
    : ((finalMeasurement.height - availableHeight) / availableHeight) * 100;

  return {
    fontSize: bestFit,
    willFit,
    overflowPercentage: Math.round(overflowPercentage)
  };
}

/**
 * Detect if text will overflow at the given font size
 * With 8% tolerance - minor overflow is acceptable
 */
export function detectTextOverflow(
  text: string,
  containerWidth: number,
  containerHeight: number,
  fontSize: number,
  fontFamily: string = 'Arial',
  fontWeight: string = 'normal',
  padding: number = 12
): { hasOverflow: boolean; overflowPercentage: number } {
  const availableWidth = containerWidth - padding;
  const availableHeight = containerHeight - padding;

  // Measure with word wrapping
  const measurement = measureText(text, fontFamily, fontSize, fontWeight, availableWidth);
  
  // Add 8% tolerance - only flag if significantly over
  const toleranceHeight = availableHeight * 1.08;
  const hasOverflow = measurement.height > toleranceHeight;
  const overflowPercentage = measurement.height > availableHeight
    ? ((measurement.height - availableHeight) / availableHeight) * 100
    : 0;

  return {
    hasOverflow,
    overflowPercentage: Math.round(overflowPercentage)
  };
}

/**
 * Calculate optimal font size in mm/points for PDF generation
 */
export function mmToPdfPoints(mm: number): number {
  return (mm / 25.4) * 72;
}

/**
 * Estimate text width in mm for PDF (rough approximation)
 */
export function estimateTextWidthMm(
  text: string,
  fontSizePt: number
): number {
  // Rough estimation: average character is ~0.6 width of font size in points
  const estimatedWidthPt = text.length * fontSizePt * 0.6;
  return (estimatedWidthPt / 72) * 25.4; // Convert to mm
}
