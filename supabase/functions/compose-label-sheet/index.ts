import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, rgb, grayscale } from "https://esm.sh/pdf-lib@1.17.1";

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
  bleedMm: number;          // 3mm or 3.175mm (1/8")
  cropMarkOffsetMm: number; // 3mm or 3.175mm (1/8")
  // Actual trim dimensions (original template size WITHOUT bleed)
  trimWidthMm?: number;
  trimHeightMm?: number;
}

// Convert mm to PDF points (72 points per inch)
const mmToPoints = (mm: number): number => (mm / 25.4) * 72;

// Crop mark settings
const CROP_MARK_LENGTH_MM = 6; // 6mm crop mark length
const CROP_MARK_STROKE_WIDTH = 0.5; // 0.5pt stroke

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
  const color = grayscale(0); // Black
  
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

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pdfPaths, layout, mergeJobId, fullPageMode, printConfig, workspaceId: requestWorkspaceId } = await req.json();

    // Initialize Supabase client early for error handling
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (!pdfPaths || !Array.isArray(pdfPaths) || pdfPaths.length === 0) {
      throw new Error('No PDF paths provided');
    }

    if (!mergeJobId) {
      throw new Error('No merge job ID provided');
    }
    
    // Get workspace ID from job if not provided
    let workspaceId = requestWorkspaceId;
    if (!workspaceId) {
      const { data: jobData } = await supabase
        .from('merge_jobs')
        .select('workspace_id')
        .eq('id', mergeJobId)
        .single();
      workspaceId = jobData?.workspace_id;
    }

    // Check if print features should be applied
    const applyPrintFeatures = fullPageMode && printConfig?.enablePrintMarks;
    if (applyPrintFeatures) {
      console.log(`Print features enabled: ${printConfig.bleedMm}mm bleed, ${printConfig.cropMarkOffsetMm}mm crop mark offset`);
    }

    // Process PDFs in small batches to manage memory
    const BATCH_SIZE = 5;
    let outputPdf: PDFDocument = await PDFDocument.create();
    let pageCount: number = 0;
    let processedCount = 0;

    if (fullPageMode) {
      // Full page mode - download and merge PDFs one batch at a time
      console.log(`Full page mode: processing ${pdfPaths.length} pages in batches of ${BATCH_SIZE}`);
      
      for (let i = 0; i < pdfPaths.length; i += BATCH_SIZE) {
        const batchPaths = pdfPaths.slice(i, i + BATCH_SIZE);
        console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batchPaths.length} pages`);
        
        for (const path of batchPaths) {
          try {
            // Download PDF from storage
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
                
                // CRITICAL: The source PDF already includes bleed (it was exported with expanded page size)
                // Use the ACTUAL trim dimensions from config (original template size without bleed)
                // If not provided, fall back to source size (backwards compat, but less accurate)
                const trimWidthPt = printConfig.trimWidthMm 
                  ? mmToPoints(printConfig.trimWidthMm) 
                  : sourceSize.width;
                const trimHeightPt = printConfig.trimHeightMm 
                  ? mmToPoints(printConfig.trimHeightMm) 
                  : sourceSize.height;
                
                // Source page size IS the bleed size (trim + bleed on all sides)
                const sourceWidth = sourceSize.width;
                const sourceHeight = sourceSize.height;
                
                // Total page = source content (with bleed) + space for crop marks
                const totalWidth = sourceWidth + (cropOffsetPt + markLengthPt) * 2;
                const totalHeight = sourceHeight + (cropOffsetPt + markLengthPt) * 2;
                
                // Create new page with room for crop marks
                const newPage = outputPdf.addPage([totalWidth, totalHeight]);
                
                // Content offset (just space for crop marks)
                const contentX = cropOffsetPt + markLengthPt;
                const contentY = cropOffsetPt + markLengthPt;
                
                // Embed and draw the source page at its full size (includes bleed)
                const [embeddedPage] = await outputPdf.embedPdf(sourcePdf, [pageIdx]);
                newPage.drawPage(embeddedPage, {
                  x: contentX,
                  y: contentY,
                  width: sourceWidth,
                  height: sourceHeight,
                });
                
                // Calculate where the TRIM edges are (center of the bleed area)
                // Trim is inset from content edges by the bleed amount
                const trimX = contentX + bleedPt;
                const trimY = contentY + bleedPt;
                
                // Draw crop marks at TRIM edges (not bleed edges)
                drawCropMarks(newPage, trimX, trimY, trimWidthPt, trimHeightPt, cropOffsetPt);
                
                // Set PDF boxes for professional printing software
                // TrimBox: The final cut size (original design size)
                newPage.setTrimBox(trimX, trimY, trimWidthPt, trimHeightPt);
                
                // BleedBox: The full content area (source size, which includes bleed)
                newPage.setBleedBox(contentX, contentY, sourceWidth, sourceHeight);
                
                // MediaBox is automatically set to full page size
                
                console.log(`Page ${pageIdx + 1}: Trim ${trimWidthPt.toFixed(1)}×${trimHeightPt.toFixed(1)}pt, Source ${sourceWidth.toFixed(1)}×${sourceHeight.toFixed(1)}pt`);
              }
            } else {
              // No print features - just copy pages directly
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
      console.log(`Full page mode: merged ${processedCount} pages into ${pageCount} output pages${applyPrintFeatures ? ' with bleed + crop marks' : ''}`);
    } else {
      // Label mode - download PDFs and tile onto sheets
      if (!layout) {
        throw new Error('Layout configuration required for label mode');
      }

      console.log(`Label mode: downloading and tiling ${pdfPaths.length} labels`);
      
      // Download all PDFs first (in batches to manage memory)
      const labelPdfBytes: Uint8Array[] = [];
      
      for (let i = 0; i < pdfPaths.length; i += BATCH_SIZE) {
        const batchPaths = pdfPaths.slice(i, i + BATCH_SIZE);
        console.log(`Downloading batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batchPaths.length} labels`);
        
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

    // Save the output PDF
    const outputBytes = await outputPdf.save();
    
    // Save to a PREDICTABLE workspace-scoped path (allows client to overwrite for CMYK)
    const storagePath = workspaceId 
      ? `${workspaceId}/outputs/${mergeJobId}.pdf`
      : `outputs/merge-${mergeJobId}-${Date.now()}.pdf`;
    
    const { error: uploadError } = await supabase.storage
      .from('generated-pdfs')
      .upload(storagePath, outputBytes, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      throw new Error(`Failed to upload PDF: ${uploadError.message}`);
    }
    
    console.log(`Saved PDF to: ${storagePath}`);

    // Clean up temp files (in background)
    cleanupTempFiles(supabase, pdfPaths);

    // Store storagePath as output_url (get-download-url will create signed URL)
    const outputUrl = storagePath;

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

    // Get job data for workspace and project updates
    const { data: jobData } = await supabase
      .from('merge_jobs')
      .select('workspace_id, project_id')
      .eq('id', mergeJobId)
      .single();

    if (jobData?.workspace_id) {
      // Update workspace pages used
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

    // Update project status to complete
    if (jobData?.project_id) {
      await supabase
        .from('projects')
        .update({ status: 'complete' })
        .eq('id', jobData.project_id);
      console.log(`Updated project ${jobData.project_id} status to complete`);
    }

    console.log(`Successfully composed ${processedCount} items into ${pageCount} pages`);

    return new Response(
      JSON.stringify({
        success: true,
        outputUrl,
        storagePath, // Return storage path for CMYK conversion
        pageCount,
        labelCount: processedCount,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Composition error:', error);
    
    // Try to update merge job and project status to error
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const errorSupabase = createClient(supabaseUrl, supabaseKey);
      
      // Extract mergeJobId from request body if possible
      const body = await req.clone().json().catch(() => ({}));
      if (body.mergeJobId) {
        // Update merge job status
        await errorSupabase
          .from('merge_jobs')
          .update({ status: 'error', error_message: error.message })
          .eq('id', body.mergeJobId);
        
        // Get project_id and update project status
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
          console.log(`Updated project ${jobData.project_id} status to error`);
        }
      }
    } catch (updateErr) {
      console.error('Failed to update error status:', updateErr);
    }
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Composition failed',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

/**
 * Clean up temporary PDF files after composition
 */
async function cleanupTempFiles(supabase: any, paths: string[]): Promise<void> {
  try {
    // Delete in batches
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
 * Create label sheets by tiling individual label PDFs onto pages
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
  
  const labelsPerSheet = layout.columns * layout.rows;
  let currentPage: ReturnType<typeof outputPdf.addPage> | null = null;
  let labelIndex = 0;

  for (const labelPdfBytes of labelPdfs) {
    // Create new page if needed
    if (labelIndex % labelsPerSheet === 0) {
      currentPage = outputPdf.addPage([sheetWidth, sheetHeight]);
    }

    if (!currentPage) continue;

    // Calculate position on current page
    const positionOnSheet = labelIndex % labelsPerSheet;
    const col = positionOnSheet % layout.columns;
    const row = Math.floor(positionOnSheet / layout.columns);

    // Calculate x, y position (PDF origin is bottom-left)
    const x = marginLeft + col * (labelWidth + gapX);
    const y = sheetHeight - marginTop - labelHeight - row * (labelHeight + gapY);

    try {
      // Load the label PDF
      const labelPdf = await PDFDocument.load(labelPdfBytes);
      const [embeddedPage] = await outputPdf.embedPdf(labelPdf, [0]);
      
      // Draw the label at the calculated position
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
