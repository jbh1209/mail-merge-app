/**
 * VDP Variable Resolver for Polotno
 * 
 * Resolves {{fieldName}} placeholders in Polotno scene JSON with actual data values.
 * Supports text fields, image fields, barcodes, QR codes, and sequence numbers.
 * 
 * Now includes CE.SDK-style image matching and caching for variable images.
 */

import type { PolotnoScene, PolotnoElement, PolotnoElementCustom, BarcodeConfig, SequenceConfig } from './types';
import { generateBarcodeDataUrl, generateQRCodeDataUrl } from '@/lib/barcode-svg-utils';

// ============ IMAGE MATCHING (CE.SDK-style) ============

/**
 * Normalize image name for matching (handles paths, extensions, etc.)
 * Copied from CE.SDK variableResolver for consistency
 */
export function normalizeForMatch(name: string): string {
  let baseName = name;
  if (name.includes('\\')) baseName = name.split('\\').pop() || name;
  else if (name.includes('/')) baseName = name.split('/').pop() || name;
  if (baseName.includes('?')) baseName = baseName.split('?')[0];
  return baseName.replace(/\.(png|jpg|jpeg|gif|webp|svg|bmp|tiff?)$/i, '').toLowerCase().trim();
}

/**
 * Find image URL from projectImages matching a field value
 */
export function findImageUrl(
  fieldValue: string,
  projectImages: { name: string; url: string }[]
): string | null {
  if (!projectImages?.length) return null;
  const normalizedValue = normalizeForMatch(fieldValue);
  const matchingImage = projectImages.find(img => 
    normalizeForMatch(img.name) === normalizedValue
  );
  return matchingImage?.url || null;
}

// ============ IMAGE CACHE (CE.SDK-style) ============

const imageCache = new Map<string, string>(); // Original URL -> Blob URL
const pendingFetches = new Map<string, Promise<string>>();
const cacheAccessOrder: string[] = [];
const MAX_CACHE_SIZE = 50;

function evictIfNeeded(): void {
  while (imageCache.size >= MAX_CACHE_SIZE && cacheAccessOrder.length > 0) {
    const oldestUrl = cacheAccessOrder.shift();
    if (oldestUrl && imageCache.has(oldestUrl)) {
      const blobUrl = imageCache.get(oldestUrl)!;
      URL.revokeObjectURL(blobUrl);
      imageCache.delete(oldestUrl);
    }
  }
}

/**
 * Prefetch an image and cache it as a blob URL
 */
export async function prefetchImage(url: string): Promise<string> {
  if (imageCache.has(url)) {
    const idx = cacheAccessOrder.indexOf(url);
    if (idx > -1) cacheAccessOrder.splice(idx, 1);
    cacheAccessOrder.push(url);
    return imageCache.get(url)!;
  }
  
  if (pendingFetches.has(url)) {
    return pendingFetches.get(url)!;
  }
  
  const fetchPromise = (async () => {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      evictIfNeeded();
      imageCache.set(url, blobUrl);
      cacheAccessOrder.push(url);
      return blobUrl;
    } catch (e) {
      console.warn('Failed to prefetch image:', url, e);
      return url;
    } finally {
      pendingFetches.delete(url);
    }
  })();
  
  pendingFetches.set(url, fetchPromise);
  return fetchPromise;
}

/**
 * Prefetch images for multiple records (background loading)
 */
export async function prefetchImagesForRecords(
  records: Record<string, string>[],
  projectImages?: { name: string; url: string }[]
): Promise<void> {
  if (!projectImages?.length || !records?.length) return;
  
  const allUrls: string[] = [];
  
  for (const record of records) {
    for (const value of Object.values(record)) {
      if (typeof value === 'string') {
        const url = findImageUrl(value, projectImages);
        if (url && !allUrls.includes(url)) {
          allUrls.push(url);
        }
      }
    }
  }
  
  // Also include all project images directly
  for (const img of projectImages) {
    if (img.url && !allUrls.includes(img.url)) {
      allUrls.push(img.url);
    }
  }
  
  if (allUrls.length === 0) return;
  
  console.log(`🖼️ [Polotno] Prefetching ${allUrls.length} images for VDP cache...`);
  
  // Priority load first 10
  const priorityUrls = allUrls.slice(0, 10);
  await Promise.all(priorityUrls.map(prefetchImage));
  console.log(`✅ [Polotno] Priority images loaded: ${priorityUrls.length}`);
  
  // Background load rest (non-blocking)
  const remainingUrls = allUrls.slice(10);
  if (remainingUrls.length > 0) {
    (async () => {
      const BATCH_SIZE = 10;
      for (let i = 0; i < remainingUrls.length; i += BATCH_SIZE) {
        const batch = remainingUrls.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(prefetchImage));
      }
      console.log(`✅ [Polotno] Background images loaded: ${remainingUrls.length}`);
    })();
  }
}

