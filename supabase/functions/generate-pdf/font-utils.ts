// ============================================================================
// PDF GENERATION - Font Utilities
// ============================================================================
// Server-side Google Fonts fetching and embedding for PDF generation.
// Fetches TTF files directly from Google Fonts API and embeds them in PDFs.
// ============================================================================

import { PDFDocument, PDFFont } from "https://esm.sh/pdf-lib@1.17.1";

/**
 * Google Fonts API base URL for fetching font files
 */
const GOOGLE_FONTS_CSS_URL = 'https://fonts.googleapis.com/css2';

/**
 * User agent to get TTF format from Google Fonts (they serve different formats based on UA)
 */
const TTF_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

/**
 * Font weight mapping
 */
const FONT_WEIGHT_MAP: Record<string, number> = {
  'normal': 400,
  'bold': 700,
  'light': 300,
  'medium': 500,
  'semibold': 600,
  'extrabold': 800,
};

/**
 * Cache for fetched font data to avoid re-downloading
 */
const fontCache = new Map<string, Uint8Array>();

/**
 * Fetch a Google Font TTF file
 * 
 * @param fontFamily - Font family name (e.g., "Roboto", "Open Sans")
 * @param weight - Font weight (400 for normal, 700 for bold)
 * @returns Uint8Array of TTF font data
 */
export async function fetchGoogleFontTTF(
  fontFamily: string,
  weight: number = 400
): Promise<Uint8Array | null> {
  const cacheKey = `${fontFamily}-${weight}`;
  
  // Check cache first
  if (fontCache.has(cacheKey)) {
    console.log(`📦 Font cache hit: ${cacheKey}`);
    return fontCache.get(cacheKey)!;
  }
  
  try {
    console.log(`🔤 Fetching Google Font: ${fontFamily} (weight: ${weight})`);
    
    // Step 1: Fetch CSS from Google Fonts API
    const cssUrl = `${GOOGLE_FONTS_CSS_URL}?family=${encodeURIComponent(fontFamily)}:wght@${weight}&display=swap`;
    
    const cssResponse = await fetch(cssUrl, {
      headers: {
        'User-Agent': TTF_USER_AGENT
      }
    });
    
    if (!cssResponse.ok) {
      console.error(`Failed to fetch font CSS: ${cssResponse.status}`);
      return null;
    }
    
    const css = await cssResponse.text();
    
    // Step 2: Extract TTF URL from CSS
    // The CSS contains @font-face with src: url(...) format('truetype') or similar
    const urlMatch = css.match(/src:\s*url\(([^)]+)\)/);
    if (!urlMatch) {
      console.error('Could not find font URL in CSS');
      return null;
    }
    
    const fontUrl = urlMatch[1].replace(/["']/g, '');
    console.log(`📥 Downloading font from: ${fontUrl.substring(0, 60)}...`);
    
    // Step 3: Fetch the actual font file
    const fontResponse = await fetch(fontUrl);
    if (!fontResponse.ok) {
      console.error(`Failed to fetch font file: ${fontResponse.status}`);
      return null;
    }
    
    const fontData = new Uint8Array(await fontResponse.arrayBuffer());
    console.log(`✅ Font loaded: ${fontFamily} (${(fontData.length / 1024).toFixed(1)} KB)`);
    
    // Cache for future use
    fontCache.set(cacheKey, fontData);
    
    return fontData;
  } catch (error) {
    console.error(`Error fetching Google Font ${fontFamily}:`, error);
    return null;
  }
}

/**
 * Normalize font weight string to number
 */
export function normalizeWeight(weight: string | number | undefined): number {
  if (typeof weight === 'number') return weight;
  if (!weight) return 400;
  return FONT_WEIGHT_MAP[weight.toLowerCase()] || 400;
}

/**
 * Font family to use as fallback mapping
 * Maps common font names to similar available fonts
 */
const FONT_FALLBACKS: Record<string, string> = {
  'arial': 'Roboto',
  'helvetica': 'Roboto',
  'times new roman': 'Merriweather',
  'times': 'Merriweather',
  'georgia': 'Merriweather',
  'verdana': 'Open Sans',
  'tahoma': 'Open Sans',
  'trebuchet ms': 'Montserrat',
  'impact': 'Bebas Neue',
  'comic sans ms': 'Quicksand',
  'courier new': 'Roboto Mono',
  'courier': 'Roboto Mono',
};

/**
 * Normalize font family name for Google Fonts
 * Handles system font names and maps to Google Font equivalents
 */
export function normalizeFontFamily(fontFamily: string | undefined): string {
  if (!fontFamily) return 'Roboto';
  
  // Clean up font family name
  const cleaned = fontFamily.split(',')[0].trim().replace(/["']/g, '').toLowerCase();
  
  // Check for fallback mapping
  if (FONT_FALLBACKS[cleaned]) {
    return FONT_FALLBACKS[cleaned];
  }
  
  // Title case the font name for Google Fonts
  return fontFamily.split(',')[0].trim().replace(/["']/g, '')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Embedded font collection for a PDF document
 */
export interface FontCollection {
  regular: PDFFont;
  bold: PDFFont;
  // Maps fontFamily-weight to embedded font
  customFonts: Map<string, PDFFont>;
}

/**
 * Get or embed a font for a specific family and weight
 */
export async function getOrEmbedFont(
  pdfDoc: PDFDocument,
  fontCollection: FontCollection,
  fontFamily: string,
  weight: string | number = 'normal'
): Promise<PDFFont> {
  const normalizedFamily = normalizeFontFamily(fontFamily);
  const normalizedWeight = normalizeWeight(weight);
  const cacheKey = `${normalizedFamily}-${normalizedWeight}`;
  
  // Check if already embedded
  if (fontCollection.customFonts.has(cacheKey)) {
    return fontCollection.customFonts.get(cacheKey)!;
  }
  
  // Try to fetch and embed the Google Font
  const fontData = await fetchGoogleFontTTF(normalizedFamily, normalizedWeight);
  
  if (fontData) {
    try {
      const embeddedFont = await pdfDoc.embedFont(fontData);
      fontCollection.customFonts.set(cacheKey, embeddedFont);
      console.log(`✅ Embedded font: ${cacheKey}`);
      return embeddedFont;
    } catch (error) {
      console.error(`Failed to embed font ${cacheKey}:`, error);
    }
  }
  
  // Fallback to standard fonts
  console.log(`⚠️ Using fallback font for ${cacheKey}`);
  return normalizedWeight >= 600 ? fontCollection.bold : fontCollection.regular;
}

/**
 * Pre-load commonly used fonts for a document
 * Call this at the start of PDF generation to embed fonts upfront
 */
export async function preloadCommonFonts(
  pdfDoc: PDFDocument,
  fontCollection: FontCollection,
  fontFamilies: string[]
): Promise<void> {
  const uniqueFamilies = [...new Set(fontFamilies.map(normalizeFontFamily))];
  
  console.log(`🔤 Preloading ${uniqueFamilies.length} font families...`);
  
  const loadPromises = uniqueFamilies.flatMap(family => [
    getOrEmbedFont(pdfDoc, fontCollection, family, 400),
    getOrEmbedFont(pdfDoc, fontCollection, family, 700),
  ]);
  
  await Promise.all(loadPromises);
  
  console.log(`✅ Fonts preloaded: ${fontCollection.customFonts.size} variants`);
}
