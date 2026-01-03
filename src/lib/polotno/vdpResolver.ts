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
  
  // Prefetch all in parallel
  await Promise.all(allUrls.map(url => prefetchImage(url)));
}

/**
 * Warm cache for records adjacent to current index (for smooth navigation)
 */
export async function warmCacheForAdjacentRecords(
  currentIndex: number,
  records: Record<string, string>[],
  projectImages?: { name: string; url: string }[]
): Promise<void> {
  if (!projectImages?.length || !records?.length) return;
  
  const indicesToWarm = [
    currentIndex - 1,
    currentIndex,
    currentIndex + 1,
    currentIndex + 2,
  ].filter(i => i >= 0 && i < records.length);
  
  const recordsToWarm = indicesToWarm.map(i => records[i]);
  await prefetchImagesForRecords(recordsToWarm, projectImages);
}

// ============ SCENE CLONING ============

function cloneScene(scene: PolotnoScene): PolotnoScene {
  return JSON.parse(JSON.stringify(scene));
}

// ============ VDP RESOLUTION OPTIONS ============

export interface VdpResolveOptions {
  record: Record<string, string>;
  recordIndex: number;
  imageBaseUrl?: string;
  projectImages?: { name: string; url: string }[];
  useCachedImages?: boolean;
}

// ============ TOKEN NORMALIZATION ============

/**
 * Normalize a field name for matching (handles case, spaces, underscores)
 */
function normalizeFieldName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[_-]/g, ' ')   // Replace underscores/dashes with spaces
    .replace(/\s+/g, ' ')    // Collapse multiple spaces
    .trim();
}

/**
 * Find a matching record key for a token (with fuzzy matching)
 */
function findRecordValue(token: string, record: Record<string, string>): string | null {
  // 1. Direct match
  if (token in record) {
    return record[token];
  }
  
  // 2. Normalized match
  const normalizedToken = normalizeFieldName(token);
  for (const [key, value] of Object.entries(record)) {
    if (normalizeFieldName(key) === normalizedToken) {
      return value;
    }
  }
  
  // 3. No match found
  return null;
}

// ============ MAIN VDP RESOLVER ============

/**
 * Resolve all VDP variables in a Polotno scene with actual data.
 * Returns a new scene with placeholders replaced by values.
 * 
 * IMPORTANT: Element IDs are preserved for matching back to base template.
 */
export function resolveVdpVariables(
  scene: PolotnoScene,
  options: VdpResolveOptions
): PolotnoScene {
  const resolved = cloneScene(scene);
  
  for (const page of resolved.pages) {
    page.children = page.children.map(element => 
      resolveElement(element, options)
    );
  }
  
  return resolved;
}

/**
 * Resolve VDP variables for a single element
 */
