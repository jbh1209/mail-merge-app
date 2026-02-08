/**
 * Polotno PDF Batch Exporter
 * 
 * NEW ARCHITECTURE: Multi-page export for maximum vector fidelity
 * 
 * Instead of exporting individual PDFs and merging them (which loses vector data),
 * we now:
 * 1. Resolve VDP variables for ALL records
 * 2. Combine resolved pages into a single multi-page Polotno scene
 * 3. Send the combined scene to the VPS for native multi-page PDF export
 * 4. VPS uses @polotno/pdf-export to produce a single vector PDF
 * 
 * For labels, the VPS also handles imposition (tiling onto sheets) using
 * vector-preserving tools (qpdf) instead of pdf-lib.
 * 
 * This preserves:
 * - True vector graphics (not rasterized)
 * - Native CMYK color space (PDF/X-1a)
 * - Outlined fonts as vector paths
 * - Professional print marks and bleed
 */

import { supabase } from '@/integrations/supabase/client';
import type { PolotnoScene, PolotnoPage } from './types';
import { resolveVdpVariables } from './vdpResolver';
import { 
  isVectorServiceAvailable, 
  exportMultiPagePdf,
  exportLabelsWithImposition,
  batchExportVectorPdfs,
  type AveryLayoutConfig as VectorAveryLayout,
} from './vectorPdfExporter';
import {
  sanitizePolotnoSceneForVps,
  logSanitizationReport,
  formatSanitizationForError,
} from './sceneSanitizer';

// =============================================================================
// TYPES
// =============================================================================

export interface BatchExportProgress {
  phase: 'preparing' | 'resolving' | 'exporting' | 'converting' | 'uploading' | 'composing' | 'complete' | 'error';
  current: number;
  total: number;
  message?: string;
}

export interface AveryLayoutConfig {
  sheetWidthMm: number;
  sheetHeightMm: number;
  labelWidthMm: number;
  labelHeightMm: number;
  labelsPerSheet: number;
  columns: number;
  rows: number;
  marginTopMm: number;
  marginLeftMm: number;
  gapXMm: number;
  gapYMm: number;
}

export interface PrintConfig {
  enablePrintMarks: boolean;
  bleedMm: number;
  cropMarkOffsetMm: number;
  trimWidthMm?: number;
  trimHeightMm?: number;
  colorMode?: 'rgb' | 'cmyk';
  region?: 'us' | 'eu' | 'other';
  /** When true, client-side Polotno rendered crop marks - skip server-side drawing */
  clientRenderedMarks?: boolean;
}

export interface BatchExportOptions {
  /** Base template scene JSON */
  baseScene: PolotnoScene | string;
  /** Data records to export */
  records: Record<string, string>[];
  /** Export function from Polotno store (fallback for RGB) */
  exportPdf: (scene: PolotnoScene) => Promise<Blob>;
  /** Avery layout configuration (null for full-page mode) */
  layout?: AveryLayoutConfig | null;
  /** Print configuration */
  printConfig?: PrintConfig;
  /** Merge job ID for tracking */
  mergeJobId: string;
  /** Progress callback */
  onProgress?: (progress: BatchExportProgress) => void;
  /** Image base URL for relative paths */
  imageBaseUrl?: string;
  /** Pixel ratio for export quality (default: 2) */
  pixelRatio?: number;
}

export interface BatchExportResult {
  success: boolean;
  outputUrl?: string;
  pageCount: number;
  error?: string;
  cmykApplied?: boolean;
}

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Get current user's workspace ID
 */
async function getCurrentWorkspaceId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();

  if (error || !profile?.workspace_id) {
    throw new Error('Could not determine workspace');
  }

  return profile.workspace_id;
}

/**
 * Upload a single PDF to temporary storage
 */
