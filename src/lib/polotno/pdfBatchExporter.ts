/**
 * Polotno PDF Batch Exporter
 * 
 * Exports multiple VDP-resolved labels to a single PDF, following the same
 * pipeline as the CESDK exporter:
 * 1. Export per-record PDFs client-side
 * 2. Upload to temporary storage
 * 3. Invoke compose-label-sheet edge function for final merging
 */

import { supabase } from '@/integrations/supabase/client';
import type { PolotnoScene } from './types';
import { resolveVdpVariables } from './vdpResolver';

// =============================================================================
// TYPES
// =============================================================================

export interface BatchExportProgress {
  phase: 'preparing' | 'exporting' | 'uploading' | 'composing' | 'complete' | 'error';
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
}

export interface BatchExportOptions {
  /** Base template scene JSON */
  baseScene: PolotnoScene | string;
  /** Data records to export */
  records: Record<string, string>[];
  /** Export function from Polotno store */
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

/**
 * Call compose-label-sheet edge function
 */
async function composeFromStorage(
  pdfPaths: string[],
  layout: AveryLayoutConfig | null | undefined,
  mergeJobId: string,
  fullPageMode: boolean,
  printConfig?: PrintConfig
): Promise<{ success: boolean; outputUrl?: string; pageCount?: number; cmykApplied?: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke('compose-label-sheet', {
    body: {
      pdfPaths,
      layout,
      mergeJobId,
      fullPageMode,
      printConfig,
    },
  });

  if (error) {
    console.error('Compose function error:', error);
    return { success: false, error: error.message };
  }

  return {
    success: data?.success ?? false,
    outputUrl: data?.outputUrl,
    pageCount: data?.pageCount ?? data?.labelCount,
    cmykApplied: data?.cmykApplied,
    error: data?.error,
  };
}

// =============================================================================
// MAIN EXPORT FUNCTION
// =============================================================================

/**
 * Batch export Polotno scenes to a single PDF
 * 
 * This function orchestrates the full export pipeline:
 * 1. Resolve VDP variables for each record
 * 2. Export each resolved scene as a PDF blob
 * 3. Upload PDFs to temporary storage
 * 4. Invoke compose-label-sheet to merge into final output
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

  try {
    // Step 0: Get workspace ID
    onProgress({
      phase: 'preparing',
      current: 0,
      total: records.length,
      message: 'Preparing export...',
    });

    const workspaceId = await getCurrentWorkspaceId();
    console.log(`[PolotnoExport] Starting batch export for ${records.length} records`);

    // Step 1: Export per-record PDFs
    const pdfBlobs: Blob[] = [];

    for (let i = 0; i < records.length; i++) {
      onProgress({
        phase: 'exporting',
        current: i + 1,
        total: records.length,
        message: `Generating label ${i + 1} of ${records.length}...`,
      });

      // Resolve VDP variables for this record
      const resolvedScene = resolveVdpVariables(parsedScene, {
        record: records[i],
        recordIndex: i,
        imageBaseUrl,
      });

      // Export to PDF using Polotno
      const blob = await exportPdf(resolvedScene);
      pdfBlobs.push(blob);
    }

    console.log(`[PolotnoExport] Generated ${pdfBlobs.length} PDFs`);

    // Step 2: Convert blobs to ArrayBuffers and upload
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

    // Step 3: Compose final PDF
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

    console.log(`[PolotnoExport] Export complete: ${composeResult.outputUrl}`);

    return {
      success: true,
      outputUrl: composeResult.outputUrl,
      pageCount: composeResult.pageCount ?? records.length,
      cmykApplied: composeResult.cmykApplied,
    };
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