function resolveElement(
  element: PolotnoElement,
  options: VdpResolveOptions
): PolotnoElement {
  const { record, recordIndex, imageBaseUrl, projectImages, useCachedImages } = options;
  const el = { ...element };
  
  // Handle text elements with placeholders
  // Regex supports: {{name}}, {{Full Name}}, {{ job_title }}, etc.
  if (el.type === 'text' && el.text) {
    const originalText = el.text;
    el.text = el.text.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (match, rawToken) => {
      const token = rawToken.trim();
      const value = findRecordValue(token, record);
      if (value === null) {
        console.warn(`⚠️ VDP token not found: "${token}" in record keys:`, Object.keys(record));
      }
      return value !== null ? value : match; // Keep original if not found
    });
    
    // Log resolution for debugging (only if changed)
    if (el.text !== originalText && el.text !== originalText) {
      console.log(`🔄 VDP resolved: "${originalText.substring(0, 30)}..." → "${el.text.substring(0, 30)}..."`);
    }
  }
  
  // Handle sequence numbers
  if (el.custom?.sequenceConfig) {
    const config = el.custom.sequenceConfig as SequenceConfig;
    const seqNumber = config.startNumber + recordIndex;
    const paddedNumber = String(seqNumber).padStart(config.padding || 0, '0');
    const seqText = `${config.prefix || ''}${paddedNumber}${config.suffix || ''}`;
    
    if (el.type === 'text') {
      el.text = seqText;
    }
  }
  
  // Handle barcodes and QR codes
  if (el.custom?.barcodeConfig) {
    const config = el.custom.barcodeConfig as BarcodeConfig;
    let barcodeValue = '';
    
    if (config.dataSource === 'static') {
      barcodeValue = config.staticValue || '';
    } else if (config.dataSource === 'field' && config.variableField) {
      // Use fuzzy matching for barcode field values too
      barcodeValue = findRecordValue(config.variableField, record) || '';
    }
    
    // Replace any remaining placeholders with fuzzy matching
    barcodeValue = barcodeValue.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (match, rawToken) => {
      const token = rawToken.trim();
      const value = findRecordValue(token, record);
      return value !== null ? value : match;
    });
    
    if (barcodeValue) {
      try {
        if (config.type === 'qrcode') {
          el.src = generateQRCodeDataUrl(barcodeValue, {
            width: Math.max(el.width, el.height),
            height: Math.max(el.width, el.height),
          });
        } else {
          el.src = generateBarcodeDataUrl(barcodeValue, config.format || 'code128', {
            width: el.width,
            height: el.height,
          });
        }
        el.type = 'image';
      } catch (e) {
        console.warn('Failed to generate barcode:', e);
      }
    }
  }
  
  // Handle image fields with variable binding
  if (el.type === 'image' && el.custom?.variable) {
    // Use fuzzy matching for image field values
    const fieldValue = findRecordValue(el.custom.variable, record);
    if (fieldValue) {
      // Try to find matching project image
      const matchedUrl = findImageUrl(fieldValue, projectImages || []);
      if (matchedUrl) {
        // Use cached blob URL if available
        if (useCachedImages && imageCache.has(matchedUrl)) {
          el.src = imageCache.get(matchedUrl)!;
        } else {
          el.src = matchedUrl;
        }
      } else if (imageBaseUrl) {
        // Fallback to base URL + filename
        el.src = `${imageBaseUrl}/${fieldValue}`;
      }
    }
  }
  
  return el;
}

// ============ LAYOUT MERGE (UN-RESOLVE) ============

/**
 * Layout properties that should be transferred from edited scene to base template
 */
const LAYOUT_PROPERTIES: (keyof PolotnoElement)[] = [
  'x', 'y', 'width', 'height', 'rotation', 'opacity'
];

/**
 * Text styling properties (transferred for text elements only)
 */
const TEXT_STYLE_PROPERTIES: (keyof PolotnoElement)[] = [
  'fontSize', 'fontFamily', 'fontStyle', 'fontWeight', 'fill', 'align'
];

/**
 * Image styling properties (transferred for image elements only)
 */
const IMAGE_STYLE_PROPERTIES: (keyof PolotnoElement)[] = [
  'cropX', 'cropY', 'cropWidth', 'cropHeight'
];

/**
 * Merge layout changes from the current (resolved) scene back to the base template.
 * This preserves placeholders like {{Name}} while applying user's layout edits.
 * 
 * @param currentScene - The scene from store.toJSON() with resolved data + user layout changes
 * @param baseScene - The original template with {{placeholders}}
 * @returns A new scene with layout from currentScene but data structure from baseScene
 */
