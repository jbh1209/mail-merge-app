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
    const { labelPdfs, layout, mergeJobId, fullPageMode } = await req.json();

    if (!labelPdfs || !Array.isArray(labelPdfs) || labelPdfs.length === 0) {
      throw new Error('No label PDFs provided');
    }

    if (!mergeJobId) {
      throw new Error('No merge job ID provided');
    }

    console.log(`Processing ${labelPdfs.length} labels for job ${mergeJobId}`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Process PDFs in chunks to avoid memory issues
    const CHUNK_SIZE = 25;
    let outputPdf: PDFDocument = await PDFDocument.create();
    let pageCount: number = 0;

    if (fullPageMode) {
      // Full page mode - merge PDFs in chunks
      console.log(`Full page mode: processing ${labelPdfs.length} pages in chunks of ${CHUNK_SIZE}`);
      
      for (let i = 0; i < labelPdfs.length; i += CHUNK_SIZE) {
        const chunk = labelPdfs.slice(i, i + CHUNK_SIZE);
        console.log(`Processing chunk ${Math.floor(i / CHUNK_SIZE) + 1}: ${chunk.length} pages`);
        
        for (const base64 of chunk) {
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);
          for (let j = 0; j < binary.length; j++) {
            bytes[j] = binary.charCodeAt(j);
          }
          
          const labelPdf = await PDFDocument.load(bytes);
          const pages = await outputPdf.copyPages(labelPdf, labelPdf.getPageIndices());
          pages.forEach(page => outputPdf.addPage(page));
        }
      }
      
      pageCount = outputPdf.getPageCount();
      console.log(`Full page mode: merged ${labelPdfs.length} pages total`);
    } else {
      // Label mode - decode all PDFs first, then tile onto sheets
      if (!layout) {
        throw new Error('Layout configuration required for label mode');
      }

      const labelPdfBytes: Uint8Array[] = [];
      
      for (let i = 0; i < labelPdfs.length; i += CHUNK_SIZE) {
        const chunk = labelPdfs.slice(i, i + CHUNK_SIZE);
        console.log(`Decoding chunk ${Math.floor(i / CHUNK_SIZE) + 1}: ${chunk.length} labels`);
        
        for (const base64 of chunk) {
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);
          for (let j = 0; j < binary.length; j++) {
            bytes[j] = binary.charCodeAt(j);
          }
          labelPdfBytes.push(bytes);
        }
      }

      outputPdf = await createLabelSheet(labelPdfBytes, layout as AveryLayoutConfig);
      pageCount = outputPdf.getPageCount();
      console.log(`Label mode: created ${pageCount} sheets from ${labelPdfBytes.length} labels`);
    }

    // Save the output PDF
    const outputBytes = await outputPdf.save();
    
    // Upload to storage
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

    // Store filename as output_url (get-download-url will create signed URL)
    const outputUrl = filename;

    // Update merge job
    const { error: updateError } = await supabase
      .from('merge_jobs')
      .update({
        status: 'complete',
        output_url: outputUrl,
        processed_pages: labelPdfs.length,
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
      // Get current usage and increment
      const { data: workspace } = await supabase
        .from('workspaces')
        .select('pages_used_this_month')
        .eq('id', jobData.workspace_id)
        .single();
      
      if (workspace) {
        await supabase
          .from('workspaces')
          .update({
            pages_used_this_month: (workspace.pages_used_this_month || 0) + labelPdfs.length,
          })
          .eq('id', jobData.workspace_id);
      }
    }

    console.log(`Successfully composed ${labelPdfs.length} items into ${pageCount} pages`);

    return new Response(
      JSON.stringify({
        success: true,
        outputUrl,
        pageCount,
        labelCount: labelPdfs.length,
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
      // Continue with next label
    }

    labelIndex++;
  }

  return outputPdf;
}
