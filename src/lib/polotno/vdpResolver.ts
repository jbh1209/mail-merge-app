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
/**
 * Check if a value is effectively empty (null, undefined, empty string, or literal "null"/"undefined")
 */
function isEmptyValue(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v !== 'string') return false;
  const trimmed = v.trim().toLowerCase();
  return trimmed === '' || trimmed === 'null' || trimmed === 'undefined';
}

function findRecordValue(token: string, record: Record<string, string>): string | null {
  // 1. Direct match
  if (token in record) {
    const value = record[token];
    // Treat null, undefined, empty, and "null"/"undefined" strings as empty → return empty string
    if (isEmptyValue(value)) {
      return '';
    }
    return value;
  }
  
  // 2. Normalized match
  const normalizedToken = normalizeFieldName(token);
  for (const [key, value] of Object.entries(record)) {
    if (normalizeFieldName(key) === normalizedToken) {
      // Same empty value handling
      if (isEmptyValue(value)) {
        return '';
      }
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
        // Missing token → resolve to empty string (cleaner than keeping placeholder)
        return '';
      }
      return value;
    });
    
    // Clean up empty lines and collapse multiple newlines
    el.text = el.text
      .split('\n')
      .filter(line => line.trim() !== '') // Remove empty lines
      .join('\n')
      .replace(/\n{3,}/g, '\n\n'); // Collapse 3+ newlines to 2
    
    // Log resolution for debugging (only if changed)
    if (el.text !== originalText) {
      console.log(`🔄 VDP: "${originalText.substring(0, 25)}..." → "${el.text.substring(0, 25)}..."`);
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
  for (let pageIndex = 0; pageIndex < merged.pages.length; pageIndex++) {
    const basePage = merged.pages[pageIndex];
    
    // Try ID-based matching first, then fall back to index matching
    let currentPage = currentScene.pages.find(p => p.id === basePage.id);
    
    if (!currentPage && currentScene.pages.length === merged.pages.length) {
      // Fallback: match by index when page count is same (handles ID regeneration by Polotno)
      currentPage = currentScene.pages[pageIndex];
      console.warn(`⚠️ Page ID mismatch - using index fallback for page ${pageIndex} (base: ${basePage.id?.substring(0, 8)}, current: ${currentScene.pages[pageIndex]?.id?.substring(0, 8)})`);
    }
    
    if (!currentPage) {
      console.error(`❌ Cannot match base page ${basePage.id?.substring(0, 8)} - skipping merge for this page!`);
      continue;
    }
    
    // Build lookup maps for both base and current elements
    const baseElementsById = new Map<string, PolotnoElement>();
    for (const baseEl of basePage.children) {
      baseElementsById.set(baseEl.id, baseEl);
    }
    
    const currentElementsById = new Map<string, PolotnoElement>();
    for (const currentEl of currentPage.children) {
      currentElementsById.set(currentEl.id, currentEl);
    }
    
    // CRITICAL FIX: Start with ALL base elements, then update/add from current
    // This ensures user-added elements are NEVER dropped when navigating records
    const finalElements: PolotnoElement[] = [];
    const processedIds = new Set<string>();
    
    console.log(`🔍 Merge: base has ${basePage.children.length} elements, current has ${currentPage.children.length} elements`);
    
    // First pass: Update existing base elements with current layout changes
    for (const baseEl of basePage.children) {
      const currentEl = currentElementsById.get(baseEl.id);
      
      if (currentEl) {
        // Element exists in both - update base with current layout
        for (const prop of LAYOUT_PROPERTIES) {
          if (currentEl[prop] !== undefined) {
            (baseEl as any)[prop] = currentEl[prop];
          }
        }
        
        // Transfer text styling
        if (baseEl.type === 'text' && currentEl.type === 'text') {
          for (const prop of TEXT_STYLE_PROPERTIES) {
            if (currentEl[prop] !== undefined) {
              (baseEl as any)[prop] = currentEl[prop];
            }
          }
          
          // Only preserve placeholder text if base has VDP tokens
          const hasPlaceholders = /\{\{[^}]+\}\}/.test(baseEl.text || '');
          if (!hasPlaceholders) {
            baseEl.text = currentEl.text;
          }
        }
        
        // Transfer image styling (but NOT src - keep variable binding)
        if (baseEl.type === 'image' && currentEl.type === 'image') {
          for (const prop of IMAGE_STYLE_PROPERTIES) {
            if (currentEl[prop] !== undefined) {
              (baseEl as any)[prop] = currentEl[prop];
            }
          }
          
          // Only preserve src if element has VDP variable binding
          if (!baseEl.custom?.variable) {
            baseEl.src = currentEl.src;
          }
        }
        
        finalElements.push(baseEl);
        processedIds.add(baseEl.id);
      } else {
        // Element in base but NOT in current - PRESERVE IT (critical fix!)
        // This handles user-added elements that exist in base template
        console.log(`🔒 Preserving base element not in current: ${baseEl.type} (id: ${baseEl.id?.substring(0, 8) || 'no-id'})`);
        finalElements.push({ ...baseEl });
        processedIds.add(baseEl.id);
      }
    }
    
    // Second pass: Add NEW elements from current scene (user additions during this session)
    for (const currentEl of currentPage.children) {
      if (!processedIds.has(currentEl.id)) {
        console.log(`➕ New element added to base: ${currentEl.type} (id: ${currentEl.id?.substring(0, 8) || 'no-id'})`);
        finalElements.push({ ...currentEl });
        processedIds.add(currentEl.id);
      }
    }
    
    // Z-order: Use current scene's order for elements that exist in both
    // This preserves user's "send to back/front" operations
    const currentIds = currentPage.children.map(el => el.id);
    finalElements.sort((a, b) => {
      const aIndex = currentIds.indexOf(a.id);
      const bIndex = currentIds.indexOf(b.id);
      
      if (aIndex === -1 && bIndex === -1) return 0; // Both not in current, keep relative order
      if (aIndex === -1) return -1; // a not in current, put before current elements
      if (bIndex === -1) return 1;  // b not in current, put after
      return aIndex - bIndex; // Both in current, use current order
    });
    
    console.log(`✅ Merge result: ${finalElements.length} elements (preserved ${finalElements.length - currentPage.children.length + processedIds.size} base elements)`);
    
    basePage.children = finalElements;
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
  
  // CRITICAL: Transfer root-level dimensions from current scene
  // This ensures orientation changes (portrait → landscape) are preserved in exports
  // ONLY copy if values are valid finite numbers > 0 to prevent NaN propagation
  
  const VALID_UNITS = ['mm', 'cm', 'in', 'pt', 'px'];
  
  // Width: only copy if finite and > 0
  if (Number.isFinite(currentScene.width) && currentScene.width > 0) {
    merged.width = currentScene.width;
  } else if (!Number.isFinite(merged.width) || merged.width <= 0) {
    // Base is also invalid - use a safe default (A4 width in px at 300dpi ≈ 2480)
    console.warn(`⚠️ mergeLayoutToBase: invalid width (current=${currentScene.width}, base=${merged.width}), using 2480`);
    merged.width = 2480;
  }
  
  // Height: only copy if finite and > 0
  if (Number.isFinite(currentScene.height) && currentScene.height > 0) {
    merged.height = currentScene.height;
  } else if (!Number.isFinite(merged.height) || merged.height <= 0) {
    // Base is also invalid - use a safe default (A4 height in px at 300dpi ≈ 3508)
    console.warn(`⚠️ mergeLayoutToBase: invalid height (current=${currentScene.height}, base=${merged.height}), using 3508`);
    merged.height = 3508;
  }
  
  // DPI: only copy if finite and in sane range (72-1200)
  if (Number.isFinite(currentScene.dpi) && currentScene.dpi >= 72 && currentScene.dpi <= 1200) {
    merged.dpi = currentScene.dpi;
  } else if (currentScene.dpi !== undefined) {
    // Current has invalid dpi - keep base or use 300
    console.warn(`⚠️ mergeLayoutToBase: invalid dpi (${currentScene.dpi}), using base or 300`);
    if (!Number.isFinite(merged.dpi) || merged.dpi < 72) {
      merged.dpi = 300;
    }
  }
  
  // Unit: only copy if it's a valid unit string
  if (currentScene.unit !== undefined) {
    if (VALID_UNITS.includes(currentScene.unit)) {
      merged.unit = currentScene.unit;
    } else {
      console.warn(`⚠️ mergeLayoutToBase: invalid unit (${currentScene.unit}), keeping base`);
    }
  }
  
  // Fonts: transfer if present
  if (currentScene.fonts?.length) merged.fonts = currentScene.fonts;
  
  console.log(`📐 mergeLayoutToBase: dimensions ${merged.width}×${merged.height} dpi=${merged.dpi || 'undefined'}`);
  
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
