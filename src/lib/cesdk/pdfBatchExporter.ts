import CreativeEditorSDK from '@cesdk/cesdk-js';
import { resolveVariables, VariableData } from './variableResolver';
import { supabase } from '@/integrations/supabase/client';
import { PrintSettings, getIccProfileForRegion } from '@/types/print-settings';
import { convertToPDFX3 } from '@imgly/plugin-print-ready-pdfs-web';

export interface BatchExportProgress {
  phase: 'exporting' | 'converting' | 'composing' | 'uploading' | 'complete' | 'error';
  current: number;
  total: number;
  message: string;
  estimatedSecondsRemaining?: number;
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

/** Print settings passed to edge function */
export interface PrintConfig {
  enablePrintMarks: boolean;
  bleedMm: number;
  cropMarkOffsetMm: number;
  // Actual trim dimensions (original template size without bleed)
  trimWidthMm?: number;
  trimHeightMm?: number;
  // Color mode for PDF output
  colorMode?: 'rgb' | 'cmyk';
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
  
  // Calculate the actual gap values
  // spacing_x_mm/spacing_y_mm are PITCH values (center-to-center), not gaps
  // Actual gap = pitch - label dimension
  const gapX = Number(template.gap_x_mm) > 0 
    ? Number(template.gap_x_mm)
    : Math.max(0, Number(template.spacing_x_mm) - Number(template.label_width_mm));

  const gapY = Number(template.gap_y_mm) > 0
    ? Number(template.gap_y_mm)
    : Math.max(0, Number(template.spacing_y_mm) - Number(template.label_height_mm));

  console.log(`📋 Using template ${template.brand} ${template.part_number}: ${template.columns}×${template.rows} layout, gaps: ${gapX.toFixed(2)}×${gapY.toFixed(2)}mm`);
  
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
    gapXMm: gapX,
    gapYMm: gapY,
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
 * Export individual PDFs from CE.SDK
 * Optionally converts to CMYK PDF/X-3 format for professional printing
 */
async function exportLabelPdfs(
  cesdk: CreativeEditorSDK,
  dataRecords: VariableData[],
  onProgress: (progress: BatchExportProgress) => void,
  docType: string = 'document',
  projectImages?: { name: string; url: string }[],
  printSettings?: PrintSettings
): Promise<ArrayBuffer[]> {
  const engine = cesdk.engine;
  const pdfBlobs: Blob[] = [];
  
  // Determine if we need CMYK conversion
  const needsCmykConversion = printSettings?.colorMode === 'cmyk';
  const iccProfile = printSettings ? getIccProfileForRegion(printSettings.region) : 'fogra39';
  
  // CRITICAL: Hide trim guide BEFORE saving archive (so it stays hidden on reload)
  // The trim guide is a visual aid only, not part of the design
  try {
    const allBlocks = engine.block.findByType('//ly.img.ubq/graphic');
    for (const blockId of allBlocks) {
      const name = engine.block.getName(blockId);
      if (name === '__trim_guide__') {
        engine.block.setVisible(blockId, false);
        console.log('🔲 Hidden trim guide before archive save');
      }
    }
  } catch (e) {
    console.warn('Could not hide trim guides:', e);
  }
  
  // Store original scene as archive (NOW includes hidden trim guide state)
  const originalArchiveBlob = await engine.scene.saveToArchive();
  
  // Time tracking for ETA estimates
  const exportStartTime = Date.now();
  let exportTimes: number[] = [];
  
  try {
    for (let i = 0; i < dataRecords.length; i++) {
      const itemStartTime = Date.now();
      const data = dataRecords[i];
      
      // Reload original scene BEFORE resolving variables (except first iteration)
      if (i > 0) {
        await loadFromArchiveBlob(engine, originalArchiveBlob);
      }
      
      // Calculate ETA based on average export time
      let estimatedSecondsRemaining: number | undefined;
      if (exportTimes.length >= 2) {
        const avgTime = exportTimes.reduce((a, b) => a + b, 0) / exportTimes.length;
        const remaining = dataRecords.length - i;
        estimatedSecondsRemaining = Math.round((avgTime * remaining) / 1000);
      }
      
      // Report progress with ETA
      onProgress({
        phase: 'exporting',
        current: i + 1,
        total: dataRecords.length,
        message: estimatedSecondsRemaining 
          ? `Exporting ${docType} ${i + 1} of ${dataRecords.length} (~${estimatedSecondsRemaining}s remaining)...`
          : `Exporting ${docType} ${i + 1} of ${dataRecords.length}...`,
        estimatedSecondsRemaining,
      });
      
      // Resolve variables with current data record (pass recordIndex for sequences, projectImages for VDP images)
      await resolveVariables(engine, data, i, projectImages);
      
      // Force engine to process variable changes (replaces unnecessary delay)
      engine.editor.addUndoStep();
      
      // Export ALL pages (supports multi-page designs like double-sided cards)
      const pages = engine.scene.getPages();
      if (pages.length > 0) {
        // Export each page separately for proper multi-page handling
        for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
          const blob = await engine.block.export(pages[pageIndex], { 
            mimeType: 'application/pdf',
            // Enable high compatibility for proper font embedding
            // This prevents text bunching/overlapping issues in the generated PDFs
            exportPdfWithHighCompatibility: true,
          });
          pdfBlobs.push(blob);
        }
        
        // Track export time for ETA calculation
        exportTimes.push(Date.now() - itemStartTime);
        // Keep only last 5 times for rolling average
        if (exportTimes.length > 5) exportTimes.shift();
        
        console.log(`Exported ${docType} ${i + 1}/${dataRecords.length} (${pages.length} pages) in ${Date.now() - itemStartTime}ms`);
      }
    }
    
    const totalTime = ((Date.now() - exportStartTime) / 1000).toFixed(1);
    console.log(`✅ Exported ${pdfBlobs.length} ${docType}s in ${totalTime}s`);
  } finally {
    // Restore original scene after all exports
    await loadFromArchiveBlob(engine, originalArchiveBlob);
  }
  
