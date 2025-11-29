// Minimal text measurement utilities for compatibility
// Note: The Fabric.js canvas now handles actual text measurement
// These are fallback utilities for non-canvas contexts

export function pointsToPixels(points: number): number {
  return (points / 72) * 96;
}

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
 * Simple text measurement using Canvas API (fallback only)
 */
export function measureText(
  text: string,
  fontFamily: string,
  fontSize: number,
  fontWeight: string = 'normal',
  maxWidth?: number
): TextMeasurement {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  if (!ctx) {
    return { width: 0, height: 0, lineCount: 0 };
  }

  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  
  if (!maxWidth) {
    const metrics = ctx.measureText(text);
    return {
      width: metrics.width,
      height: fontSize * 1.3, // Changed from 1.2 to match Fabric.js
      lineCount: 1
    };
  }

  // Handle newlines and word wrapping
  const lines: string[] = [];
  const paragraphs = text.split('\n');
  
  for (const paragraph of paragraphs) {
    const words = paragraph.split(' ');
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
  }

  const lineHeight = fontSize * 1.3; // Changed from 1.2 to match Fabric.js
  return {
    width: maxWidth,
    height: lines.length * lineHeight,
    lineCount: lines.length
  };
}

/**
 * Calculate best fit font size (binary search)
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

  let low = minFontSize;
  let high = maxFontSize;
  let bestFit = minFontSize;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const measurement = measureText(text, fontFamily, mid, fontWeight, availableWidth);

    if (measurement.height <= availableHeight && measurement.width <= availableWidth) {
      bestFit = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

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
 * Detect text overflow
 */
export function detectTextOverflow(
  text: string,
  containerWidth: number,
  containerHeight: number,
  fontSizeInPoints: number,
  fontFamily: string = 'Arial',
  fontWeight: string = 'normal',
  padding: number = 12
): { hasOverflow: boolean; overflowPercentage: number } {
  const fontSizeInPixels = pointsToPixels(fontSizeInPoints);
  const availableWidth = containerWidth - padding;
  const availableHeight = containerHeight - padding;

  const measurement = measureText(text, fontFamily, fontSizeInPixels, fontWeight, availableWidth);
  
  const hasHeightOverflow = measurement.height > availableHeight;
  const hasWidthOverflow = measurement.width > availableWidth;
  
  if (!hasHeightOverflow && !hasWidthOverflow) {
    return { hasOverflow: false, overflowPercentage: 0 };
  }

  const heightRatio = measurement.height / availableHeight;
  const widthRatio = measurement.width / availableWidth;
  const overflowPercentage = (Math.max(heightRatio, widthRatio) - 1) * 100;

  const TOLERANCE = 8;
  return {
    hasOverflow: overflowPercentage > TOLERANCE,
    overflowPercentage: Math.round(overflowPercentage)
  };
}
