

# Integration Plan: VPS Vector PDF Export Service

## Summary

Your microservice at `https://pdf.jaimar.dev` is running successfully. This plan integrates it into the Lovable project to enable true **vector PDF exports** with optional **CMYK conversion**, replacing the current client-side raster export approach.

---

## Current State vs. Target State

| Aspect | Current | After Integration |
|--------|---------|-------------------|
| PDF Type | Raster (flattened images) | Vector (selectable text, paths) |
| CMYK Conversion | Client-side per-page WASM | Server-side, single final PDF |
| Export Speed | Slow for CMYK (N Ghostscript runs) | Fast (1 server call per page) |
| File Size | Large (embedded images) | Smaller (vector shapes) |
| Print Quality | Good | Professional (PDF/X-1a) |

---

## Technical Approach

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│  Lovable App (Browser)                                                      │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Polotno Editor                                                         │ │
│  │   → store.toJSON() per record                                          │ │
│  │   → resolveVdpVariables() → Scene JSON with data merged                │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │ POST /render or /batch-render
                                      │ { scene, options: { cmyk: true } }
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Your VPS: pdf.jaimar.dev                                                   │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │  @polotno/pdf-export + Ghostscript                                     │ │
│  │    jsonToPDF(scene, file, { pdfx1a: true })                            │ │
│  │    → True vector output with CMYK + transparency flatten               │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│  Returns: PDF bytes (Buffer or base64)                                      │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Lovable App                                                                │
│    → Upload PDF to Supabase Storage                                         │
│    → compose-label-sheet (for label imposition)                             │
│    → Final download                                                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## What I Will Build

### 1. Secrets Configuration

Add two secrets to the project:

| Secret Name | Value |
|-------------|-------|
| `VITE_PDF_EXPORT_SERVICE_URL` | `https://pdf.jaimar.dev` |
| `VITE_PDF_EXPORT_API_SECRET` | *(The API_SECRET you set in Coolify)* |

Note: Using `VITE_` prefix makes these available in client-side code (needed for direct browser-to-VPS calls).

### 2. New File: Vector PDF Exporter Client

**`src/lib/polotno/vectorPdfExporter.ts`**

A utility module that:
- Calls your microservice's `/render` endpoint for single PDFs
- Calls `/batch-render` for multiple scenes
- Handles authentication via `x-api-key` header
- Converts base64 responses back to Blobs
- Includes retry logic for transient failures
- Falls back to client-side raster export if microservice is unavailable

### 3. Modify: Batch Exporter

**`src/lib/polotno/pdfBatchExporter.ts`**

Changes:
- Add new export mode: `'vector'` vs `'raster'`
- Remove client-side CMYK conversion code (lines 370-430)
- Replace `exportPdf(scene)` call with `vectorExportPdf(scene, { cmyk })` when vector mode is enabled
- Pass CMYK flag to microservice instead of doing client-side conversion
- Keep existing upload and compose logic unchanged

### 4. Modify: PDF Generator Component

**`src/components/polotno/PolotnoPdfGenerator.tsx`**

Changes:
- Update `exportPdf` callback to use vector exporter when available
- Add service availability check on component mount
- Update progress messaging (remove "Converting to CMYK" phase since it's now server-side)
- Add toggle for vector vs raster export (optional, for debugging/fallback)

### 5. Modify: Editor Handle

**`src/components/polotno/hooks/usePolotnoBootstrap.ts`**

Changes:
- Update `exportResolvedPdf` method to optionally use vector export
- Add new method `exportVectorPdf(scene, options)` that calls the microservice
- Keep existing raster export as fallback

---

## Code Changes Detail

### New: `src/lib/polotno/vectorPdfExporter.ts`

```typescript
/**
 * Vector PDF Export Client
 * 
 * Calls the self-hosted pdf-export-service to generate true vector PDFs
 * with optional PDF/X-1a CMYK conversion.
 */

import type { PolotnoScene } from './types';

const SERVICE_URL = import.meta.env.VITE_PDF_EXPORT_SERVICE_URL;
const API_SECRET = import.meta.env.VITE_PDF_EXPORT_API_SECRET;

export interface VectorExportOptions {
  cmyk?: boolean;
  title?: string;
}

export interface VectorExportResult {
  success: boolean;
  blob?: Blob;
  error?: string;
}

/**
 * Check if the vector PDF service is configured and available
 */
export async function isVectorServiceAvailable(): Promise<boolean> {
  if (!SERVICE_URL || !API_SECRET) return false;
  
  try {
    const response = await fetch(`${SERVICE_URL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Export a single scene to vector PDF via the microservice
 */
export async function exportVectorPdf(
  scene: PolotnoScene,
  options: VectorExportOptions = {}
): Promise<VectorExportResult> {
  if (!SERVICE_URL || !API_SECRET) {
    return { success: false, error: 'Vector PDF service not configured' };
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
        error: errorData.error || `Service returned ${response.status}` 
      };
    }

    const blob = await response.blob();
    return { success: true, blob };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Network error' 
    };
  }
}

