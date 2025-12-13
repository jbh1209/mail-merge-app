// Deterministic layout engine for precise, pixel-perfect label layouts
// This engine takes high-level design intent from AI and executes it with exact measurements

import { measureText, pointsToPixels } from './text-measurement-utils';
import { PX_PER_MM } from './coordinates';

export interface DesignIntent {
  strategy: string;
  regions: {
    [key: string]: {
      fields: string[];
      layout: 'horizontal_split' | 'three_column' | 'single_dominant' | 'stacked' | 'two_column' | 'stacked_inline';
      verticalAllocation: number; // 0-1 (percentage of height)
      priority: 'highest' | 'high' | 'medium' | 'low';
    };
  };
  typography: {
    [fieldName: string]: {
      weight: 'normal' | 'bold';
      importance: 'highest' | 'high' | 'medium' | 'low';
    };
  };
}

export interface LayoutConfig {
  templateSize: { width: number; height: number }; // in mm
  margins: { top: number; right: number; bottom: number; left: number }; // in mm
  padding: number; // in mm, internal padding within field boxes
  minFontSize: number; // in pt
  maxFontSize: number; // in pt
}

export interface FieldLayout {
  templateField: string;
  x: number; // in mm
  y: number; // in mm
  width: number; // in mm
  height: number; // in mm
  fontSize: number; // in pt (max size - Fabric will auto-fit)
  fontWeight: 'normal' | 'bold';
  textAlign: 'left' | 'center' | 'right';
  verticalAlign: 'top' | 'middle' | 'bottom';
  autoFit?: boolean; // Enable Fabric.js native text fitting
  whiteSpace?: 'pre-line';
  transformCommas?: boolean;
  combinedFields?: string[]; // For address blocks that combine multiple fields
  fieldType?: 'text' | 'address_block';
}

export interface ExecuteResult {
  fields: FieldLayout[];
  metadata: {
    totalHeight: number;
    unusedSpace: number;
    fieldCount: number;
  };
}

/**
 * Main layout engine execution function
 * Takes design intent and produces precise layout coordinates
 */
export function executeLayout(
  intent: DesignIntent,
  config: LayoutConfig,
  sampleData: Record<string, any>
): ExecuteResult {
  // Calculate available space
  const availableWidth = config.templateSize.width - config.margins.left - config.margins.right;
  const availableHeight = config.templateSize.height - config.margins.top - config.margins.bottom;

  const fields: FieldLayout[] = [];
  let currentY = config.margins.top;

  // Process each region in order
  const regionNames = Object.keys(intent.regions).sort((a, b) => {
    // Sort by vertical position (header, body, footer)
    const order = ['header', 'body', 'footer'];
    return order.indexOf(a) - order.indexOf(b);
  });

  for (const regionName of regionNames) {
    const region = intent.regions[regionName];
    const regionHeight = availableHeight * region.verticalAllocation;

    // Layout fields within region based on layout type
    const regionFields = layoutRegion(
      region,
      {
        x: config.margins.left,
        y: currentY,
        width: availableWidth,
        height: regionHeight
      },
      config,
      intent.typography,
      sampleData
    );

    fields.push(...regionFields);
    currentY += regionHeight;
  }

  // Calculate metadata
  const totalUsedHeight = currentY - config.margins.top;
  const unusedSpace = availableHeight - totalUsedHeight;

  return {
    fields,
    metadata: {
      totalHeight: totalUsedHeight,
      unusedSpace: Math.max(0, unusedSpace),
      fieldCount: fields.length
    }
  };
}

/**
 * Layout fields within a region based on the specified layout type
 */
function layoutRegion(
  region: DesignIntent['regions'][string],
  bounds: { x: number; y: number; width: number; height: number },
  config: LayoutConfig,
  typography: DesignIntent['typography'],
  sampleData: Record<string, any>
): FieldLayout[] {
  switch (region.layout) {
    case 'single_dominant':
      return layoutSingleDominant(region, bounds, config, typography, sampleData);
    case 'horizontal_split':
      return layoutHorizontalSplit(region, bounds, config, typography, sampleData);
    case 'two_column':
      return layoutTwoColumn(region, bounds, config, typography, sampleData);
    case 'three_column':
      return layoutThreeColumn(region, bounds, config, typography, sampleData);
    case 'stacked':
      return layoutStacked(region, bounds, config, typography, sampleData);
    case 'stacked_inline':
      return layoutStackedInline(region, bounds, config, typography, sampleData);
    default:
      return layoutStacked(region, bounds, config, typography, sampleData);
  }
}

/**
 * Single field that dominates the entire region (e.g., ADDRESS)
 */
