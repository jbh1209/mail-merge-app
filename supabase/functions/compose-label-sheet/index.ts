import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, grayscale, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AveryLayoutConfig {
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

interface PrintConfig {
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

// Convert mm to PDF points (72 points per inch)
const mmToPoints = (mm: number): number => (mm / 25.4) * 72;

// Crop mark settings
const CROP_MARK_LENGTH_MM = 6;
const CROP_MARK_STROKE_WIDTH = 0.5;

/**
 * Draw crop marks at the four corners of the trim area
 */
function drawCropMarks(
  page: ReturnType<PDFDocument['addPage']>,
  trimX: number,
  trimY: number,
  trimWidth: number,
  trimHeight: number,
  offsetPt: number
): void {
  const markLength = mmToPoints(CROP_MARK_LENGTH_MM);
  const color = grayscale(0);
  
  // Top-left corner
  page.drawLine({
    start: { x: trimX, y: trimY + trimHeight + offsetPt },
    end: { x: trimX, y: trimY + trimHeight + offsetPt + markLength },
    thickness: CROP_MARK_STROKE_WIDTH,
    color,
  });
  page.drawLine({
    start: { x: trimX - offsetPt - markLength, y: trimY + trimHeight },
    end: { x: trimX - offsetPt, y: trimY + trimHeight },
    thickness: CROP_MARK_STROKE_WIDTH,
    color,
  });
  
  // Top-right corner
  page.drawLine({
    start: { x: trimX + trimWidth, y: trimY + trimHeight + offsetPt },
    end: { x: trimX + trimWidth, y: trimY + trimHeight + offsetPt + markLength },
    thickness: CROP_MARK_STROKE_WIDTH,
    color,
  });
  page.drawLine({
    start: { x: trimX + trimWidth + offsetPt, y: trimY + trimHeight },
    end: { x: trimX + trimWidth + offsetPt + markLength, y: trimY + trimHeight },
    thickness: CROP_MARK_STROKE_WIDTH,
    color,
  });
  
  // Bottom-left corner
  page.drawLine({
    start: { x: trimX, y: trimY - offsetPt },
    end: { x: trimX, y: trimY - offsetPt - markLength },
    thickness: CROP_MARK_STROKE_WIDTH,
    color,
  });
  page.drawLine({
    start: { x: trimX - offsetPt - markLength, y: trimY },
    end: { x: trimX - offsetPt, y: trimY },
    thickness: CROP_MARK_STROKE_WIDTH,
    color,
  });
  
  // Bottom-right corner
  page.drawLine({
    start: { x: trimX + trimWidth, y: trimY - offsetPt },
    end: { x: trimX + trimWidth, y: trimY - offsetPt - markLength },
    thickness: CROP_MARK_STROKE_WIDTH,
    color,
  });
  page.drawLine({
    start: { x: trimX + trimWidth + offsetPt, y: trimY },
    end: { x: trimX + trimWidth + offsetPt + markLength, y: trimY },
    thickness: CROP_MARK_STROKE_WIDTH,
    color,
  });
}

/**
 * Draw white masking rectangles to clip content to bleed area
 * This ensures artwork doesn't extend into the crop mark area
 */
function drawBleedMask(
  page: ReturnType<PDFDocument['addPage']>,
  bleedX: number,
  bleedY: number,
  bleedWidth: number,
  bleedHeight: number,
  totalWidth: number,
  totalHeight: number
): void {
  const white = rgb(1, 1, 1);
  
  // Left mask (from edge to bleed left)
  page.drawRectangle({
    x: 0,
    y: 0,
    width: bleedX,
    height: totalHeight,
    color: white,
  });
  
  // Right mask (from bleed right to edge)
  page.drawRectangle({
    x: bleedX + bleedWidth,
    y: 0,
    width: totalWidth - (bleedX + bleedWidth),
    height: totalHeight,
    color: white,
  });
  
  // Bottom mask (between left and right masks)
  page.drawRectangle({
    x: bleedX,
    y: 0,
    width: bleedWidth,
    height: bleedY,
    color: white,
  });
  
  // Top mask (between left and right masks)
  page.drawRectangle({
    x: bleedX,
    y: bleedY + bleedHeight,
    width: bleedWidth,
    height: totalHeight - (bleedY + bleedHeight),
    color: white,
  });
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pdfPaths, layout, mergeJobId, fullPageMode, printConfig } = await req.json();

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (!pdfPaths || !Array.isArray(pdfPaths) || pdfPaths.length === 0) {
      throw new Error('No PDF paths provided');
    }

    if (!mergeJobId) {
      throw new Error('No merge job ID provided');
    }

    // Check if print features should be applied
    // When clientRenderedMarks is true, Polotno already drew crop marks and clipped bleed
    const skipServerMarks = printConfig?.clientRenderedMarks === true;
    const applyPrintFeatures = fullPageMode && printConfig?.enablePrintMarks && !skipServerMarks;
    
    // Note: CMYK conversion now happens client-side using @imgly/plugin-print-ready-pdfs-web
    // The colorMode flag is preserved for response metadata but no server-side conversion is needed
    const cmykRequested = printConfig?.colorMode === 'cmyk';
    
    // Detailed logging
    console.log('[compose] printConfig received:', JSON.stringify(printConfig));
    console.log('[compose] skipServerMarks:', skipServerMarks, 'applyPrintFeatures:', applyPrintFeatures);
    console.log('[compose] CMYK mode:', cmykRequested ? 'enabled (client-side)' : 'disabled');
    
    if (applyPrintFeatures) {
      console.log(`Print features enabled: ${printConfig.bleedMm}mm bleed, ${printConfig.cropMarkOffsetMm}mm crop mark offset`);
    }

    // Process PDFs in small batches to manage memory
    const BATCH_SIZE = 5;
    let outputPdf: PDFDocument = await PDFDocument.create();
    let pageCount: number = 0;
    let processedCount = 0;

    if (fullPageMode) {
      // Full page mode - download and merge PDFs
      console.log(`Full page mode: processing ${pdfPaths.length} pages in batches of ${BATCH_SIZE}`);
      
      for (let i = 0; i < pdfPaths.length; i += BATCH_SIZE) {
        const batchPaths = pdfPaths.slice(i, i + BATCH_SIZE);
        console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batchPaths.length} pages`);
        
        for (const path of batchPaths) {
          try {
            const { data, error } = await supabase.storage
              .from('generated-pdfs')
              .download(path);
            
            if (error) {
              console.error(`Error downloading ${path}:`, error);
              continue;
            }
            
            const bytes = new Uint8Array(await data.arrayBuffer());
            const sourcePdf = await PDFDocument.load(bytes);
            
            if (applyPrintFeatures) {
              // Apply bleed and crop marks
              const bleedPt = mmToPoints(printConfig.bleedMm);
              const cropOffsetPt = mmToPoints(printConfig.cropMarkOffsetMm);
              const markLengthPt = mmToPoints(CROP_MARK_LENGTH_MM);
              
              for (let pageIdx = 0; pageIdx < sourcePdf.getPageCount(); pageIdx++) {
                const sourcePage = sourcePdf.getPage(pageIdx);
                const sourceSize = sourcePage.getSize();
                
                const trimWidthPt = printConfig.trimWidthMm 
                  ? mmToPoints(printConfig.trimWidthMm) 
                  : sourceSize.width;
                const trimHeightPt = printConfig.trimHeightMm 
                  ? mmToPoints(printConfig.trimHeightMm) 
                  : sourceSize.height;
                
                const sourceWidth = sourceSize.width;
                const sourceHeight = sourceSize.height;
                
                const totalWidth = sourceWidth + (cropOffsetPt + markLengthPt) * 2;
                const totalHeight = sourceHeight + (cropOffsetPt + markLengthPt) * 2;
                
                const newPage = outputPdf.addPage([totalWidth, totalHeight]);
                
                const contentX = cropOffsetPt + markLengthPt;
                const contentY = cropOffsetPt + markLengthPt;
                
                const [embeddedPage] = await outputPdf.embedPdf(sourcePdf, [pageIdx]);
                newPage.drawPage(embeddedPage, {
                  x: contentX,
                  y: contentY,
                  width: sourceWidth,
                  height: sourceHeight,
                });
                
                // Draw white mask to clip artwork to bleed area (prevents overflow into crop mark area)
                drawBleedMask(
                  newPage,
                  contentX,      // bleedX
                  contentY,      // bleedY
                  sourceWidth,   // bleedWidth
                  sourceHeight,  // bleedHeight
                  totalWidth,
                  totalHeight
                );
                
                const trimX = contentX + bleedPt;
                const trimY = contentY + bleedPt;
                
                // Draw crop marks on top of the mask
                drawCropMarks(newPage, trimX, trimY, trimWidthPt, trimHeightPt, cropOffsetPt);
                
                newPage.setTrimBox(trimX, trimY, trimWidthPt, trimHeightPt);
                newPage.setBleedBox(contentX, contentY, sourceWidth, sourceHeight);
                
                console.log(`Page ${pageIdx + 1}: Trim ${trimWidthPt.toFixed(1)}×${trimHeightPt.toFixed(1)}pt`);
              }
            } else {
              const pages = await outputPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());
              pages.forEach(page => outputPdf.addPage(page));
            }
            
            processedCount++;
          } catch (err) {
            console.error(`Error processing ${path}:`, err);
          }
        }
      }
      
      pageCount = outputPdf.getPageCount();
      console.log(`Full page mode: merged ${processedCount} pages into ${pageCount} output pages`);
    } else {
      // Label mode - tile onto sheets
      if (!layout) {
        throw new Error('Layout configuration required for label mode');
      }

      console.log(`Label mode: downloading and tiling ${pdfPaths.length} labels`);
      
      const labelPdfBytes: Uint8Array[] = [];
      
      for (let i = 0; i < pdfPaths.length; i += BATCH_SIZE) {
        const batchPaths = pdfPaths.slice(i, i + BATCH_SIZE);
        
        for (const path of batchPaths) {
          try {
            const { data, error } = await supabase.storage
              .from('generated-pdfs')
              .download(path);
            
            if (error) {
              console.error(`Error downloading ${path}:`, error);
              continue;
            }
            
            const bytes = new Uint8Array(await data.arrayBuffer());
            labelPdfBytes.push(bytes);
          } catch (err) {
            console.error(`Error downloading ${path}:`, err);
          }
        }
      }

      outputPdf = await createLabelSheet(labelPdfBytes, layout as AveryLayoutConfig);
      pageCount = outputPdf.getPageCount();
      processedCount = labelPdfBytes.length;
      console.log(`Label mode: created ${pageCount} sheets from ${processedCount} labels`);
    }

    // Save the composed PDF
    // Note: CMYK conversion now happens client-side, so PDFs arrive already converted if requested
    const outputBytes = await outputPdf.save();
    
    // cmykApplied reflects whether the client requested CMYK mode (conversion happens client-side)
    const cmykApplied = cmykRequested;
    
    // Upload final PDF
    const filename = `merge-${mergeJobId}-${Date.now()}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from('generated-pdfs')
      .upload(filename, outputBytes, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      throw new Error(`Failed to upload PDF: ${uploadError.message}`);
    }

    // Clean up temp files
    cleanupTempFiles(supabase, pdfPaths);

    const outputUrl = filename;

    // Update merge job
    const { error: updateError } = await supabase
      .from('merge_jobs')
      .update({
        status: 'complete',
        output_url: outputUrl,
        processed_pages: processedCount,
        processing_completed_at: new Date().toISOString(),
      })
      .eq('id', mergeJobId);

    if (updateError) {
      console.error('Job update error:', updateError);
    }

    // Update workspace and project
    const { data: jobData } = await supabase
      .from('merge_jobs')
      .select('workspace_id, project_id')
      .eq('id', mergeJobId)
      .single();

    if (jobData?.workspace_id) {
      const { data: workspace } = await supabase
        .from('workspaces')
        .select('pages_used_this_month')
        .eq('id', jobData.workspace_id)
        .single();
      
      if (workspace) {
        await supabase
          .from('workspaces')
          .update({
            pages_used_this_month: (workspace.pages_used_this_month || 0) + processedCount,
          })
          .eq('id', jobData.workspace_id);
      }
    }

    if (jobData?.project_id) {
      await supabase
        .from('projects')
        .update({ status: 'complete' })
        .eq('id', jobData.project_id);
    }

    console.log(`Successfully composed ${processedCount} items (CMYK: ${cmykApplied})`);

    return new Response(
      JSON.stringify({
        success: true,
        outputUrl,
        pageCount,
        labelCount: processedCount,
        cmykApplied,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Composition error:', error);
    
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const errorSupabase = createClient(supabaseUrl, supabaseKey);
      
      const body = await req.clone().json().catch(() => ({}));
      if (body.mergeJobId) {
        await errorSupabase
          .from('merge_jobs')
          .update({ status: 'error', error_message: error.message })
          .eq('id', body.mergeJobId);
        
        const { data: jobData } = await errorSupabase
          .from('merge_jobs')
          .select('project_id')
          .eq('id', body.mergeJobId)
          .single();
        
        if (jobData?.project_id) {
          await errorSupabase
            .from('projects')
            .update({ status: 'error' })
            .eq('id', jobData.project_id);
        }
      }
    } catch (updateErr) {
      console.error('Failed to update error status:', updateErr);
    }
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Composition failed',
        cmykApplied: false,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

/**
 * Clean up temporary PDF files
 */
async function cleanupTempFiles(supabase: any, paths: string[]): Promise<void> {
  try {
    const CLEANUP_BATCH = 10;
    for (let i = 0; i < paths.length; i += CLEANUP_BATCH) {
      const batch = paths.slice(i, i + CLEANUP_BATCH);
      await supabase.storage.from('generated-pdfs').remove(batch);
    }
    console.log(`Cleaned up ${paths.length} temp files`);
  } catch (err) {
    console.error('Cleanup error (non-fatal):', err);
  }
}

/**
 * Create label sheets by tiling individual label PDFs
 */
async function createLabelSheet(
  labelPdfs: Uint8Array[],
  layout: AveryLayoutConfig
): Promise<PDFDocument> {
  const outputPdf = await PDFDocument.create();
  
  const sheetWidth = mmToPoints(layout.sheetWidthMm);
  const sheetHeight = mmToPoints(layout.sheetHeightMm);
  const labelWidth = mmToPoints(layout.labelWidthMm);
  const labelHeight = mmToPoints(layout.labelHeightMm);
  const marginLeft = mmToPoints(layout.marginLeftMm);
  const marginTop = mmToPoints(layout.marginTopMm);
  const gapX = mmToPoints(layout.gapXMm);
  const gapY = mmToPoints(layout.gapYMm);
  
  // Validate layout fits on sheet - critical for millimeter-accurate positioning
  const totalWidth = marginLeft + layout.columns * labelWidth + (layout.columns - 1) * gapX;
  const totalHeight = marginTop + layout.rows * labelHeight + (layout.rows - 1) * gapY;
  
  console.log(`📐 Layout validation: ${layout.columns}×${layout.rows} labels, label=${layout.labelWidthMm}×${layout.labelHeightMm}mm, gap=${layout.gapXMm}×${layout.gapYMm}mm`);
  console.log(`📐 Content size: ${(totalWidth / 2.83465).toFixed(1)}×${(totalHeight / 2.83465).toFixed(1)}mm on ${layout.sheetWidthMm}×${layout.sheetHeightMm}mm sheet`);
  
  if (totalWidth > sheetWidth) {
    console.error(`⚠️ Layout overflow X! Content ${(totalWidth / 2.83465).toFixed(1)}mm exceeds sheet width ${layout.sheetWidthMm}mm`);
  }
  if (totalHeight > sheetHeight) {
    console.error(`⚠️ Layout overflow Y! Content ${(totalHeight / 2.83465).toFixed(1)}mm exceeds sheet height ${layout.sheetHeightMm}mm`);
  }
  
  const labelsPerSheet = layout.columns * layout.rows;
  let currentPage: ReturnType<typeof outputPdf.addPage> | null = null;
  let labelIndex = 0;

  for (const labelPdfBytes of labelPdfs) {
    if (labelIndex % labelsPerSheet === 0) {
      currentPage = outputPdf.addPage([sheetWidth, sheetHeight]);
    }

    if (!currentPage) continue;

    const positionOnSheet = labelIndex % labelsPerSheet;
    const col = positionOnSheet % layout.columns;
    const row = Math.floor(positionOnSheet / layout.columns);

    const x = marginLeft + col * (labelWidth + gapX);
    const y = sheetHeight - marginTop - labelHeight - row * (labelHeight + gapY);

    try {
      const labelPdf = await PDFDocument.load(labelPdfBytes);
      const [embeddedPage] = await outputPdf.embedPdf(labelPdf, [0]);
      
      currentPage.drawPage(embeddedPage, {
        x,
        y,
        width: labelWidth,
        height: labelHeight,
      });
    } catch (embedError) {
      console.error(`Error embedding label ${labelIndex}:`, embedError);
    }

    labelIndex++;
  }

  return outputPdf;
}
