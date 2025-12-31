/**
 * VDP Variable Resolver for Polotno
 * 
 * Resolves {{fieldName}} placeholders in Polotno scene JSON with actual data values.
 * Supports text fields, image fields, barcodes, QR codes, and sequence numbers.
 */

import type { PolotnoScene, PolotnoElement, PolotnoElementCustom, BarcodeConfig, SequenceConfig } from './types';
import { generateBarcodeDataUrl, generateQRCodeDataUrl } from '@/lib/barcode-svg-utils';

export interface VdpResolveOptions {
  /** Current data record with field values */
  record: Record<string, string>;
  /** Current record index (0-based) for sequence number generation */
  recordIndex: number;
  /** Base URL for relative image paths */
  imageBaseUrl?: string;
}

/**
 * Deep clone a scene JSON object
 */
function cloneScene(scene: PolotnoScene): PolotnoScene {
  return JSON.parse(JSON.stringify(scene));
}

/**
 * Replace all {{fieldName}} placeholders in text with actual values
 */
function resolveTextPlaceholders(text: string, record: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, fieldName) => {
    const value = record[fieldName];
    return value !== undefined ? value : match; // Keep placeholder if field not found
  });
}

/**
 * Generate sequence number based on config and current index
 */
function generateSequenceNumber(config: SequenceConfig, recordIndex: number): string {
  const { startNumber = 1, prefix = '', suffix = '', padding = 0 } = config;
  const number = startNumber + recordIndex;
  const paddedNumber = padding > 0 ? String(number).padStart(padding, '0') : String(number);
  return `${prefix}${paddedNumber}${suffix}`;
}

/**
 * Resolve barcode/QR code value from config and record
 */
function resolveBarcodeValue(config: BarcodeConfig, record: Record<string, string>): string {
  if (config.dataSource === 'static') {
    return config.staticValue || '';
  }
  if (config.dataSource === 'field' && config.variableField) {
    return record[config.variableField] || '';
  }
  return '';
}

/**
 * Resolve a single element with VDP data
 */
function resolveElement(
  element: PolotnoElement,
  options: VdpResolveOptions
): PolotnoElement {
  const { record, recordIndex } = options;
  const custom = element.custom as PolotnoElementCustom | undefined;

  // Handle text elements
  if (element.type === 'text' && element.text) {
    element.text = resolveTextPlaceholders(element.text, record);
    
    // Also resolve if there's a custom.variable field
    if (custom?.variable && record[custom.variable] !== undefined) {
      // If the text is just a placeholder, replace entirely
      if (element.text === `{{${custom.variable}}}` || element.text.trim() === '') {
        element.text = record[custom.variable];
      }
    }
  }

  // Handle sequence numbers
  if (custom?.sequenceConfig) {
    const sequenceValue = generateSequenceNumber(custom.sequenceConfig, recordIndex);
    if (element.type === 'text') {
      element.text = sequenceValue;
    }
  }

  // Handle barcode/QR code elements
  if (custom?.barcodeConfig) {
    const barcodeValue = resolveBarcodeValue(custom.barcodeConfig, record);
    
    // Store resolved value in custom for rendering
    if (!element.custom) element.custom = {};
    (element.custom as PolotnoElementCustom).barcodeValue = barcodeValue;

    // Generate barcode SVG as data URL for SVG/image elements
    if ((element.type === 'svg' || element.type === 'image') && barcodeValue) {
      try {
        const format = custom.barcodeConfig.format || 'code128';
        const isQR = custom.barcodeConfig.type === 'qrcode' || format === 'qrcode';
        
        let dataUrl: string;
        if (isQR) {
          dataUrl = generateQRCodeDataUrl(barcodeValue, {
            width: element.width,
            height: element.height,
          });
        } else {
          dataUrl = generateBarcodeDataUrl(barcodeValue, format, {
            width: element.width,
            height: element.height,
          });
        }
        
        if (element.type === 'svg') {
          element.svgSource = dataUrl;
        } else {
          element.src = dataUrl;
        }
      } catch (err) {
        console.warn(`Failed to generate barcode for value "${barcodeValue}":`, err);
      }
    }
  }

  // Handle image elements with variable field (VDP images)
  if (element.type === 'image' && custom?.variable) {
    const imageUrl = record[custom.variable];
    if (imageUrl) {
      // Handle relative paths with base URL
      if (options.imageBaseUrl && !imageUrl.startsWith('http') && !imageUrl.startsWith('data:')) {
        element.src = `${options.imageBaseUrl}/${imageUrl}`;
      } else {
        element.src = imageUrl;
      }
    }
  }

  return element;
}

/**
 * Resolve all VDP variables in a Polotno scene
 * 
 * @param scene - The base Polotno scene JSON
 * @param options - Resolution options including record data
 * @returns A new scene with all variables resolved
 */
export function resolveVdpVariables(
  scene: PolotnoScene,
  options: VdpResolveOptions
): PolotnoScene {
  const resolved = cloneScene(scene);

  for (const page of resolved.pages) {
    for (let i = 0; i < page.children.length; i++) {
      page.children[i] = resolveElement(page.children[i], options);
    }
  }

  return resolved;
}

/**
 * Apply VDP resolution to a Polotno store (in-place preview update)
 * 
 * @param store - Polotno store instance
 * @param baseScene - Original template scene (before VDP resolution)
 * @param options - Resolution options including record data
 */
export function applyVdpToStore(
  store: any,
  baseScene: PolotnoScene | string,
  options: VdpResolveOptions
): void {
  const scene = typeof baseScene === 'string' ? JSON.parse(baseScene) : baseScene;
  const resolved = resolveVdpVariables(scene, options);
  store.loadJSON(resolved);
}

/**
 * Extract field names used in a scene (for validation/preview)
 */
export function extractUsedFields(scene: PolotnoScene | string): string[] {
  const parsed = typeof scene === 'string' ? JSON.parse(scene) : scene;
  const fields = new Set<string>();

  const placeholderRegex = /\{\{(\w+)\}\}/g;

  for (const page of parsed.pages || []) {
    for (const element of page.children || []) {
      // Extract from text content
      if (element.text) {
        let match;
        while ((match = placeholderRegex.exec(element.text)) !== null) {
          fields.add(match[1]);
        }
      }

      // Extract from custom.variable
      if (element.custom?.variable) {
        fields.add(element.custom.variable);
      }

      // Extract from barcode config
      if (element.custom?.barcodeConfig?.variableField) {
        fields.add(element.custom.barcodeConfig.variableField);
      }
    }
  }

  return Array.from(fields);
}

/**
 * Batch resolve multiple records for export
 */
export function batchResolveVdp(
  scene: PolotnoScene | string,
  records: Record<string, string>[],
  imageBaseUrl?: string
): PolotnoScene[] {
  const parsed = typeof scene === 'string' ? JSON.parse(scene) : scene;
  
  return records.map((record, index) => 
    resolveVdpVariables(parsed, {
      record,
      recordIndex: index,
      imageBaseUrl,
    })
  );
}