function layoutSingleDominant(
  region: DesignIntent['regions'][string],
  bounds: { x: number; y: number; width: number; height: number },
  config: LayoutConfig,
  typography: DesignIntent['typography'],
  sampleData: Record<string, any>
): FieldLayout[] {
  const field = region.fields[0];
  if (!field) return [];

  const typo = typography[field] || { weight: 'normal', importance: 'medium' };
  const sampleText = String(sampleData[field] || field);
  
  // Calculate optimal font size to fill the allocated space
  const fontSize = calculateOptimalFontSize(
    sampleText,
    bounds.width,
    bounds.height,
    config,
    typo.importance
  );

  // Check if field is ADDRESS type (contains commas)
  const isAddress = sampleText.includes(',');

    return [{
      templateField: region.fields[0],
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      fontSize, // Use calculated optimal font size
      autoFit: true,
      fontWeight: typo.weight,
      textAlign: 'center',
      verticalAlign: 'middle',
    }];
}

/**
 * Two fields side by side (e.g., name left, code right)
 */
function layoutHorizontalSplit(
  region: DesignIntent['regions'][string],
  bounds: { x: number; y: number; width: number; height: number },
  config: LayoutConfig,
  typography: DesignIntent['typography'],
  sampleData: Record<string, any>
): FieldLayout[] {
  const fields: FieldLayout[] = [];
  const fieldCount = Math.min(region.fields.length, 2);
  const fieldWidth = (bounds.width - config.padding) / fieldCount;

  region.fields.slice(0, 2).forEach((field, index) => {
    const typo = typography[field] || { weight: 'normal', importance: 'medium' };
    const sampleText = String(sampleData[field] || field);
    
    const fontSize = calculateOptimalFontSize(
      sampleText,
      fieldWidth,
      bounds.height,
      config,
      typo.importance
    );

    fields.push({
      templateField: field,
      x: bounds.x + (index * (fieldWidth + config.padding)),
      y: bounds.y,
      width: fieldWidth,
      height: bounds.height,
      fontSize,
      fontWeight: typo.weight,
      textAlign: index === 0 ? 'left' : 'right',
      verticalAlign: 'middle'
    });
  });

  return fields;
}

/**
 * Two fields stacked vertically
 */
function layoutTwoColumn(
  region: DesignIntent['regions'][string],
  bounds: { x: number; y: number; width: number; height: number },
  config: LayoutConfig,
  typography: DesignIntent['typography'],
  sampleData: Record<string, any>
): FieldLayout[] {
  const fields: FieldLayout[] = [];
  const fieldCount = Math.min(region.fields.length, 2);
  const fieldWidth = (bounds.width - config.padding) / fieldCount;

  region.fields.slice(0, 2).forEach((field, index) => {
    const typo = typography[field] || { weight: 'normal', importance: 'medium' };
    const sampleText = String(sampleData[field] || field);
    
    const fontSize = calculateOptimalFontSize(
      sampleText,
      fieldWidth,
      bounds.height,
      config,
      typo.importance
    );

    fields.push({
      templateField: field,
      x: bounds.x + (index * (fieldWidth + config.padding)),
      y: bounds.y,
      width: fieldWidth,
      height: bounds.height,
      fontSize,
      fontWeight: typo.weight,
      textAlign: 'center',
      verticalAlign: 'middle'
    });
  });

  return fields;
}

/**
 * Three fields in a row (e.g., footer with three columns)
 */
function layoutThreeColumn(
  region: DesignIntent['regions'][string],
  bounds: { x: number; y: number; width: number; height: number },
  config: LayoutConfig,
  typography: DesignIntent['typography'],
  sampleData: Record<string, any>
): FieldLayout[] {
  const fields: FieldLayout[] = [];
  const fieldCount = Math.min(region.fields.length, 3);
  const fieldWidth = (bounds.width - (config.padding * (fieldCount - 1))) / fieldCount;

  region.fields.slice(0, 3).forEach((field, index) => {
    const typo = typography[field] || { weight: 'normal', importance: 'low' };
    const sampleText = String(sampleData[field] || field);
    
    const fontSize = calculateOptimalFontSize(
      sampleText,
      fieldWidth,
      bounds.height,
      config,
      typo.importance
    );

    const textAlign = index === 0 ? 'left' : (index === 1 ? 'center' : 'right');

    fields.push({
      templateField: field,
      x: bounds.x + (index * (fieldWidth + config.padding)),
      y: bounds.y,
      width: fieldWidth,
      height: bounds.height,
      fontSize,
      fontWeight: typo.weight,
      textAlign,
      verticalAlign: 'middle'
    });
  });

  return fields;
}