async function uploadTempPdf(
  buffer: ArrayBuffer,
  workspaceId: string,
  jobId: string,
  index: number
): Promise<string> {
  const filename = `${workspaceId}/temp/${jobId}/page-${index.toString().padStart(4, '0')}.pdf`;

  const { error } = await supabase.storage
    .from('generated-pdfs')
    .upload(filename, buffer, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (error) {
    throw new Error(`Failed to upload temp PDF ${index}: ${error.message}`);
  }

  return filename;
}

/**
 * Upload multiple PDFs in batches
 */
async function uploadPdfsToStorage(
  buffers: ArrayBuffer[],
  workspaceId: string,
  jobId: string,
  onProgress: (progress: BatchExportProgress) => void
): Promise<string[]> {
  const paths: string[] = [];
  const UPLOAD_BATCH = 5;

  for (let i = 0; i < buffers.length; i += UPLOAD_BATCH) {
    const batch = buffers.slice(i, i + UPLOAD_BATCH);
    const batchPromises = batch.map((buffer, idx) =>
      uploadTempPdf(buffer, workspaceId, jobId, i + idx)
    );

    const batchPaths = await Promise.all(batchPromises);
    paths.push(...batchPaths);

    onProgress({
      phase: 'uploading',
      current: paths.length,
      total: buffers.length,
      message: `Uploading ${paths.length} of ${buffers.length}...`,
    });
  }

  return paths;
}

// =============================================================================
// RETRY UTILITIES
// =============================================================================

const MAX_COMPOSE_RETRIES = 3;
const COMPOSE_TIMEOUT_MS = 60000; // 60 seconds

/**
 * Check if an error is retryable (network/timeout issues)
 */
function isRetryableError(error: unknown): boolean {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  const retryablePatterns = [
    'network',
    'timeout',
    'ECONNRESET',
    'ETIMEDOUT',
    'fetch failed',
    'Failed to fetch',
    'socket hang up',
    'ENOTFOUND',
    '502',
    '503',
    '504',
  ];
  return retryablePatterns.some(pattern => 
    message.toLowerCase().includes(pattern.toLowerCase())
  );
}

/**
 * Wrap a promise with a timeout
 */
function withTimeout<T>(promise: Promise<T>, ms: number, phase: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${phase} timed out after ${ms / 1000}s - please try again`));
    }, ms);
    
    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

/**
 * Call compose-label-sheet edge function with retry logic
 */
async function composeFromStorage(
  pdfPaths: string[],
  layout: AveryLayoutConfig | null | undefined,
  mergeJobId: string,
  fullPageMode: boolean,
  printConfig?: PrintConfig
): Promise<{ success: boolean; outputUrl?: string; pageCount?: number; cmykApplied?: boolean; error?: string }> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_COMPOSE_RETRIES; attempt++) {
    try {
      console.log(`[Compose] Attempt ${attempt}/${MAX_COMPOSE_RETRIES} for job ${mergeJobId}`);
      
      const invokePromise = supabase.functions.invoke('compose-label-sheet', {
        body: {
          pdfPaths,
          layout,
          mergeJobId,
          fullPageMode,
          printConfig,
        },
      });

      const { data, error } = await withTimeout(
        invokePromise,
        COMPOSE_TIMEOUT_MS,
        'PDF composition'
      );

      if (error) {
        lastError = error;
        console.warn(`[Compose] Attempt ${attempt} failed:`, error.message);
        
        // Don't retry auth errors
        if (error.message?.includes('auth') || error.message?.includes('401')) {
          return { success: false, error: 'Authentication failed - please refresh and try again' };
        }
        
        if (attempt < MAX_COMPOSE_RETRIES && isRetryableError(error)) {
          const delayMs = 2000 * attempt; // Exponential backoff: 2s, 4s, 6s
          console.log(`[Compose] Retrying in ${delayMs}ms...`);
          await new Promise(r => setTimeout(r, delayMs));
          continue;
        }
        
        return { success: false, error: error.message };
      }

      // Success
      console.log(`[Compose] Success on attempt ${attempt}`);
      return {
        success: data?.success ?? false,
        outputUrl: data?.outputUrl,
        pageCount: data?.pageCount ?? data?.labelCount,
        cmykApplied: data?.cmykApplied,
        error: data?.error,
      };
    } catch (error: unknown) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[Compose] Attempt ${attempt} threw:`, message);
      
      if (attempt < MAX_COMPOSE_RETRIES && isRetryableError(error)) {
        const delayMs = 2000 * attempt;
        console.log(`[Compose] Retrying in ${delayMs}ms...`);
        await new Promise(r => setTimeout(r, delayMs));
        continue;
      }
      
      return { 
        success: false, 
        error: message || 'Composition failed after retries' 
      };
    }
  }

  const finalMessage = lastError instanceof Error 
    ? lastError.message 
    : 'Composition failed after all retries';
  return { success: false, error: finalMessage };
}