/**
 * Warm cache for adjacent records (prev, current, next)
 */
export async function warmCacheForAdjacentRecords(
  currentIndex: number,
  records: Record<string, string>[],
  projectImages?: { name: string; url: string }[]
): Promise<void> {
  if (!projectImages?.length || !records?.length) return;
  
  const indicesToWarm = [currentIndex - 1, currentIndex, currentIndex + 1]
    .filter(i => i >= 0 && i < records.length);
  
  const recordsToWarm = indicesToWarm.map(i => records[i]);
  
  const urlsToWarm: string[] = [];
  for (const record of recordsToWarm) {
    for (const value of Object.values(record)) {
      if (typeof value === 'string') {
        const url = findImageUrl(value, projectImages);
        if (url && !urlsToWarm.includes(url)) {
          urlsToWarm.push(url);
        }
      }
    }
  }
  
  if (urlsToWarm.length > 0) {
    await Promise.all(urlsToWarm.map(prefetchImage));
  }
}

// ============ EXTENDED VDP OPTIONS ============

export interface VdpResolveOptions {
  /** Current data record with field values */
  record: Record<string, string>;
  /** Current record index (0-based) for sequence number generation */
  recordIndex: number;
  /** Base URL for relative image paths (legacy support) */
  imageBaseUrl?: string;
  /** Project images for filename -> URL mapping */
  projectImages?: { name: string; url: string }[];
  /** Use cached blob URLs for images (faster preview) */
  useCachedImages?: boolean;
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
    return value !== undefined ? value : match;
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
 * Resolve image URL for an image element with variable binding
 */
function resolveImageUrl(
  fieldValue: string,
  options: VdpResolveOptions
): string {
  const { imageBaseUrl, projectImages, useCachedImages } = options;
  
  // If already a full URL or data URI, use directly
  if (fieldValue.startsWith('http') || fieldValue.startsWith('data:')) {
    // Check cache if enabled
    if (useCachedImages && imageCache.has(fieldValue)) {
      return imageCache.get(fieldValue)!;
    }
    return fieldValue;
  }
  
  // Try matching against projectImages (CE.SDK-style)
  if (projectImages && projectImages.length > 0) {
    const matchedUrl = findImageUrl(fieldValue, projectImages);
    if (matchedUrl) {
      console.log(`✅ [VDP] Image resolved: "${fieldValue}" -> ${matchedUrl.substring(0, 50)}...`);
      // Check cache
      if (useCachedImages && imageCache.has(matchedUrl)) {
        return imageCache.get(matchedUrl)!;
      }
      return matchedUrl;
    } else {
      console.warn(`❌ [VDP] Image not found: "${fieldValue}" (normalized: "${normalizeForMatch(fieldValue)}")`);
    }
  }
  
  // Fallback: prepend base URL if provided
  if (imageBaseUrl && !fieldValue.startsWith('/')) {
    return `${imageBaseUrl}/${fieldValue}`;
  }
  
  return fieldValue;
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
    
    if (!element.custom) element.custom = {};
    (element.custom as PolotnoElementCustom).barcodeValue = barcodeValue;

    // Generate barcode SVG as data URL
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
        console.warn(`Failed to generate barcode for "${barcodeValue}":`, err);
      }
    }
  }

  // Handle image elements with variable field (VDP images) - IMPROVED
  if (element.type === 'image' && custom?.variable) {
    const imageFieldValue = record[custom.variable];
    if (imageFieldValue) {
      element.src = resolveImageUrl(imageFieldValue, options);
    }
  }

  return element;
}

/**
 * Resolve all VDP variables in a Polotno scene
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
      if (element.text) {
        let match;
        while ((match = placeholderRegex.exec(element.text)) !== null) {
          fields.add(match[1]);
        }
      }

      if (element.custom?.variable) {
        fields.add(element.custom.variable);
      }

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
  imageBaseUrl?: string,
  projectImages?: { name: string; url: string }[]
): PolotnoScene[] {
  const parsed = typeof scene === 'string' ? JSON.parse(scene) : scene;
  
  return records.map((record, index) => 
    resolveVdpVariables(parsed, {
      record,
      recordIndex: index,
      imageBaseUrl,
      projectImages,
    })
  );
}
