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
      textAlign: 'center', // Professional center alignment for consistent look
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
  // Filter out junk columns like Unnamed_Column_*
  const validFields = region.fields.filter(f => 
    !/^Unnamed_Column_\d+$/i.test(f)
  );
  
  // Combine all field values into a single multi-line text block
  const combinedText = validFields
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
    templateField: validFields[0] || region.fields[0],
    combinedFields: validFields,
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
 * Uses mm-aware calculation for CE.SDK Millimeter design unit mode
 * Font sizes are always in points (pt)
 */
function calculateOptimalFontSize(
  sampleText: string,
  widthMm: number,
  heightMm: number,
  config: LayoutConfig,
  importance: 'highest' | 'high' | 'medium' | 'low'
): number {
  // For mm mode labels, use a direct approach based on available dimensions
  // This avoids pixel-based Canvas measurement which doesn't translate well to mm mode
  
  const isMultiLine = sampleText.includes(',') || sampleText.includes('\n');
  const lines = sampleText.split('\n').filter(Boolean);
  const lineCount = Math.max(1, isMultiLine ? lines.length : 1);
  const longestLine = Math.max(...lines.map(l => l.length), 1);
  
  // Constants for mm to pt conversion
  // 1 inch = 25.4mm, 1 inch = 72pt, so 1mm ≈ 2.83pt
  const PT_PER_MM = 2.83465;
  
  // Line height and fill factors for comfortable reading
  const lineHeightFactor = 1.35; // Standard line spacing
  const fillFactor = 0.75; // Don't fill 100% - leave breathing room
  
  // Height-based calculation: available height per line in mm → pt
  const heightPerLineMm = (heightMm * fillFactor) / (lineCount * lineHeightFactor);
  const heightBasedSize = heightPerLineMm * PT_PER_MM;
  
  // Width-based calculation: estimate based on character count
  // Average character width is ~0.5-0.6 of em (font size) for most fonts
  const charWidthFactor = 0.55;
  const widthBasedSize = (widthMm * PT_PER_MM * fillFactor) / (longestLine * charWidthFactor);
  
  // Use smaller of height and width constraints
  let targetFontPt = Math.min(heightBasedSize, widthBasedSize);
  
  // Apply importance-based adjustments (subtle - don't dominate the calculation)
  const importanceMultiplier = {
    highest: 1.0,
    high: 0.95,
    medium: 0.9,
    low: 0.85
  }[importance];
  
  targetFontPt *= importanceMultiplier;
  
  // Clamp to config limits
  const minFont = lineCount >= 4 ? 10 : config.minFontSize;
  const result = Math.max(minFont, Math.min(Math.round(targetFontPt), config.maxFontSize));
  
  console.log(`📐 Font size calc: ${widthMm.toFixed(1)}×${heightMm.toFixed(1)}mm, ${lineCount} lines → ${result}pt`);
  
  return result;
}

/**
 * Default configuration for standard Avery labels
 */
export const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  templateSize: { width: 66.68, height: 25.4 }, // Avery 5160
  margins: { top: 1.5, right: 1.5, bottom: 1.5, left: 1.5 }, // Reduced from 2mm
  padding: 0.5, // Reduced from 1mm
  minFontSize: 8, // Increased from 7
  maxFontSize: 72 // Increased to allow larger fonts for bigger labels
};