// =============================================================================
// COMBINE RECORDS INTO MULTI-PAGE SCENE
// =============================================================================

/**
 * Combine all VDP-resolved records into a single multi-page Polotno scene.
 * Each record becomes one or more pages in the combined scene.
 */
function combineRecordsIntoMultiPageScene(
  baseScene: PolotnoScene,
  records: Record<string, string>[],
  imageBaseUrl: string | undefined,
  onProgress: (progress: BatchExportProgress) => void
): PolotnoScene {
  const allPages: PolotnoPage[] = [];
  
  for (let i = 0; i < records.length; i++) {
    onProgress({
      phase: 'resolving',
      current: i + 1,
      total: records.length,
      message: `Resolving record ${i + 1} of ${records.length}...`,
    });

    // Resolve VDP variables for this record
    const resolvedScene = resolveVdpVariables(baseScene, {
      record: records[i],
      recordIndex: i,
      imageBaseUrl,
    });

    // Add all pages from this record (supports multi-page per record, e.g., front/back)
    for (const page of resolvedScene.pages) {
      // Give each page a unique ID to avoid conflicts
      allPages.push({
        ...page,
        id: `${page.id}-record-${i}`,
      });
    }
  }

  console.log(`[PolotnoExport] Combined ${records.length} records into ${allPages.length} pages`);

  return {
    ...baseScene,
    pages: allPages,
  };
}

// =============================================================================
// PRINT MARKS (CLIENT-SIDE FALLBACK)
// =============================================================================

function mmToPixels(mm: number, dpi: number): number {
  return Math.round(mm * (dpi / 25.4));
}

/**
 * Some VPS builds implement crop marks server-side and may crash on malformed scenes.
 * When `printConfig.clientRenderedMarks` is true, we inject crop marks into the scene
 * on the client and disable the VPS cropMarks option to avoid that code path.
 */
function injectClientCropMarksIfNeeded(scene: PolotnoScene, printConfig?: PrintConfig): PolotnoScene {
  if (!printConfig?.enablePrintMarks || !printConfig?.clientRenderedMarks) return scene;

  const dpi = scene.dpi || 300;
  const trimWidth = scene.width;
  const trimHeight = scene.height;

  if (!Number.isFinite(trimWidth) || !Number.isFinite(trimHeight) || trimWidth <= 0 || trimHeight <= 0) {
    console.warn('[PolotnoExport] Scene dimensions invalid; skipping client crop marks');
    return scene;
  }

  const bleedPx = mmToPixels(printConfig.bleedMm ?? 0, dpi);
  const offsetPx = mmToPixels(printConfig.cropMarkOffsetMm ?? 3, dpi);
  const lengthPx = mmToPixels(10, dpi); // standard-ish 10mm crop mark length

  const strokeWidth = 0.75; // px; Polotno will scale into PDF space
  const stroke = '#000000';

  const addMarksToPage = (page: PolotnoPage, pageIndex: number): PolotnoPage => {
    const pBleed = typeof page.bleed === 'number' ? page.bleed : bleedPx;

    // Outside-trim reference points (trim sits at [0..trimWidth, 0..trimHeight])
    const leftX = -pBleed - offsetPx;
    const rightX = trimWidth + pBleed + offsetPx;
    const topY = -pBleed - offsetPx;
    const bottomY = trimHeight + pBleed + offsetPx;

    const mk = (suffix: string, el: any) => ({
      ...el,
      id: `${page.id}-cm-${pageIndex}-${suffix}`,
    });

    const marks = [
      // TL
      mk('tl-h', { type: 'line', x: leftX - lengthPx, y: topY, width: lengthPx, height: 0, stroke, strokeWidth }),
      mk('tl-v', { type: 'line', x: leftX, y: topY - lengthPx, width: 0, height: lengthPx, stroke, strokeWidth }),
      // TR
      mk('tr-h', { type: 'line', x: rightX, y: topY, width: lengthPx, height: 0, stroke, strokeWidth }),
      mk('tr-v', { type: 'line', x: rightX, y: topY - lengthPx, width: 0, height: lengthPx, stroke, strokeWidth }),
      // BL
      mk('bl-h', { type: 'line', x: leftX - lengthPx, y: bottomY, width: lengthPx, height: 0, stroke, strokeWidth }),
      mk('bl-v', { type: 'line', x: leftX, y: bottomY, width: 0, height: lengthPx, stroke, strokeWidth }),
      // BR
      mk('br-h', { type: 'line', x: rightX, y: bottomY, width: lengthPx, height: 0, stroke, strokeWidth }),
      mk('br-v', { type: 'line', x: rightX, y: bottomY, width: 0, height: lengthPx, stroke, strokeWidth }),
    ];

    // Safety: ensure all coordinates are finite
    const safeMarks = marks.filter((m) =>
      Number.isFinite(m.x) && Number.isFinite(m.y) && Number.isFinite(m.width) && Number.isFinite(m.height)
    );

    if (safeMarks.length !== marks.length) {
      console.warn('[PolotnoExport] Dropped invalid crop marks:', marks.length - safeMarks.length);
    }

    return {
      ...page,
      bleed: pBleed,
      children: [...(page.children || []), ...(safeMarks as any)],
    };
  };

  console.log('[PolotnoExport] Injecting client crop marks into scene pages');

  return {
    ...scene,
    pages: scene.pages.map(addMarksToPage),
  };
}

