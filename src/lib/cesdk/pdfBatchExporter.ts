import CreativeEditorSDK from '@cesdk/cesdk-js';
import { resolveVariables, VariableData } from './variableResolver';
import { supabase } from '@/integrations/supabase/client';

export interface BatchExportProgress {
  phase: 'exporting' | 'composing' | 'uploading' | 'complete' | 'error';
  current: number;
  total: number;
  message: string;
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

export interface BatchExportResult {
  success: boolean;
  outputUrl?: string;
  pageCount?: number;
  error?: string;
}

/**
 * Calculate Avery layout configuration from label template
 */
export function calculateAveryLayout(
  labelWidthMm: number,
  labelHeightMm: number,
  labelsPerSheet?: number
): AveryLayoutConfig {
  // Default to US Letter size
  const sheetWidthMm = 215.9;
  const sheetHeightMm = 279.4;
  
  // Calculate how many labels fit
  const usableWidth = sheetWidthMm - 12.7 * 2; // 0.5" margins
  const usableHeight = sheetHeightMm - 12.7 * 2;
  
  const columns = Math.floor(usableWidth / labelWidthMm);
  const rows = Math.floor(usableHeight / labelHeightMm);
  
  // Calculate gaps to center labels
  const totalLabelsWidth = columns * labelWidthMm;
  const totalLabelsHeight = rows * labelHeightMm;
  const gapXMm = columns > 1 ? (usableWidth - totalLabelsWidth) / (columns - 1) : 0;
  const gapYMm = rows > 1 ? (usableHeight - totalLabelsHeight) / (rows - 1) : 0;
  
  return {
    sheetWidthMm,
    sheetHeightMm,
    labelWidthMm,
    labelHeightMm,
    labelsPerSheet: labelsPerSheet || columns * rows,
    columns,
    rows,
    marginTopMm: 12.7,
    marginLeftMm: 12.7,
    gapXMm,
    gapYMm,
  };
}

/**
 * Helper to load scene from archive blob
 */
async function loadFromArchiveBlob(engine: CreativeEditorSDK['engine'], blob: Blob): Promise<void> {
  const objectUrl = URL.createObjectURL(blob);
  try {
    await engine.scene.loadFromArchiveURL(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Export individual label PDFs from CE.SDK in batches
 */
async function exportLabelPdfs(
  cesdk: CreativeEditorSDK,
  dataRecords: VariableData[],
  onProgress: (progress: BatchExportProgress) => void,
  batchSize: number = 25
): Promise<ArrayBuffer[]> {
  const engine = cesdk.engine;
  const pdfBuffers: ArrayBuffer[] = [];
  
  // Store original scene as archive (handles embedded assets like barcodes)
  const originalArchiveBlob = await engine.scene.saveToArchive();
  
  try {
    for (let i = 0; i < dataRecords.length; i++) {
      const data = dataRecords[i];
      
      // Report progress
      onProgress({
        phase: 'exporting',
        current: i + 1,
        total: dataRecords.length,
        message: `Exporting label ${i + 1} of ${dataRecords.length}...`,
      });
      
      // Resolve variables with current data record
      await resolveVariables(engine, data);
      
      // Get the first page and export as PDF
      const pages = engine.scene.getPages();
      if (pages.length > 0) {
        const blob = await engine.block.export(pages[0], { mimeType: 'application/pdf' });
        const buffer = await blob.arrayBuffer();
        pdfBuffers.push(buffer);
      }
      
      // Restore original scene for next iteration
      if (i < dataRecords.length - 1) {
        await loadFromArchiveBlob(engine, originalArchiveBlob);
      }
    }
  } finally {
    // Restore original scene
    await loadFromArchiveBlob(engine, originalArchiveBlob);
  }
  
  return pdfBuffers;
}

/**
 * Convert ArrayBuffers to base64 strings for transport
 */
function arrayBuffersToBase64(buffers: ArrayBuffer[]): string[] {
  return buffers.map(buffer => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  });
}

/**
 * Send PDF batches to edge function for composition
 */
async function composeLabelsOnServer(
  pdfBase64s: string[],
  layout: AveryLayoutConfig,
  mergeJobId: string,
  onProgress: (progress: BatchExportProgress) => void
): Promise<{ outputUrl: string; pageCount: number }> {
  onProgress({
    phase: 'composing',
    current: 0,
    total: 1,
    message: 'Composing labels onto sheets...',
  });

  const { data, error } = await supabase.functions.invoke('compose-label-sheet', {
    body: {
      labelPdfs: pdfBase64s,
      layout,
      mergeJobId,
    },
  });

  if (error) {
    throw new Error(`Composition failed: ${error.message}`);
  }

  if (!data?.outputUrl) {
    throw new Error('No output URL received from composition');
  }

  return {
    outputUrl: data.outputUrl,
    pageCount: data.pageCount,
  };
}

/**
 * Main batch export function for CE.SDK templates
 * Exports labels client-side, then sends to server for composition
 */
export async function batchExportWithCesdk(
  cesdk: CreativeEditorSDK,
  dataRecords: VariableData[],
  templateConfig: {
    widthMm: number;
    heightMm: number;
    labelsPerSheet?: number;
    isFullPage?: boolean;
  },
  mergeJobId: string,
  onProgress: (progress: BatchExportProgress) => void
): Promise<BatchExportResult> {
  try {
    // Step 1: Export individual label PDFs
    const pdfBuffers = await exportLabelPdfs(cesdk, dataRecords, onProgress);
    
    if (pdfBuffers.length === 0) {
      throw new Error('No PDFs were exported');
    }

    // Step 2: Convert to base64 for transport
    onProgress({
      phase: 'uploading',
      current: 0,
      total: 1,
      message: 'Preparing labels for composition...',
    });
    
    const pdfBase64s = arrayBuffersToBase64(pdfBuffers);

    // Step 3: If full-page template (certificates, etc.), just merge pages
    // If labels, tile onto sheets using Avery layout
    const isFullPage = templateConfig.isFullPage || 
      (templateConfig.widthMm >= 200 && templateConfig.heightMm >= 250);

    let result: { outputUrl: string; pageCount: number };

    if (isFullPage) {
      // Full-page documents - just merge into single PDF
      const { data, error } = await supabase.functions.invoke('compose-label-sheet', {
        body: {
          labelPdfs: pdfBase64s,
          mergeJobId,
          fullPageMode: true,
        },
      });

      if (error) throw new Error(error.message);
      result = { outputUrl: data.outputUrl, pageCount: data.pageCount };
    } else {
      // Labels - tile onto sheets
      const layout = calculateAveryLayout(
        templateConfig.widthMm,
        templateConfig.heightMm,
        templateConfig.labelsPerSheet
      );
      
      result = await composeLabelsOnServer(pdfBase64s, layout, mergeJobId, onProgress);
    }

    onProgress({
      phase: 'complete',
      current: 1,
      total: 1,
      message: 'PDF generation complete!',
    });

    return {
      success: true,
      outputUrl: result.outputUrl,
      pageCount: result.pageCount,
    };
  } catch (error: any) {
    console.error('Batch export error:', error);
    
    onProgress({
      phase: 'error',
      current: 0,
      total: 0,
      message: error.message || 'Export failed',
    });

    return {
      success: false,
      error: error.message || 'Export failed',
    };
  }
}