  // Convert to CMYK if requested (PDF/X-3 compliance)
  if (needsCmykConversion && pdfBlobs.length > 0) {
    // Validate blob types before conversion
    const validBlobs = pdfBlobs.filter(b => b instanceof Blob);
    if (validBlobs.length !== pdfBlobs.length) {
      console.warn(`⚠️ Some exports were not Blobs: ${pdfBlobs.length - validBlobs.length} invalid`);
    }
    
    console.log(`🎨 Starting CMYK conversion:`, {
      blobCount: validBlobs.length,
      blobSizes: validBlobs.map(b => `${(b.size / 1024).toFixed(1)}KB`),
      profile: iccProfile,
      flattenTransparency: false,
    });
    
    onProgress({
      phase: 'converting',
      current: 0,
      total: validBlobs.length,
      message: `Converting to CMYK (${iccProfile === 'gracol' ? 'GRACoL 2013' : 'FOGRA39'})...`,
    });
    
    const conversionStartTime = Date.now();
    
    try {
      // Use batch conversion for efficiency (processes sequentially internally)
      const cmykBlobs = await convertToPDFX3(validBlobs, {
        outputProfile: iccProfile,
        title: `Print-Ready ${docType}`,
        flattenTransparency: false, // Preserve visual fidelity, may not be strictly X-3 compliant
      });
      
      const conversionTime = ((Date.now() - conversionStartTime) / 1000).toFixed(1);
      console.log(`✅ CMYK conversion complete in ${conversionTime}s`);
      
      onProgress({
        phase: 'converting',
        current: validBlobs.length,
        total: validBlobs.length,
        message: 'CMYK conversion complete',
      });
      
      // Convert CMYK blobs to ArrayBuffers
      const pdfBuffers: ArrayBuffer[] = [];
      for (const blob of cmykBlobs) {
        pdfBuffers.push(await blob.arrayBuffer());
      }
      return pdfBuffers;
    } catch (cmykError: any) {
      // Enhanced error diagnostics
      const errorName = cmykError?.name || 'UnknownError';
      const errorMessage = cmykError?.message || String(cmykError);
      const errorStack = cmykError?.stack || '';
      
      console.error('⚠️ CMYK conversion failed:', {
        name: errorName,
        message: errorMessage,
        stack: errorStack,
      });
      
      // Detect common failure modes for targeted messaging
      let userMessage = '⚠️ CMYK conversion failed - using RGB instead';
      const lowerMessage = errorMessage.toLowerCase();
      const lowerStack = errorStack.toLowerCase();
      
      if (lowerMessage.includes('sharedarraybuffer') || lowerMessage.includes('cross-origin')) {
        userMessage = '⚠️ CMYK unavailable (browser security) - using RGB';
        console.warn('💡 CMYK requires Cross-Origin-Isolation headers (COOP/COEP)');
      } else if (lowerMessage.includes('.icc') || lowerStack.includes('.icc') || lowerMessage.includes('icc profile')) {
        userMessage = '⚠️ CMYK ICC profile failed to load - using RGB';
        console.warn('💡 ICC profile file not found or failed to load. Check assetsInclude config.');
      } else if (lowerMessage.includes('404') || lowerMessage.includes('not found')) {
        userMessage = '⚠️ CMYK resource missing (404) - using RGB';
        console.warn('💡 A required resource returned 404. Check network tab for details.');
      } else if (lowerMessage.includes('wasm') || lowerMessage.includes('webassembly')) {
        userMessage = '⚠️ CMYK worker failed to load - using RGB';
        console.warn('💡 Check if WASM worker is properly bundled');
      } else if (lowerMessage.includes('fetch') || lowerMessage.includes('network') || lowerMessage.includes('failed to load')) {
        userMessage = '⚠️ CMYK resources failed to load - using RGB';
      }
      
      // NOTIFY USER of fallback - don't silently fail
      onProgress({
        phase: 'converting',
        current: validBlobs.length,
        total: validBlobs.length,
        message: userMessage,
      });
      
      // Add small delay so user sees the warning
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Fall through to return RGB buffers
    }
  }
  