// =============================================================================
// MAIN EXPORT FUNCTION
// =============================================================================

/**
 * Batch export Polotno scenes to a single PDF
 * 
 * NEW FLOW (for CMYK):
 * 1. Resolve VDP variables for ALL records
 * 2. Combine into a single multi-page scene
 * 3. Send to VPS for native multi-page PDF export
 * 4. VPS returns single vector PDF (no merging needed!)
 * 
 * For labels, VPS also handles imposition with vector-preserving tools.
 */
export async function batchExportWithPolotno(
  options: BatchExportOptions
): Promise<BatchExportResult> {
  const {
    baseScene,
    records,
    exportPdf,
    layout,
    printConfig,
    mergeJobId,
    onProgress = () => {},
    imageBaseUrl,
  } = options;

  const parsedScene: PolotnoScene = typeof baseScene === 'string' 
    ? JSON.parse(baseScene) 
    : baseScene;

  const fullPageMode = !layout;
  const wantCmyk = printConfig?.colorMode === 'cmyk';

  try {
    // Step 0: Get workspace ID and check service
    onProgress({
      phase: 'preparing',
      current: 0,
      total: records.length,
      message: 'Preparing export...',
    });

    const workspaceId = await getCurrentWorkspaceId();
    console.log(`[PolotnoExport] Starting batch export for ${records.length} records (CMYK: ${wantCmyk}, fullPage: ${fullPageMode})`);

    // ==========================================================================
    // NEW: CMYK PATH - Use multi-page export for maximum vector fidelity
    // ==========================================================================
    if (wantCmyk) {
      console.log('[PolotnoExport] Using multi-page vector export for CMYK');
      
      // Check if VPS is available
      onProgress({
        phase: 'preparing',
        current: 0,
        total: records.length,
        message: 'Checking vector PDF service...',
      });

      const serviceAvailable = await isVectorServiceAvailable();
      
      if (!serviceAvailable) {
        console.warn('[PolotnoExport] Vector service unavailable, falling back to legacy flow');
        return exportWithLegacyFlow(options, parsedScene, workspaceId);
      }

      // Step 1: Combine all records into a single multi-page scene
      const combinedSceneRaw = combineRecordsIntoMultiPageScene(
        parsedScene,
        records,
        imageBaseUrl,
        onProgress
      );

      // Optional: inject crop marks client-side and avoid VPS crop-mark code path
      const sceneWithMarks = injectClientCropMarksIfNeeded(combinedSceneRaw, printConfig);
      const sendCropMarksToVps = Boolean(printConfig?.enablePrintMarks && !printConfig?.clientRenderedMarks);

      // Step 1.5: Run preflight sanitization to catch NaN/Infinity values
      onProgress({
        phase: 'preparing',
        current: records.length,
        total: records.length,
        message: 'Running preflight validation...',
      });

      const sanitizationResult = sanitizePolotnoSceneForVps(sceneWithMarks);
      logSanitizationReport(sanitizationResult);

      // Use the sanitized scene for export
      const combinedScene = sanitizationResult.sanitizedScene;

      // Surface warning if we fixed any values
      if (sanitizationResult.changedCount > 0) {
        onProgress({
          phase: 'preparing',
          current: records.length,
          total: records.length,
          message: `Preflight: fixed ${sanitizationResult.changedCount} invalid numeric value(s)`,
        });
        // Small delay so user sees the message
        await new Promise(r => setTimeout(r, 500));
      }

      // Step 2: Export via VPS (full-page or labels)
      onProgress({
        phase: 'exporting',
        current: 0,
        total: records.length,
        message: fullPageMode
          ? 'Generating vector PDF...'
          : 'Generating labels with imposition...',
      });

      let pdfBlob: Blob;
      let pageCount: number;

      if (fullPageMode) {
        // Full-page export: Single multi-page PDF
        const result = await exportMultiPagePdf(combinedScene, {
          cmyk: true,
          title: 'MergeKit Export',
          bleed: printConfig?.bleedMm,
          cropMarks: sendCropMarksToVps,
        });

        if (!result.success || !result.blob) {
          // Include preflight info in error for better diagnostics
          const preflightInfo = formatSanitizationForError(sanitizationResult);
          const errorMsg = result.error || 'Multi-page export failed';
          throw new Error(preflightInfo ? `${errorMsg} (${preflightInfo})` : errorMsg);
        }

        pdfBlob = result.blob;
        pageCount = result.pageCount || combinedScene.pages.length;
        console.log(`[PolotnoExport] Multi-page PDF complete: ${pdfBlob.size} bytes, ${pageCount} pages`);
      } else {
        // Label export: VPS handles imposition
        const result = await exportLabelsWithImposition(
          combinedScene,
          layout as VectorAveryLayout,
          {
            cmyk: true,
            title: 'Labels Export',
            bleed: printConfig?.bleedMm,
            cropMarks: sendCropMarksToVps,
          }
        );

        if (!result.success || !result.blob) {
          // Include preflight info in error for better diagnostics
          const preflightInfo = formatSanitizationForError(sanitizationResult);
          const errorMsg = result.error || 'Label export failed';
          throw new Error(preflightInfo ? `${errorMsg} (${preflightInfo})` : errorMsg);
        }

        pdfBlob = result.blob;
        pageCount = result.labelCount || combinedScene.pages.length;
        console.log(`[PolotnoExport] Label PDF complete: ${pdfBlob.size} bytes, ${pageCount} labels`);
      }

      // Step 3: Upload the single PDF directly to storage
      onProgress({
        phase: 'uploading',
        current: records.length,
        total: records.length,
        message: 'Uploading PDF...',
      });

      const filename = `${workspaceId}/${mergeJobId}/output.pdf`;
      const { error: uploadError } = await supabase.storage
        .from('generated-pdfs')
        .upload(filename, pdfBlob, {
          contentType: 'application/pdf',
          upsert: true,
        });

      if (uploadError) {
        throw new Error(`Failed to upload PDF: ${uploadError.message}`);
      }

      // Step 4: Update job status
      const { error: updateError } = await supabase
        .from('merge_jobs')
        .update({
          status: 'complete',
          output_url: filename,
          processed_pages: pageCount,
          processing_completed_at: new Date().toISOString(),
        })
        .eq('id', mergeJobId);

      if (updateError) {
        console.error('Job update error:', updateError);
      }

      // Update workspace usage
      const { data: workspace } = await supabase
        .from('workspaces')
        .select('pages_used_this_month')
        .eq('id', workspaceId)
        .single();
      
      if (workspace) {
        await supabase
          .from('workspaces')
          .update({
            pages_used_this_month: (workspace.pages_used_this_month || 0) + pageCount,
          })
          .eq('id', workspaceId);
      }

      onProgress({
        phase: 'complete',
        current: records.length,
        total: records.length,
        message: 'Export complete!',
      });

      console.log(`[PolotnoExport] CMYK export complete: ${filename}`);

      return {
        success: true,
        outputUrl: filename,
        pageCount,
        cmykApplied: true,
      };
    }

    // ==========================================================================
    // RGB PATH - Use legacy flow (client-side export + server-side merge)
    // ==========================================================================
    return exportWithLegacyFlow(options, parsedScene, workspaceId);

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Export failed';
    console.error('[PolotnoExport] Error:', error);

    onProgress({
      phase: 'error',
      current: 0,
      total: records.length,
      message,
    });

    // Update job status to error
    await supabase
      .from('merge_jobs')
      .update({
        status: 'error',
        error_message: message,
      })
      .eq('id', mergeJobId);

    return {
      success: false,
      error: message,
      pageCount: 0,
    };
  }
}