/**
 * Fields stacked vertically, each taking full width
 */
function layoutStacked(
  region: DesignIntent['regions'][string],
  bounds: { x: number; y: number; width: number; height: number },
  config: LayoutConfig,
  typography: DesignIntent['typography'],
  sampleData: Record<string, any>
): FieldLayout[] {
  const fields: FieldLayout[] = [];
  const fieldCount = region.fields.length;
  const fieldHeight = (bounds.height - (config.padding * (fieldCount - 1))) / fieldCount;

  region.fields.forEach((field, index) => {
    const typo = typography[field] || { weight: 'normal', importance: 'medium' };
    const sampleText = String(sampleData[field] || field);
    
    const fontSize = calculateOptimalFontSize(
      sampleText,
      bounds.width,
      fieldHeight,
      config,
      typo.importance
    );

    fields.push({
      templateField: field,
      x: bounds.x,
      y: bounds.y + (index * (fieldHeight + config.padding)),
      width: bounds.width,
      height: fieldHeight,
      fontSize,
      fontWeight: typo.weight,
      textAlign: 'left',
      verticalAlign: 'middle'
    });
  });

  return fields;
}

/**
 * All fields combined into single stacked text block (standard address labels)
 * Renders like an address on an envelope - no borders between lines
 */
function layoutStackedInline(
  region: DesignIntent['regions'][string],
  bounds: { x: number; y: number; width: number; height: number },
  config: LayoutConfig,
  typography: DesignIntent['typography'],
  sampleData: Record<string, any>
): FieldLayout[] {
  // Combine all field values into a single multi-line text block
  const combinedText = region.fields
    .map(field => String(sampleData[field] || field))
    .join('\n');

  const typo = typography[region.fields[0]] || { weight: 'normal', importance: 'high' };
  
  // Calculate optimal font size for the entire block
  const fontSize = calculateOptimalFontSize(
    combinedText,
    bounds.width,
    bounds.height,
    config,
    typo.importance
  );

  return [{
    templateField: region.fields[0],
    combinedFields: region.fields,
    fieldType: 'address_block',
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    fontSize, // Use calculated optimal font size
    autoFit: true,
    fontWeight: typo.weight,
    textAlign: 'center',
    verticalAlign: 'middle',
  }];
}

/**
 * Calculate optimal font size that fills the allocated space
 * Uses actual text measurement for precision
 * Importance affects starting guess but NOT the maximum size
 */
function calculateOptimalFontSize(
  sampleText: string,
  widthMm: number,
  heightMm: number,
  config: LayoutConfig,
  importance: 'highest' | 'high' | 'medium' | 'low'
): number {
  // Convert mm to pixels for Canvas API measurement using centralized constant
  const widthPx = widthMm * PX_PER_MM;
  const heightPx = heightMm * PX_PER_MM;
  
  // Check if text contains commas or newlines (multi-line)
  const isMultiLine = sampleText.includes(',') || sampleText.includes('\n');
  const lineCount = (sampleText.match(/\n/g) || []).length + 1;
  
  // Higher minimum for address blocks (4+ lines)
  const minFont = lineCount >= 4 ? 10 : config.minFontSize;

  // Binary search for LARGEST font size that fits
  // Importance does NOT cap the maximum - it only affects starting guess for efficiency
  let low = minFont;
  let high = config.maxFontSize;
  let bestFit = low;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const fontSizePx = pointsToPixels(mid);
    
    const measurement = measureText(
      sampleText,
      'Arial',
      fontSizePx,
      'normal',
      isMultiLine ? widthPx : undefined
    );

    // Use 1.3 line height for multi-line, matching Fabric
    const adjustedHeight = isMultiLine 
      ? measurement.lineCount * fontSizePx * 1.3 
      : measurement.height;

    // Check if fits with some padding
    const paddingPx = config.padding * PX_PER_MM;
    const fits = measurement.width <= (widthPx - paddingPx) && 
                 adjustedHeight <= (heightPx - paddingPx);

    if (fits) {
      bestFit = mid;
      low = mid + 1; // Try larger to fill more space
    } else {
      high = mid - 1; // Try smaller
    }
  }

  return Math.max(bestFit, minFont);
}

/**
 * Default configuration for standard Avery labels
 */
export const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  templateSize: { width: 66.68, height: 25.4 }, // Avery 5160
  margins: { top: 1.5, right: 1.5, bottom: 1.5, left: 1.5 }, // Reduced from 2mm
  padding: 0.5, // Reduced from 1mm
  minFontSize: 8, // Increased from 7
  maxFontSize: 24 // Increased from 16
};