export function mergeLayoutToBase(
  currentScene: PolotnoScene,
  baseScene: PolotnoScene
): PolotnoScene {
  const merged = cloneScene(baseScene);
  
  // Build lookup map of current elements by ID (across all pages)
  const currentElementsById = new Map<string, PolotnoElement>();
  const currentPageIds = new Set<string>();
  
  for (const page of currentScene.pages) {
    currentPageIds.add(page.id);
    for (const el of page.children) {
      currentElementsById.set(el.id, el);
    }
  }
  
  // Process each page in the base template
  for (const basePage of merged.pages) {
    const currentPage = currentScene.pages.find(p => p.id === basePage.id);
    if (!currentPage) continue;
    
    // Track which base elements still exist in current scene
    const survivingElements: PolotnoElement[] = [];
    const currentElementIds = new Set(currentPage.children.map(el => el.id));
    
    // Update existing elements with layout from current scene
    for (const baseEl of basePage.children) {
      const currentEl = currentElementsById.get(baseEl.id);
      
      if (currentEl && currentElementIds.has(baseEl.id)) {
        // Element exists in both - transfer layout properties
        for (const prop of LAYOUT_PROPERTIES) {
          if (currentEl[prop] !== undefined) {
            (baseEl as any)[prop] = currentEl[prop];
          }
        }
        
        // Transfer text styling (but NOT text content - keep placeholders)
        if (baseEl.type === 'text' && currentEl.type === 'text') {
          for (const prop of TEXT_STYLE_PROPERTIES) {
            if (currentEl[prop] !== undefined) {
              (baseEl as any)[prop] = currentEl[prop];
            }
          }
          // Explicitly keep baseEl.text (which has {{placeholders}})
        }
        
        // Transfer image styling (but NOT src - keep variable binding)
        if (baseEl.type === 'image' && currentEl.type === 'image') {
          for (const prop of IMAGE_STYLE_PROPERTIES) {
            if (currentEl[prop] !== undefined) {
              (baseEl as any)[prop] = currentEl[prop];
            }
          }
          // Explicitly keep baseEl.src and baseEl.custom.variable
        }
        
        survivingElements.push(baseEl);
      }
      // If element was deleted in current scene, don't add to survivingElements
    }
    
    // Find NEW elements added by user (exist in current but not in base)
    const baseElementIds = new Set(basePage.children.map(el => el.id));
    for (const currentEl of currentPage.children) {
      if (!baseElementIds.has(currentEl.id)) {
        // New element - add to template as-is
        // User-added elements are typically static (not VDP bound)
        survivingElements.push({ ...currentEl });
      }
    }
    
    basePage.children = survivingElements;
  }
  
  // Transfer page-level properties that might have changed
  for (let i = 0; i < merged.pages.length; i++) {
    const currentPage = currentScene.pages.find(p => p.id === merged.pages[i].id);
    if (currentPage) {
      // Transfer background if changed
      if (currentPage.background !== undefined) {
        merged.pages[i].background = currentPage.background;
      }
    }
  }
  
  return merged;
}

// ============ UTILITY FUNCTIONS ============

/**
 * Apply VDP resolution to a Polotno store in-place (for preview updates)
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
 * Extract all unique field names used in a scene
 */
export function extractUsedFields(scene: PolotnoScene | string): string[] {
  const sceneObj = typeof scene === 'string' ? JSON.parse(scene) : scene;
  const fields = new Set<string>();
  
  // Updated regex to support spaces and special chars in tokens
  const placeholderRegex = /\{\{\s*([^}]+?)\s*\}\}/g;
  
  for (const page of sceneObj.pages) {
    for (const el of page.children) {
      // Check text content
      if (el.text) {
        let match;
        while ((match = placeholderRegex.exec(el.text)) !== null) {
          fields.add(match[1].trim());
        }
      }
      
      // Check custom variable binding
      if (el.custom?.variable) {
        fields.add(el.custom.variable);
      }
      
      // Check barcode field binding
      if (el.custom?.barcodeConfig?.variableField) {
        fields.add(el.custom.barcodeConfig.variableField);
      }
    }
  }
  
  return Array.from(fields);
}

/**
 * Batch resolve VDP variables for multiple records
 */
export function batchResolveVdp(
  scene: PolotnoScene | string,
  records: Record<string, string>[],
  imageBaseUrl?: string,
  projectImages?: { name: string; url: string }[]
): PolotnoScene[] {
  const sceneObj = typeof scene === 'string' ? JSON.parse(scene) : scene;
  
  return records.map((record, index) => 
    resolveVdpVariables(sceneObj, {
      record,
      recordIndex: index,
      imageBaseUrl,
      projectImages,
      useCachedImages: true,
    })
  );
}