// =============================================================================
// LEGACY EXPORT FLOW (for RGB and fallback)
// =============================================================================

/**
 * Legacy export flow using individual PDF exports and server-side merging.
 * Used for RGB exports and as fallback when VPS is unavailable.
 */
async function exportWithLegacyFlow(
  options: BatchExportOptions,
  parsedScene: PolotnoScene,
  workspaceId: string
): Promise<BatchExportResult> {
  const {
    records,
    exportPdf,
    layout,
    printConfig,
    mergeJobId,
    onProgress = () => {},
    imageBaseUrl,
  } = options;

  const fullPageMode = !layout;

  console.log('[PolotnoExport] Using legacy flow (client-side export + server-side merge)');

  // Export each record individually
  const pdfBlobs: Blob[] = [];
  for (let i = 0; i < records.length; i++) {
    onProgress({
      phase: 'exporting',
      current: i + 1,
      total: records.length,
      message: `Generating PDF ${i + 1} of ${records.length}...`,
    });

    const resolvedScene = resolveVdpVariables(parsedScene, {
      record: records[i],
      recordIndex: i,
      imageBaseUrl,
    });

    const blob = await exportPdf(resolvedScene);
    pdfBlobs.push(blob);
  }

  console.log(`[PolotnoExport] Generated ${pdfBlobs.length} PDFs client-side`);

  // Convert blobs to ArrayBuffers and upload
  const buffers: ArrayBuffer[] = [];
  for (const blob of pdfBlobs) {
    buffers.push(await blob.arrayBuffer());
  }

  const pdfPaths = await uploadPdfsToStorage(
    buffers,
    workspaceId,
    mergeJobId,
    onProgress
  );

  console.log(`[PolotnoExport] Uploaded ${pdfPaths.length} PDFs to storage`);

  // Compose final PDF via edge function
  onProgress({
    phase: 'composing',
    current: records.length,
    total: records.length,
    message: 'Composing final PDF...',
  });

  const composeResult = await composeFromStorage(
    pdfPaths,
    layout,
    mergeJobId,
    fullPageMode,
    printConfig
  );

  if (!composeResult.success) {
    throw new Error(composeResult.error || 'Composition failed');
  }

  onProgress({
    phase: 'complete',
    current: records.length,
    total: records.length,
    message: 'Export complete!',
  });

  console.log(`[PolotnoExport] Legacy export complete: ${composeResult.outputUrl}`);

  return {
    success: true,
    outputUrl: composeResult.outputUrl,
    pageCount: composeResult.pageCount ?? records.length,
    cmykApplied: false,
  };
}