/**
 * Batch export multiple scenes to vector PDFs
 * Returns array of Blobs in same order as input scenes
 */
export async function batchExportVectorPdfs(
  scenes: PolotnoScene[],
  options: VectorExportOptions = {},
  onProgress?: (current: number, total: number) => void
): Promise<{ blobs: Blob[]; errors: string[] }> {
  // Implementation uses /batch-render endpoint
  // Converts base64 responses back to Blobs
  // Reports progress via callback
}
```

### Modified: `src/lib/polotno/pdfBatchExporter.ts`

Key changes to `batchExportWithPolotno()`:

```typescript
// Step 1: Export per-record PDFs
// NEW: Check if vector export is available and preferred
const useVectorExport = await isVectorServiceAvailable();

if (useVectorExport) {
  console.log('[PolotnoExport] Using vector PDF service');
  
  // Send scene JSON to microservice, get vector PDF back
  // CMYK is handled server-side, no client conversion needed
  for (let i = 0; i < records.length; i++) {
    onProgress({
      phase: 'exporting',
      current: i + 1,
      total: records.length,
      message: `Generating vector PDF ${i + 1} of ${records.length}...`,
    });

    const resolvedScene = resolveVdpVariables(parsedScene, {
      record: records[i],
      recordIndex: i,
      imageBaseUrl,
    });

    const result = await exportVectorPdf(resolvedScene, {
      cmyk: printConfig?.colorMode === 'cmyk',
    });
    
    if (!result.success || !result.blob) {
      throw new Error(result.error || 'Vector export failed');
    }
    
    pdfBlobs.push(result.blob);
  }
  
  // Skip client-side CMYK conversion entirely
  finalBlobs = pdfBlobs;
} else {
  // Fall back to existing raster export + optional client CMYK
  console.log('[PolotnoExport] Vector service unavailable, using raster export');
  // ... existing code ...
}
```

---

## What You Need to Provide

Before I can implement this, I need you to tell me the **API_SECRET** value you configured in Coolify. I'll add it as a secret in the Lovable project.

When you provide it, I will:
1. Request the secrets to be added via the secrets tool
2. Create the vector exporter module
3. Modify the batch exporter to use it
4. Update the PDF generator component

---

## Testing Plan

After implementation:

1. **Health Check**: Verify service connectivity from the app
2. **Small Job (RGB)**: Export 2-3 labels without CMYK → confirm vector output
3. **Small Job (CMYK)**: Export 2-3 labels with CMYK → confirm PDF/X-1a output
4. **Larger Job**: Export 25+ labels → confirm performance improvement
5. **Fallback**: Disable service URL → confirm raster fallback works
6. **File Size**: Compare vector vs raster PDF sizes
7. **Print Test**: Open vector PDF in Acrobat → confirm text is selectable

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Service downtime | Automatic fallback to client-side raster export |
| Large scenes | Chunk batch requests if needed |
| Slow responses | 60-second timeout with retry logic |
| Invalid scenes | Validate scene structure before sending |

---

## Next Steps

1. **You provide**: The `API_SECRET` value from your Coolify environment
2. **I will**: Request to add the secrets to the project
3. **I will**: Create the vector exporter and modify the batch pipeline
4. **You verify**: Test with a small export job

Reply with your API secret and I'll proceed with the implementation.

