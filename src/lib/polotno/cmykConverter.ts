/**
 * Client-Side CMYK Conversion Utility
 * 
 * Uses @imgly/plugin-print-ready-pdfs-web for browser-based PDF/X-3 conversion
 * with professional ICC profiles (FOGRA39 for EU, GRACoL for US).
 * 
 * This eliminates the need for external API services like pdfRest.
 */

import { convertToPDFX3 } from '@imgly/plugin-print-ready-pdfs-web';

export type ColorProfile = 'fogra39' | 'gracol' | 'srgb';

export interface CmykConversionOptions {
  profile: ColorProfile;
  title?: string;
  flattenTransparency?: boolean;
}

/**
 * Convert a single RGB PDF to CMYK PDF/X-3
 */
export async function convertPdfToCmyk(
  pdfBlob: Blob,
  options: CmykConversionOptions
): Promise<Blob> {
  return convertToPDFX3(pdfBlob, {
    outputProfile: options.profile,
    title: options.title ?? 'Print-Ready Export',
    flattenTransparency: options.flattenTransparency ?? true,
  });
}

/**
 * Convert multiple RGB PDFs to CMYK PDF/X-3 (sequential processing)
 * Sequential to avoid overwhelming WASM memory
 */
export async function convertPdfsToCmyk(
  pdfBlobs: Blob[],
  options: CmykConversionOptions,
  onProgress?: (current: number, total: number) => void
): Promise<Blob[]> {
  const results: Blob[] = [];
  
  for (let i = 0; i < pdfBlobs.length; i++) {
    const cmykBlob = await convertToPDFX3(pdfBlobs[i], {
      outputProfile: options.profile,
      title: options.title ?? 'Print-Ready Export',
      flattenTransparency: options.flattenTransparency ?? true,
    });
    results.push(cmykBlob);
    onProgress?.(i + 1, pdfBlobs.length);
  }
  
  return results;
}

/**
 * Get the appropriate color profile based on region
 * - FOGRA39 for EU (ISO coated v2)
 * - GRACoL for US (commercial printing)
 */
export function getProfileForRegion(region: 'US' | 'EU' | 'us' | 'eu' | string): ColorProfile {
  return region.toLowerCase() === 'eu' ? 'fogra39' : 'gracol';
}