/**
 * Get layout configuration from database based on Avery part number
 */
export async function getLayoutFromPartNumber(
  partNumber: string
): Promise<AveryLayoutConfig | null> {
  const { data, error } = await supabase
    .from('label_templates')
    .select('*')
    .eq('part_number', partNumber)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    console.warn(`No layout found for part number: ${partNumber}`);
    return null;
  }

  // Map paper size to dimensions
  const paperSizes: Record<string, { width: number; height: number }> = {
    letter: { width: 215.9, height: 279.4 },
    a4: { width: 210, height: 297 },
  };

  const paper = paperSizes[data.paper_size.toLowerCase()] || paperSizes.letter;

  return {
    sheetWidthMm: paper.width,
    sheetHeightMm: paper.height,
    labelWidthMm: data.label_width_mm,
    labelHeightMm: data.label_height_mm,
    labelsPerSheet: data.labels_per_sheet ?? data.rows * data.columns,
    columns: data.columns,
    rows: data.rows,
    marginTopMm: data.margin_top_mm,
    marginLeftMm: data.margin_left_mm,
    // gap_x_mm and gap_y_mm are computed columns: spacing - label_size
    // Use gap values directly (already computed by database)
    gapXMm: data.gap_x_mm ?? 0,
    gapYMm: data.gap_y_mm ?? 0,
  };
}
