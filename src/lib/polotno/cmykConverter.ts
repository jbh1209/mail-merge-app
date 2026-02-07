/**
 * CMYK Conversion Utility
 * 
 * Sends RGB PDFs to the VPS microservice for professional CMYK conversion
 * using Ghostscript with ICC profiles (FOGRA39 for EU, GRACoL for US).
 */

export type ColorProfile = 'fogra39' | 'gracol';

export interface CmykConversionOptions {
  profile: ColorProfile;
}

// Edge function URL for CMYK conversion proxy
const EDGE_FUNCTION_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/render-vector-pdf`;

/**
 * Check if the CMYK conversion service is available
 */
export async function checkCmykServiceAvailable(): Promise<{ available: boolean; error?: string }> {
  if (!import.meta.env.VITE_SUPABASE_URL) {
    return { available: false, error: 'Backend URL not configured' };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${EDGE_FUNCTION_BASE}/health`, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      // Check if both ICC profiles are available
      if (data.profiles?.gracol && data.profiles?.fogra39) {
        console.log('[CMYK] Service available with ICC profiles');
        return { available: true };
      }
      return { available: false, error: 'ICC profiles not available on server' };
    }

    return { available: false, error: `Service returned ${response.status}` };
  } catch (err) {
    return { 
      available: false, 
      error: `Service check failed: ${err instanceof Error ? err.message : 'Network error'}` 
    };
  }
}

/**
 * Convert a single RGB PDF to CMYK via the VPS microservice
 */
export async function convertPdfToCmyk(
  pdfBlob: Blob,
  options: CmykConversionOptions
): Promise<Blob> {
  if (!import.meta.env.VITE_SUPABASE_URL) {
    throw new Error('Backend URL not configured');
  }

  console.log(`[CMYK] Converting PDF (${pdfBlob.size} bytes) with profile: ${options.profile}`);

  const response = await fetch(`${EDGE_FUNCTION_BASE}/convert-cmyk?profile=${options.profile}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/pdf',
    },
    body: pdfBlob,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `CMYK conversion failed: ${response.status}`);
  }

  const cmykBlob = await response.blob();
  const conversionTime = response.headers.get('X-Conversion-Time-Ms');
  
  console.log(`[CMYK] Conversion complete: ${cmykBlob.size} bytes in ${conversionTime || 'unknown'}ms`);
  
  return cmykBlob;
}

/**
 * Convert multiple RGB PDFs to CMYK (sequential to avoid server overload)
 */
export async function convertPdfsToCmyk(
  pdfBlobs: Blob[],
  options: CmykConversionOptions,
  onProgress?: (current: number, total: number) => void
): Promise<Blob[]> {
  const results: Blob[] = [];
  
  for (let i = 0; i < pdfBlobs.length; i++) {
    const cmykBlob = await convertPdfToCmyk(pdfBlobs[i], options);
    results.push(cmykBlob);
    onProgress?.(i + 1, pdfBlobs.length);
  }
  
  return results;
}

/**
 * Batch convert PDFs using the batch endpoint (more efficient for large batches)
 */
export async function batchConvertPdfsToCmyk(
  pdfBlobs: Blob[],
  options: CmykConversionOptions,
  onProgress?: (current: number, total: number) => void
): Promise<Blob[]> {
  if (!import.meta.env.VITE_SUPABASE_URL) {
    throw new Error('Backend URL not configured');
  }

  // For small batches, use sequential conversion
  if (pdfBlobs.length < 5) {
    return convertPdfsToCmyk(pdfBlobs, options, onProgress);
  }

  console.log(`[CMYK] Batch converting ${pdfBlobs.length} PDFs with profile: ${options.profile}`);

  // Convert blobs to base64 for batch endpoint
  const base64Pdfs = await Promise.all(
    pdfBlobs.map(async (blob) => {
      const arrayBuffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return btoa(binary);
    })
  );

  const response = await fetch(`${EDGE_FUNCTION_BASE}/batch-convert-cmyk`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      pdfs: base64Pdfs,
      profile: options.profile,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Batch CMYK conversion failed: ${response.status}`);
  }

  const data = await response.json();
  const results: Blob[] = [];

  for (const result of data.results || []) {
    if (result.success && result.data) {
      // Decode base64 back to Blob
      const binaryString = atob(result.data);
      const bytes = new Uint8Array(binaryString.length);
      for (let j = 0; j < binaryString.length; j++) {
        bytes[j] = binaryString.charCodeAt(j);
      }
      results.push(new Blob([bytes], { type: 'application/pdf' }));
    } else {
      // Push empty blob to maintain index alignment
      console.warn(`[CMYK] Conversion failed for PDF: ${result.error}`);
      results.push(new Blob([], { type: 'application/pdf' }));
    }
    onProgress?.(results.length, pdfBlobs.length);
  }

  console.log(`[CMYK] Batch complete: ${results.filter(b => b.size > 0).length}/${pdfBlobs.length} successful`);

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
