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

// Database label template type
export interface LabelTemplate {
  id: string;
  brand: string;
  part_number: string;
  equivalent_to: string | null;
  paper_size: string;
  region: string;
  label_width_mm: number;
  label_height_mm: number;
  label_shape: string;
  corner_radius_mm: number;
  columns: number;
  rows: number;
  margin_left_mm: number;
  margin_top_mm: number;
  spacing_x_mm: number;
  spacing_y_mm: number;
  labels_per_sheet: number;
  gap_x_mm: number;
  gap_y_mm: number;
  description: string | null;
  categories: string[] | null;
}

/**
 * Get layout from database label template by part number
 */
export async function getLayoutFromTemplate(
  partNumber: string
): Promise<AveryLayoutConfig | null> {
  const { data, error } = await supabase
    .from('label_templates')
    .select('*')
    .eq('part_number', partNumber)
    .limit(1)
    .single();
  
  if (error || !data) {
    console.log(`No template found for part number: ${partNumber}`);
    return null;
  }
  
  const template = data as LabelTemplate;
  
  // Determine sheet size from paper_size field
  let sheetWidthMm = 215.9; // US Letter
  let sheetHeightMm = 279.4;
  
  if (template.paper_size.includes('A4')) {
    sheetWidthMm = 210;
    sheetHeightMm = 297;
  } else if (template.paper_size.includes('A5')) {
    sheetWidthMm = 148;
    sheetHeightMm = 210;
  }
  
  console.log(`📋 Using template ${template.brand} ${template.part_number}: ${template.columns}×${template.rows} layout`);
  
  // Use spacing_x_mm and spacing_y_mm for the gaps between labels (gap_x_mm/gap_y_mm have incorrect values)
  return {
    sheetWidthMm,
    sheetHeightMm,
    labelWidthMm: Number(template.label_width_mm),
    labelHeightMm: Number(template.label_height_mm),
    labelsPerSheet: template.labels_per_sheet,
    columns: template.columns,
    rows: template.rows,
    marginTopMm: Number(template.margin_top_mm),
    marginLeftMm: Number(template.margin_left_mm),
    gapXMm: Number(template.spacing_x_mm),  // Use spacing_x_mm, not gap_x_mm
    gapYMm: Number(template.spacing_y_mm),  // Use spacing_y_mm, not gap_y_mm
  };
}

/**
 * Calculate Avery layout configuration from label dimensions (fallback)
 */
export function calculateAveryLayout(
  labelWidthMm: number,
  labelHeightMm: number,
  labelsPerSheet?: number
): AveryLayoutConfig {
  // Default to US Letter size
  const sheetWidthMm = 215.9;
  const sheetHeightMm = 279.4;
  
  // Use smaller margins (10mm ~ 0.4")
  const marginMm = 10;
  const usableWidth = sheetWidthMm - marginMm * 2;
  const usableHeight = sheetHeightMm - marginMm * 2;
  
  // Calculate how many labels fit (ensure at least 1)
  const columns = Math.max(1, Math.floor(usableWidth / labelWidthMm));
  const rows = Math.max(1, Math.floor(usableHeight / labelHeightMm));
  
  console.log(`📐 Fallback layout calc: label ${labelWidthMm}×${labelHeightMm}mm, usable ${usableWidth.toFixed(1)}×${usableHeight.toFixed(1)}mm, grid ${columns}×${rows}`);
  
  // Calculate gaps to distribute remaining space
  const totalLabelsWidth = columns * labelWidthMm;
  const totalLabelsHeight = rows * labelHeightMm;
  const remainingWidth = usableWidth - totalLabelsWidth;
  const remainingHeight = usableHeight - totalLabelsHeight;
  
  // Distribute remaining space as gaps between labels
  const gapXMm = columns > 1 ? remainingWidth / (columns - 1) : 0;
  const gapYMm = rows > 1 ? remainingHeight / (rows - 1) : 0;
  
  return {
    sheetWidthMm,
    sheetHeightMm,
    labelWidthMm,
    labelHeightMm,
    labelsPerSheet: labelsPerSheet || columns * rows,
    columns,
    rows,
    marginTopMm: marginMm,
    marginLeftMm: marginMm,
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
      
      // Reload original scene BEFORE resolving variables (except first iteration)
      if (i > 0) {
        await loadFromArchiveBlob(engine, originalArchiveBlob);
      }
      
      // Report progress
      onProgress({
        phase: 'exporting',
        current: i + 1,
        total: dataRecords.length,
        message: `Exporting label ${i + 1} of ${dataRecords.length}...`,
      });
      
      // Resolve variables with current data record (pass recordIndex for sequences)
      await resolveVariables(engine, data, i);
      
      // Force engine to process variable changes
      engine.editor.addUndoStep();
      
      // Small delay to ensure variables are applied before export
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Get the first page and export as PDF
      const pages = engine.scene.getPages();
      if (pages.length > 0) {
        const blob = await engine.block.export(pages[0], { mimeType: 'application/pdf' });
        const buffer = await blob.arrayBuffer();
        pdfBuffers.push(buffer);
        console.log(`Exported label ${i + 1} with data:`, Object.keys(data));
      }
    }
  } finally {
    // Restore original scene after all exports
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
    averyPartNumber?: string; // NEW: Avery/label part number for exact layout
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
      // Labels - try to get exact layout from database first
      let layout: AveryLayoutConfig;
      
      if (templateConfig.averyPartNumber) {
        const dbLayout = await getLayoutFromTemplate(templateConfig.averyPartNumber);
        if (dbLayout) {
          layout = dbLayout;
        } else {
          // Fallback to calculated layout
          layout = calculateAveryLayout(
            templateConfig.widthMm,
            templateConfig.heightMm,
            templateConfig.labelsPerSheet
          );
        }
      } else {
        // No part number - use calculated layout
        layout = calculateAveryLayout(
          templateConfig.widthMm,
          templateConfig.heightMm,
          templateConfig.labelsPerSheet
        );
      }
      
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
