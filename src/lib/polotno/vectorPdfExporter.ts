/**
 * Vector PDF Export Client
 * 
 * Calls the self-hosted pdf-export-service to generate true vector PDFs
 * with optional PDF/X-1a CMYK conversion. This replaces client-side raster
 * export for professional print-quality output.
 */

import type { PolotnoScene } from './types';

// Read service configuration from environment
const SERVICE_URL = import.meta.env.VITE_PDF_EXPORT_SERVICE_URL as string | undefined;
const API_SECRET = import.meta.env.VITE_PDF_EXPORT_API_SECRET as string | undefined;

// =============================================================================
// TYPES
// =============================================================================

export interface VectorExportOptions {
  /** Enable CMYK conversion via PDF/X-1a (uses Ghostscript on server) */
  cmyk?: boolean;
  /** Document title for PDF metadata */
  title?: string;
}

export interface VectorExportResult {
  success: boolean;
  blob?: Blob;
  error?: string;
}

export interface BatchVectorExportResult {
  blobs: Blob[];
  errors: string[];
  successful: number;
  total: number;
}

// =============================================================================
// CONFIGURATION CHECK
// =============================================================================

/**
 * Check if the vector PDF service is configured in environment
 */
export function isVectorServiceConfigured(): boolean {
  return Boolean(SERVICE_URL && API_SECRET);
}

/**
 * Check if the vector PDF service is available and responding
 * Performs a health check with 5-second timeout
 */
export async function isVectorServiceAvailable(): Promise<boolean> {
  if (!SERVICE_URL || !API_SECRET) {
    console.log('[VectorExport] Service not configured');
    return false;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${SERVICE_URL}/health`, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    
    if (response.ok) {
      console.log('[VectorExport] Service is available');
      return true;
    }
    
    console.warn('[VectorExport] Health check failed:', response.status);
    return false;
  } catch (error) {
    console.warn('[VectorExport] Service unavailable:', error);
    return false;
  }
}

// =============================================================================
// SINGLE PDF EXPORT
// =============================================================================

/**
 * Export a single scene to vector PDF via the microservice
 * 
 * @param scene - Polotno scene JSON (with VDP already resolved)
 * @param options - Export options (cmyk, title)
 * @returns Result with PDF blob or error
 */
export async function exportVectorPdf(
  scene: PolotnoScene,
  options: VectorExportOptions = {}
): Promise<VectorExportResult> {
  if (!SERVICE_URL || !API_SECRET) {
    return { 
      success: false, 
      error: 'Vector PDF service not configured' 
    };
  }

  try {
    const response = await fetch(`${SERVICE_URL}/render`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_SECRET,
      },
      body: JSON.stringify({
        scene,
        options: {
          cmyk: options.cmyk ?? false,
          title: options.title ?? 'Export',
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.error || `Service returned ${response.status}`,
      };
    }

    const blob = await response.blob();
    return { success: true, blob };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Network error';
    console.error('[VectorExport] Export failed:', error);
    return { success: false, error: message };
  }
}

// =============================================================================
// BATCH PDF EXPORT
// =============================================================================

/**
 * Batch export multiple scenes to vector PDFs
 * 
 * Uses the /batch-render endpoint which returns base64-encoded PDFs.
 * Converts responses back to Blobs for upload.
 * 
 * @param scenes - Array of Polotno scenes (VDP resolved)
 * @param options - Export options (cmyk, title)
 * @param onProgress - Progress callback (current, total)
 * @returns Result with array of blobs and any errors
 */
export async function batchExportVectorPdfs(
  scenes: PolotnoScene[],
  options: VectorExportOptions = {},
  onProgress?: (current: number, total: number) => void
): Promise<BatchVectorExportResult> {
  if (!SERVICE_URL || !API_SECRET) {
    return {
      blobs: [],
      errors: ['Vector PDF service not configured'],
      successful: 0,
      total: scenes.length,
    };
  }

  // For large batches, use batch endpoint
  // For smaller batches (< 5), use individual calls for better error isolation
  if (scenes.length >= 5) {
    return batchExportViaEndpoint(scenes, options, onProgress);
  }

  // Individual exports for small batches
  return batchExportIndividually(scenes, options, onProgress);
}

/**
 * Export scenes individually (better error isolation for small batches)
 */
async function batchExportIndividually(
  scenes: PolotnoScene[],
  options: VectorExportOptions,
  onProgress?: (current: number, total: number) => void
): Promise<BatchVectorExportResult> {
  const blobs: Blob[] = [];
  const errors: string[] = [];

  for (let i = 0; i < scenes.length; i++) {
    const result = await exportVectorPdf(scenes[i], options);

    if (result.success && result.blob) {
      blobs.push(result.blob);
    } else {
      errors.push(`Scene ${i + 1}: ${result.error || 'Unknown error'}`);
      // Push empty blob to maintain index alignment
      blobs.push(new Blob([], { type: 'application/pdf' }));
    }

    onProgress?.(i + 1, scenes.length);
  }

  return {
    blobs,
    errors,
    successful: blobs.filter(b => b.size > 0).length,
    total: scenes.length,
  };
}

/**
 * Export scenes via batch endpoint (more efficient for larger batches)
 */
async function batchExportViaEndpoint(
  scenes: PolotnoScene[],
  options: VectorExportOptions,
  onProgress?: (current: number, total: number) => void
): Promise<BatchVectorExportResult> {
  if (!SERVICE_URL || !API_SECRET) {
    return {
      blobs: [],
      errors: ['Vector PDF service not configured'],
      successful: 0,
      total: scenes.length,
    };
  }

  try {
    console.log(`[VectorExport] Batch exporting ${scenes.length} scenes`);

    const response = await fetch(`${SERVICE_URL}/batch-render`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_SECRET,
      },
      body: JSON.stringify({
        scenes,
        options: {
          cmyk: options.cmyk ?? false,
          title: options.title ?? 'Export',
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        blobs: [],
        errors: [errorData.error || `Batch export failed: ${response.status}`],
        successful: 0,
        total: scenes.length,
      };
    }

    const data = await response.json();
    const blobs: Blob[] = [];
    const errors: string[] = [];

    // Convert base64 results back to Blobs
    for (const result of data.results || []) {
      if (result.success && result.pdf) {
        // Decode base64 to Blob
        const binaryString = atob(result.pdf);
        const bytes = new Uint8Array(binaryString.length);
        for (let j = 0; j < binaryString.length; j++) {
          bytes[j] = binaryString.charCodeAt(j);
        }
        blobs.push(new Blob([bytes], { type: 'application/pdf' }));
      } else {
        errors.push(`Scene ${result.index + 1}: ${result.error || 'Unknown error'}`);
        blobs.push(new Blob([], { type: 'application/pdf' }));
      }

      onProgress?.(blobs.length, scenes.length);
    }

    console.log(`[VectorExport] Batch complete: ${data.successful}/${data.total} successful`);

    return {
      blobs,
      errors,
      successful: data.successful ?? blobs.filter(b => b.size > 0).length,
      total: scenes.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Batch export failed';
    console.error('[VectorExport] Batch export error:', error);
    return {
      blobs: [],
      errors: [message],
      successful: 0,
      total: scenes.length,
    };
  }
}
