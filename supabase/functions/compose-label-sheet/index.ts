import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";

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

// Convert mm to PDF points (72 points per inch)
const mmToPoints = (mm: number): number => (mm / 25.4) * 72;

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pdfPaths, layout, mergeJobId, fullPageMode } = await req.json();

    if (!pdfPaths || !Array.isArray(pdfPaths) || pdfPaths.length === 0) {
      throw new Error('No PDF paths provided');
    }

    if (!mergeJobId) {
      throw new Error('No merge job ID provided');
    }

    console.log(`Processing ${pdfPaths.length} PDFs for job ${mergeJobId} (fullPageMode: ${fullPageMode})`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

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
            const labelPdf = await PDFDocument.load(bytes);
            const pages = await outputPdf.copyPages(labelPdf, labelPdf.getPageIndices());
            pages.forEach(page => outputPdf.addPage(page));
            processedCount++;
          } catch (err) {
            console.error(`Error processing ${path}:`, err);
          }
        }
      }
      
      pageCount = outputPdf.getPageCount();
      console.log(`Full page mode: merged ${processedCount} pages into ${pageCount} output pages`);
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
    
    // Upload final PDF to storage
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

    // Clean up temp files (in background)
    cleanupTempFiles(supabase, pdfPaths);

    // Store filename as output_url (get-download-url will create signed URL)
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

    // Log usage - update workspace pages used
    const { data: jobData } = await supabase
      .from('merge_jobs')
      .select('workspace_id')
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

    console.log(`Successfully composed ${processedCount} items into ${pageCount} pages`);

    return new Response(
      JSON.stringify({
        success: true,
        outputUrl,
        pageCount,
        labelCount: processedCount,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Composition error:', error);
    
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
