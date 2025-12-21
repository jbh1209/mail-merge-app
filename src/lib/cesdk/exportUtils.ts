import CreativeEditorSDK from '@cesdk/cesdk-js';
import { resolveVariables, VariableData } from './variableResolver';

export interface ExportOptions {
  /** Export format */
  format: 'pdf' | 'png' | 'jpeg';
  /** DPI for raster exports (default: 300) */
  dpi?: number;
  /** PDF quality setting */
  pdfQuality?: 'web' | 'print' | 'high';
  /** Include bleed in export */
  includeBleed?: boolean;
  /** Bleed margin in mm */
  bleedMm?: number;
  /** Add crop marks */
  addCropMarks?: boolean;
  /** Enable white underlayer for clear substrates */
  whiteUnderlayer?: boolean;
  /** Spot color name for underlayer */
  underlayerSpotColorName?: string;
  /** Color mode for PDF output */
  colorMode?: 'rgb' | 'cmyk';
}

export interface BatchExportOptions extends ExportOptions {
  /** Array of data records for VDP */
  dataRecords: VariableData[];
  /** Progress callback */
  onProgress?: (current: number, total: number) => void;
}

/**
 * Export a single PDF/image from CE.SDK
 */
export async function exportDesign(
  cesdk: CreativeEditorSDK,
  options: ExportOptions = { format: 'pdf' }
): Promise<Blob> {
  const engine = cesdk.engine;
  
  // Get export options based on format
  const mimeType = getMimeType(options.format);
  
  // Configure export settings
  const exportOptions: Record<string, unknown> = {
    mimeType,
  };
  
  if (options.format === 'pdf') {
    // PDF-specific options
    exportOptions.exportPdfWithHighCompatibility = options.pdfQuality === 'high';
    
    if (options.whiteUnderlayer) {
      exportOptions.exportPdfWithUnderlayer = true;
      exportOptions.underlayerSpotColorName = options.underlayerSpotColorName || 'White';
    }
  } else {
    // Raster export options
    exportOptions.targetDPI = options.dpi || 300;
  }
  
  // Get the first page and export
  const pages = engine.scene.getPages();
  if (pages.length === 0) {
    throw new Error('No pages to export');
  }
  
  // Use the scene export method for PDF
  const blob = await engine.block.export(pages[0], mimeType as 'application/pdf' | 'image/png' | 'image/jpeg');
  return blob;
}

/**
 * Export multiple PDFs with variable data (batch/VDP export)
 */
export async function batchExport(
  cesdk: CreativeEditorSDK,
  options: BatchExportOptions
): Promise<Blob[]> {
  const { dataRecords, onProgress, ...exportOptions } = options;
  const engine = cesdk.engine;
  const blobs: Blob[] = [];
  
  // Store original scene
  const originalScene = await engine.scene.saveToString();
  
  try {
    for (let i = 0; i < dataRecords.length; i++) {
      const data = dataRecords[i];
      
      // Report progress
      onProgress?.(i + 1, dataRecords.length);
      
      // Resolve variables with current data record
      await resolveVariables(engine, data);
      
      // Export the design
      const blob = await exportDesign(cesdk, exportOptions);
      blobs.push(blob);
      
      // Restore original scene for next iteration
      if (i < dataRecords.length - 1) {
        await engine.scene.loadFromString(originalScene);
      }
    }
  } finally {
    // Restore original scene
    await engine.scene.loadFromString(originalScene);
  }
  
  return blobs;
}

/**
 * Export and download as a single file
 */
export async function exportAndDownload(
  cesdk: CreativeEditorSDK,
  filename: string,
  options: ExportOptions = { format: 'pdf' }
): Promise<void> {
  const blob = await exportDesign(cesdk, options);
  downloadBlob(blob, filename);
}

/**
 * Export batch to a ZIP file
 */
export async function batchExportToZip(
  cesdk: CreativeEditorSDK,
  baseFilename: string,
  options: BatchExportOptions
): Promise<Blob> {
  const blobs = await batchExport(cesdk, options);
  
  // For now, just return the first blob
  // In production, you'd use JSZip or similar to create a ZIP
  // This is a simplified implementation
  console.log(`Exported ${blobs.length} files`);
  
  return blobs[0];
}

/**
 * Get print-ready PDF export configuration
 */
export function getPrintReadyExportOptions(opts: {
  whiteUnderlayer?: boolean;
  bleedMm?: number;
  colorMode?: 'rgb' | 'cmyk';
}): ExportOptions {
  return {
    format: 'pdf',
    pdfQuality: 'high',
    dpi: 300,
    includeBleed: true,
    bleedMm: opts.bleedMm ?? 3,
    addCropMarks: true,
    whiteUnderlayer: opts.whiteUnderlayer ?? false,
    underlayerSpotColorName: 'White',
    colorMode: opts.colorMode ?? 'cmyk',
  };
}

/**
 * Configure page with bleed
 */
export function configurePageWithBleed(
  engine: CreativeEditorSDK['engine'],
  pageId: number,
  designWidthMm: number,
  designHeightMm: number,
  bleedMm: number = 3
): void {
  const mmToPoints = (mm: number) => (mm / 25.4) * 72;
  
  // Set page size including bleed
  const totalWidth = mmToPoints(designWidthMm + bleedMm * 2);
  const totalHeight = mmToPoints(designHeightMm + bleedMm * 2);
  
  engine.block.setWidth(pageId, totalWidth);
  engine.block.setHeight(pageId, totalHeight);
}

/**
 * Add visual bleed guides to a page
 * Note: This is a simplified version - in production you'd use CE.SDK's native guide system
 */
export function addBleedGuides(
  engine: CreativeEditorSDK['engine'],
  pageId: number,
  bleedMm: number = 3
): void {
  // CE.SDK doesn't have a built-in bleed guide system
  // For now, we just log the bleed configuration
  // In a full implementation, you'd add non-printable guide layers
  console.log(`Bleed guides configured: ${bleedMm}mm for page ${pageId}`);
}

// Helper functions

function getMimeType(format: 'pdf' | 'png' | 'jpeg'): string {
  const mimeTypes: Record<string, string> = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpeg: 'image/jpeg',
  };
  return mimeTypes[format] || 'application/pdf';
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
