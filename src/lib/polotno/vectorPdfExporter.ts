/**
 * Vector PDF Export Client
 * 
 * Calls the edge function proxy which forwards requests to the self-hosted
 * pdf-export-service for true vector PDF generation using @polotno/pdf-export.
 * 
 * The VPS uses the official Polotno Node.js package to produce true vector PDFs
 * with native PDF/X-1a CMYK conversion (no separate Ghostscript step needed).
 */

import type { PolotnoScene } from './types';

// Edge function URL (routes through Supabase to keep API secret secure)
const EDGE_FUNCTION_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/render-vector-pdf`;

// =============================================================================
// TYPES
// =============================================================================

export interface VectorExportOptions {
  /** Enable CMYK conversion via PDF/X-1a (native in @polotno/pdf-export) */
  cmyk?: boolean;
  /** Document title for PDF metadata */
  title?: string;
  /** Enable bleed extension */
  bleed?: number;
  /** Enable crop marks */
  cropMarks?: boolean;
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
 * Check if the Supabase URL is configured (required for edge function calls)
 */
export function isVectorServiceConfigured(): boolean {
  return Boolean(import.meta.env.VITE_SUPABASE_URL);
}

/**
 * Check if the vector PDF service is available via the edge function proxy
 * Performs a health check with 5-second timeout
 */
export async function isVectorServiceAvailable(): Promise<boolean> {
  if (!import.meta.env.VITE_SUPABASE_URL) {
    console.log('[VectorExport] Supabase URL not configured');
    return false;
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
// SINGLE PDF EXPORT (uses @polotno/pdf-export on VPS)
// =============================================================================

/**
 * Export a single scene to vector PDF via the edge function proxy.
 * Uses @polotno/pdf-export on the VPS for true vector output.
 * 
 * @param scene - Polotno scene JSON (with VDP already resolved)
 * @param options - Export options (cmyk, title, bleed, cropMarks)
 * @returns Result with PDF blob or error
 */
export async function exportVectorPdf(
  scene: PolotnoScene,
  options: VectorExportOptions = {}
): Promise<VectorExportResult> {
  if (!import.meta.env.VITE_SUPABASE_URL) {
    return { 
      success: false, 
      error: 'Supabase URL not configured' 
    };
  }

  try {
    console.log('[VectorExport] Sending scene to VPS for vector rendering');
    
    const response = await fetch(`${EDGE_FUNCTION_BASE}/render-vector`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        scene,
        options: {
          cmyk: options.cmyk ?? false,
          title: options.title ?? 'Export',
          bleed: options.bleed,
          cropMarks: options.cropMarks,
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
    console.log('[VectorExport] Vector PDF received:', blob.size, 'bytes');
    return { success: true, blob };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Network error';
    console.error('[VectorExport] Export failed:', error);
    return { success: false, error: message };
  }
}

// =============================================================================
// BATCH PDF EXPORT (uses @polotno/pdf-export on VPS)
// =============================================================================

/**
 * Batch export multiple scenes to vector PDFs via the VPS.
 * 
 * Uses the /batch-render-vector endpoint which leverages @polotno/pdf-export
 * to produce true vector PDFs with optional CMYK conversion.
 * 
 * @param scenes - Array of Polotno scenes (VDP resolved)
 * @param options - Export options (cmyk, title, bleed, cropMarks)
 * @param onProgress - Progress callback (current, total)
 * @returns Result with array of blobs and any errors
 */
export async function batchExportVectorPdfs(
  scenes: PolotnoScene[],
  options: VectorExportOptions = {},
  onProgress?: (current: number, total: number) => void
): Promise<BatchVectorExportResult> {
  if (!import.meta.env.VITE_SUPABASE_URL) {
    return {
      blobs: [],
      errors: ['Supabase URL not configured'],
      successful: 0,
      total: scenes.length,
    };
  }

  // For small batches (< 5), use individual calls for better error isolation
  if (scenes.length < 5) {
    return batchExportIndividually(scenes, options, onProgress);
  }

  // For larger batches, use batch endpoint for efficiency
  return batchExportViaEndpoint(scenes, options, onProgress);
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
  try {
    console.log(`[VectorExport] Batch rendering ${scenes.length} scenes via VPS`);

    const response = await fetch(`${EDGE_FUNCTION_BASE}/batch-render-vector`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        scenes,
        options: {
          cmyk: options.cmyk ?? false,
          title: options.title ?? 'Export',
          bleed: options.bleed,
          cropMarks: options.cropMarks,
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