  // Return RGB buffers (either no conversion needed or conversion failed)
  const pdfBuffers: ArrayBuffer[] = [];
  for (const blob of pdfBlobs) {
    pdfBuffers.push(await blob.arrayBuffer());
  }
  return pdfBuffers;
}

/**
 * Upload a single PDF to temporary storage (workspace-scoped for RLS)
 */
async function uploadTempPdf(
  buffer: ArrayBuffer, 
  workspaceId: string,
  jobId: string, 
  index: number
): Promise<string> {
  // Path includes workspaceId for RLS validation
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
 * Get current user's workspace ID
 */
async function getCurrentWorkspaceId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('User not authenticated');
  }
  
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();
  
  if (error || !profile?.workspace_id) {
    throw new Error('Failed to get workspace ID');
  }
  
  return profile.workspace_id;
}

/**
 * Upload all PDFs to temp storage in batches (workspace-scoped for RLS)
 */
async function uploadPdfsToStorage(
  buffers: ArrayBuffer[],
  workspaceId: string,
  jobId: string,
  onProgress: (progress: BatchExportProgress) => void
): Promise<string[]> {
  const paths: string[] = [];
  const UPLOAD_BATCH = 5; // Upload 5 at a time
  
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
 * Send PDF paths to edge function for composition
 */
async function composeFromStorage(
  pdfPaths: string[],
  layout: AveryLayoutConfig | null,
  mergeJobId: string,
  fullPageMode: boolean,
  printConfig: PrintConfig | null,
  onProgress: (progress: BatchExportProgress) => void
): Promise<{ outputUrl: string; pageCount: number }> {
  const message = fullPageMode 
    ? (printConfig?.enablePrintMarks ? 'Adding bleed & crop marks...' : 'Merging pages...') 
    : 'Composing labels onto sheets...';
    
  onProgress({
    phase: 'composing',
    current: 0,
    total: 1,
    message,
  });

  const { data, error } = await supabase.functions.invoke('compose-label-sheet', {
    body: {
      pdfPaths,
      layout,
      mergeJobId,
      fullPageMode,
      printConfig, // Pass print configuration for bleed + crop marks
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
    averyPartNumber?: string;
    projectType?: string; // Project type for multi-page handling
    projectImages?: { name: string; url: string }[];
    printSettings?: PrintSettings; // Professional print settings
  },
  mergeJobId: string,
  onProgress: (progress: BatchExportProgress) => void
): Promise<BatchExportResult> {
  try {
    // Determine if this is full-page mode (non-label documents like certificates)
    const isFullPage = templateConfig.isFullPage;
    const docType = isFullPage ? 'page' : 'label';
    
    // Step 1: Export individual PDFs (pass projectImages for VDP image resolution, printSettings for CMYK)
    const pdfBuffers = await exportLabelPdfs(
      cesdk, 
      dataRecords, 
      onProgress, 
      docType, 
      templateConfig.projectImages,
      templateConfig.printSettings
    );
    
    if (pdfBuffers.length === 0) {
      throw new Error('No PDFs were exported');
    }

    // Step 2: Get workspace ID and upload PDFs to temp storage (workspace-scoped for RLS)
    const workspaceId = await getCurrentWorkspaceId();
    
    onProgress({
      phase: 'uploading',
      current: 0,
      total: pdfBuffers.length,
      message: `Uploading ${pdfBuffers.length} ${docType}s...`,
    });
    
    const pdfPaths = await uploadPdfsToStorage(pdfBuffers, workspaceId, mergeJobId, onProgress);

    // Step 3: Determine layout (for labels only)
    let layout: AveryLayoutConfig | null = null;
    
    if (!isFullPage) {
      if (templateConfig.averyPartNumber) {
        const dbLayout = await getLayoutFromTemplate(templateConfig.averyPartNumber);
        if (dbLayout) {
          layout = dbLayout;
        } else {
          layout = calculateAveryLayout(
            templateConfig.widthMm,
            templateConfig.heightMm,
            templateConfig.labelsPerSheet
          );
        }
      } else {
        layout = calculateAveryLayout(
          templateConfig.widthMm,
          templateConfig.heightMm,
          templateConfig.labelsPerSheet
        );
      }
    }

    // Step 4: Prepare print config for full-page mode (non-label documents)
    // CRITICAL: Pass ORIGINAL template dimensions (without bleed) as trim size
    // The exported PDF already includes bleed, so edge function needs to know actual trim size
    const printConfig: PrintConfig | null = isFullPage && templateConfig.printSettings?.enablePrintMarks
      ? {
          enablePrintMarks: true,
          bleedMm: templateConfig.printSettings.bleedMm,
          cropMarkOffsetMm: templateConfig.printSettings.cropMarkOffsetMm,
          trimWidthMm: templateConfig.widthMm,
          trimHeightMm: templateConfig.heightMm,
          colorMode: templateConfig.printSettings.colorMode,
        }
      : null;

    // Step 5: Compose on server (downloads from storage, processes in batches)
    const result = await composeFromStorage(
      pdfPaths,
      layout,
      mergeJobId,
      isFullPage,
      printConfig,
      onProgress
    );

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
