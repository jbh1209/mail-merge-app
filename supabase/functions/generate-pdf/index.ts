// ============================================================================
// PDF GENERATION - Main Handler
// ============================================================================
// Print-grade PDF generation with:
// - Google Fonts server-side embedding
// - Bleed, crop marks, and proper PDF boxes
// - WYSIWYG rendering matching the canvas editor
// ============================================================================

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

import { 
  FontCollection, 
  getOrEmbedFont, 
  preloadCommonFonts,
  normalizeFontFamily 
} from "./font-utils.ts";

import {
  PrintConfig,
  DEFAULT_PRINT_CONFIG,
  createPrintReadyPage,
  shouldApplyPrintFeatures,
  drawCropMarks
} from "./print-features.ts";

import {
  renderTextField,
  renderBarcodeField,
  renderQRCodeField,
  renderSequenceField,
  renderAddressBlock,
  renderShapeField,
  renderImageField,
  resolveImageUrl,
  clearImageCache
} from "./element-renderer.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// COORDINATE SYSTEM
// ============================================================================

/**
 * Single source of truth for coordinate conversion
 * - Storage/Design: millimeters (mm) with TOP-LEFT origin
 * - PDF Output: points (pt) with BOTTOM-LEFT origin (flipped Y)
 * - 1 inch = 72 points = 25.4 mm
 */
const PT_PER_MM = 72 / 25.4;

function mmToPoints(mm: number): number {
  return mm * PT_PER_MM;
}

// ============================================================================
// PAGE DIMENSIONS
// ============================================================================

function getPageDimensions(template: any): [number, number] {
  if (template.template_type === 'built_in_library') {
    return [612, 792]; // US Letter: 8.5" x 11"
  }
  
  if (template.width_mm && template.height_mm) {
    return [mmToPoints(template.width_mm), mmToPoints(template.height_mm)];
  }
  
  return [612, 792]; // Default to US Letter
}

// ============================================================================
// LABEL LAYOUT CALCULATION (for Avery-style sheets)
// ============================================================================

interface LabelLayout {
  labelWidth: number;
  labelHeight: number;
  columns: number;
  rows: number;
  marginTop: number;
  marginLeft: number;
  horizontalGap: number;
  verticalGap: number;
  labelsPerPage: number;
}

function calculateLabelLayout(template: any): LabelLayout {
  const labelWidth = mmToPoints(template.width_mm || 66.68);
  const labelHeight = mmToPoints(template.height_mm || 25.4);
  
  const pageWidth = 612; // US Letter width
  const pageHeight = 792; // US Letter height
  
  // Use template's stored values with sensible defaults (Avery 5160 defaults)
  const marginTop = mmToPoints(
    template.margin_top_mm ?? template.top_margin_mm ?? 12.7
  );
  const marginLeft = mmToPoints(
    template.margin_left_mm ?? template.left_margin_mm ?? 4.76
  );
  const horizontalGap = mmToPoints(
    template.horizontal_gap_mm ?? template.column_gap_mm ?? template.gap_x_mm ?? 3.18
  );
  const verticalGap = mmToPoints(
    template.vertical_gap_mm ?? template.row_gap_mm ?? template.gap_y_mm ?? 0
  );
  
  // Use template's columns/rows if stored, otherwise calculate from dimensions
  const columns = template.columns || Math.floor((pageWidth - marginLeft) / (labelWidth + horizontalGap));
  const rows = template.rows || Math.floor((pageHeight - marginTop) / (labelHeight + verticalGap));
  
  console.log(`📐 Label layout: ${columns}x${rows}, margins: top=${marginTop.toFixed(1)}pt left=${marginLeft.toFixed(1)}pt, gaps: h=${horizontalGap.toFixed(1)}pt v=${verticalGap.toFixed(1)}pt`);
  
  return {
    labelWidth,
    labelHeight,
    columns: Math.max(columns, 1),
    rows: Math.max(rows, 1),
    marginTop,
    marginLeft,
    horizontalGap,
    verticalGap,
    labelsPerPage: Math.max(columns * rows, 1)
  };
}

function calculateLabelPosition(
  labelIndex: number,
  layout: LabelLayout,
  pageHeight: number
): { x: number; y: number } {
  const row = Math.floor(labelIndex / layout.columns);
  const col = labelIndex % layout.columns;
  
  const x = layout.marginLeft + (col * (layout.labelWidth + layout.horizontalGap));
  const y = pageHeight - layout.marginTop - (row * (layout.labelHeight + layout.verticalGap)) - layout.labelHeight;
  
  return { x, y };
}

// ============================================================================
// LABEL RENDERING
// ============================================================================

async function renderLabel(
  page: any,
  pdfDoc: any,
  fontCollection: FontCollection,
  dataRow: Record<string, any>,
  fields: any[],
  mappings: Record<string, string>,
  offsetX: number,
  offsetY: number,
  labelHeight: number,
  recordIndex: number,
  workspaceId: string,
  projectId: string
): Promise<void> {
  console.log(`📝 Rendering label with ${fields.length} fields`);
  
  for (const field of fields) {
    if (!field.position || !field.size) {
      console.warn(`⚠️ Field "${field.templateField || field.name}" missing position or size`);
      continue;
    }
    
    // Skip invisible fields
    if (field.visible === false) continue;
    
    // Get mapped data column and value
    const fieldName = field.templateField || field.dataField || field.name;
    const dataColumn = mappings[fieldName] || null;
    const value = dataColumn ? String(dataRow[dataColumn] || '') : '';
    
    // Convert field position from mm (top-left origin) to PDF points (bottom-left origin)
    const fieldX = offsetX + mmToPoints(field.position?.x || field.x || 0);
    const fieldWidth = mmToPoints(field.position ? field.size.width : field.width);
    const fieldHeight = mmToPoints(field.position ? field.size.height : field.height);
    
    // PDF Y: Label top is at (offsetY + labelHeight)
    const labelTopY = offsetY + labelHeight;
    const fieldY = labelTopY - mmToPoints(field.position?.y || field.y || 0) - fieldHeight;
    
    const fieldType = field.fieldType || field.kind || 'text';
    
    console.log(`   📐 Field "${fieldName}" (${fieldType}): ` +
      `pos=(${(field.position?.x || field.x || 0).toFixed(1)}, ${(field.position?.y || field.y || 0).toFixed(1)})mm ` +
      `size=${fieldWidth.toFixed(1)}x${fieldHeight.toFixed(1)}pt`);
    
    // Render based on field type
    switch (fieldType) {
      case 'text':
        await renderTextField(page, pdfDoc, fontCollection, field, value, fieldX, fieldY, fieldWidth, fieldHeight);
        break;
        
      case 'address_block':
        await renderAddressBlock(page, pdfDoc, fontCollection, field, dataRow, mappings, fieldX, fieldY, fieldWidth, fieldHeight);
        break;
        
      case 'barcode':
        renderBarcodeField(page, field, value, fieldX, fieldY, fieldWidth, fieldHeight);
        break;
        
      case 'qrcode':
      case 'qr':
        renderQRCodeField(page, field, value, fieldX, fieldY, fieldWidth, fieldHeight);
        break;
        
      case 'sequence':
        await renderSequenceField(page, pdfDoc, fontCollection, field, recordIndex, fieldX, fieldY, fieldWidth, fieldHeight);
        break;
        
      case 'shape':
        renderShapeField(page, field, fieldX, fieldY, fieldWidth, fieldHeight);
        break;
        
      case 'image':
      case 'vdp_image':
        // Resolve image URL from project assets
        const imageFilename = value; // The mapped field value should be the filename
        const imageUrl = await resolveImageUrl(workspaceId, projectId, imageFilename);
        await renderImageField(page, pdfDoc, field, imageUrl, fieldX, fieldY, fieldWidth, fieldHeight);
        break;
        
      default:
        // Default to text rendering
        await renderTextField(page, pdfDoc, fontCollection, field, value, fieldX, fieldY, fieldWidth, fieldHeight);
    }
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { mergeJobId, printConfig: customPrintConfig } = await req.json();
    console.log('🚀 Starting PDF generation for job:', mergeJobId);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Update job status to processing
    await supabase
      .from('merge_jobs')
      .update({ 
        status: 'processing',
        processing_started_at: new Date().toISOString()
      })
      .eq('id', mergeJobId);

    // Fetch job details with related data
    const { data: job, error: jobError } = await supabase
      .from('merge_jobs')
      .select(`
        *,
        data_source:data_sources(*),
        template:templates(*)
      `)
      .eq('id', mergeJobId)
      .single();

    if (jobError || !job) {
      throw new Error('Merge job not found');
    }

    console.log('📋 Job details:', {
      template: job.template.name,
      totalPages: job.total_pages,
      templateType: job.template.template_type,
      hasDesignConfig: !!job.template.design_config
    });

    // Get field mappings
    const { data: mappings, error: mappingsError } = await supabase
      .from('field_mappings')
      .select('mappings')
      .eq('data_source_id', job.data_source_id)
      .eq('template_id', job.template_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (mappingsError || !mappings) {
      throw new Error('Field mappings not found');
    }

    const fieldMappings = mappings.mappings as Record<string, string>;
    console.log('🗺️ Field mappings loaded:', Object.keys(fieldMappings).length, 'fields');

    // Get design config and fields
    const designConfig = job.template.design_config || {};
    const fields = designConfig.fields || [];
    console.log('🎨 Design config fields:', fields.length);

    // Get data rows
    const dataSource = job.data_source;
    const parsedFields = dataSource.parsed_fields as any;
    const dataRows = parsedFields?.rows || parsedFields?.preview || [];
    
    if (dataRows.length === 0) {
      throw new Error('No data rows found in data source');
    }

    console.log('📊 Processing', dataRows.length, 'records');

    // ========================================================================
    // CREATE PDF DOCUMENT
    // ========================================================================
    
    // Clear image cache from any previous job
    clearImageCache();
    
    const pdfDoc = await PDFDocument.create();
    
    // Initialize font collection with standard fallbacks
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    const fontCollection: FontCollection = {
      regular: regularFont,
      bold: boldFont,
      customFonts: new Map()
    };
    
    // Pre-load Google Fonts used in design
    const usedFontFamilies = fields
      .map((f: any) => f.style?.fontFamily)
      .filter(Boolean);
    
    if (usedFontFamilies.length > 0) {
      console.log('🔤 Pre-loading fonts:', [...new Set(usedFontFamilies)]);
      await preloadCommonFonts(pdfDoc, fontCollection, usedFontFamilies);
    }

    // ========================================================================
    // DETERMINE OUTPUT MODE
    // ========================================================================
    
    const isAverySheet = job.template.template_type === 'built_in_library';
    const [pageWidth, pageHeight] = getPageDimensions(job.template);
    
    // Print config (only for single-label output)
    const printConfig: PrintConfig = {
      ...DEFAULT_PRINT_CONFIG,
      ...customPrintConfig,
    };
    
    // Disable print features for Avery sheets
    if (isAverySheet) {
      printConfig.showCropMarks = false;
      printConfig.showRegistrationMarks = false;
      printConfig.bleedMm = 0;
    }
    
    console.log('📄 Output mode:', isAverySheet ? 'Avery sheet' : 'Single label');
    console.log('📐 Page size:', `${pageWidth.toFixed(0)}x${pageHeight.toFixed(0)} pt`);
    
    if (!isAverySheet && printConfig.bleedMm > 0) {
      console.log('✂️ Print features: bleed=' + printConfig.bleedMm + 'mm, cropMarks=' + printConfig.showCropMarks);
    }

    // ========================================================================
    // GENERATE LABELS
    // ========================================================================
    
    const layout = calculateLabelLayout(job.template);
    
    console.log('📏 Layout:', {
      labelSize: `${layout.labelWidth.toFixed(0)}x${layout.labelHeight.toFixed(0)} pt`,
      grid: `${layout.columns}x${layout.rows}`,
      labelsPerPage: layout.labelsPerPage
    });

    let currentPage: any = null;
    let labelsOnCurrentPage = 0;
    let processedRecords = 0;
    const updateInterval = Math.max(Math.floor(dataRows.length / 10), 10);

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      
      // Create new page when needed
      if (!currentPage || labelsOnCurrentPage >= layout.labelsPerPage) {
        if (isAverySheet) {
          // Standard sheet page
          currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
        } else if (printConfig.bleedMm > 0 || printConfig.showCropMarks) {
          // Print-ready page with bleed and marks
          const result = createPrintReadyPage(pdfDoc, pageWidth, pageHeight, printConfig);
          currentPage = result.page;
        } else {
          // Simple single-label page
          currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
        }
        
        labelsOnCurrentPage = 0;
        console.log(`📃 Created page ${pdfDoc.getPageCount()}`);
      }

      // Calculate label position
      let position: { x: number; y: number };
      let labelHeight: number;
      
      if (isAverySheet) {
        position = calculateLabelPosition(labelsOnCurrentPage, layout, pageHeight);
        labelHeight = layout.labelHeight;
      } else {
        // Single label - position at origin (with offset for bleed/marks if applicable)
        const bleedOffset = mmToPoints(printConfig.bleedMm);
        const marksOffset = printConfig.showCropMarks ? mmToPoints(printConfig.cropMarkOffset + printConfig.cropMarkLength + 2) : 0;
        position = { x: bleedOffset + marksOffset, y: bleedOffset + marksOffset };
        labelHeight = pageHeight;
      }
      
      // Render the label
      if (fields.length > 0) {
        await renderLabel(
          currentPage,
          pdfDoc,
          fontCollection,
          row,
          fields,
          fieldMappings,
          position.x,
          position.y,
          labelHeight,
          i,
          job.workspace_id,
          job.template.project_id || ''
        );
      }
      
      labelsOnCurrentPage++;
      processedRecords++;

      // Update progress
      if (processedRecords % updateInterval === 0) {
        await supabase
          .from('merge_jobs')
          .update({ processed_pages: processedRecords })
          .eq('id', mergeJobId);
        
        console.log(`⏳ Progress: ${processedRecords}/${dataRows.length} records`);
      }
    }

    // Final progress update
    await supabase
      .from('merge_jobs')
      .update({ processed_pages: processedRecords })
      .eq('id', mergeJobId);

    // ========================================================================
    // SAVE AND UPLOAD PDF
    // ========================================================================
    
    const pdfBytes = await pdfDoc.save();
    console.log('✅ PDF generated:', {
      size: `${(pdfBytes.length / 1024).toFixed(2)} KB`,
      pages: pdfDoc.getPageCount(),
      records: processedRecords,
      fontsEmbedded: fontCollection.customFonts.size
    });

    const fileName = `${mergeJobId}_${Date.now()}.pdf`;
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('generated-pdfs')
      .upload(fileName, pdfBytes, {
        contentType: 'application/pdf',
        upsert: false
      });

    if (uploadError) {
      console.error('❌ Storage upload error:', uploadError);
      throw new Error(`Failed to upload PDF: ${uploadError.message}`);
    }

    console.log('📤 PDF uploaded:', uploadData.path);

    // Store output record
    const storagePath = uploadData.path;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await supabase.from('generated_outputs').insert({
      merge_job_id: mergeJobId,
      workspace_id: job.workspace_id,
      file_url: storagePath,
      file_size_bytes: pdfBytes.length,
      page_count: pdfDoc.getPageCount(),
      expires_at: expiresAt.toISOString()
    });

    // Update job status
    await supabase
      .from('merge_jobs')
      .update({
        status: 'complete',
        output_url: storagePath,
        processing_completed_at: new Date().toISOString()
      })
      .eq('id', mergeJobId);

    // Update project status to complete
    await supabase
      .from('projects')
      .update({ status: 'complete' })
      .eq('id', job.project_id);

    // Log usage
    const currentDate = new Date();
    const billingCycleMonth = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
    
    await supabase.from('usage_logs').insert({
      workspace_id: job.workspace_id,
      user_id: job.data_source.workspace_id,
      merge_job_id: mergeJobId,
      pages_generated: pdfDoc.getPageCount(),
      billing_cycle_month: billingCycleMonth
    });

    // Increment workspace usage (if function exists)
    try {
      await supabase.rpc('increment_workspace_usage', {
        workspace_id: job.workspace_id,
        pages_count: pdfDoc.getPageCount()
      });
    } catch (e) {
      console.log('Note: increment_workspace_usage RPC not available');
    }

    console.log('🎉 Job completed successfully');

    return new Response(
      JSON.stringify({ 
        success: true,
        output_url: storagePath,
        page_count: pdfDoc.getPageCount(),
        fonts_embedded: fontCollection.customFonts.size
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ PDF generation error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

    // Try to update job status to error
    try {
      const { mergeJobId } = await req.json();
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      await supabase
        .from('merge_jobs')
        .update({
          status: 'error',
          error_message: errorMessage
        })
        .eq('id', mergeJobId);

      // Also update project status to error
      const { data: errorJob } = await supabase
        .from('merge_jobs')
        .select('project_id')
        .eq('id', mergeJobId)
        .single();
      
      if (errorJob?.project_id) {
        await supabase
          .from('projects')
          .update({ status: 'error' })
          .eq('id', errorJob.project_id);
      }
    } catch (updateError) {
      console.error('Failed to update job status:', updateError);
    }

    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
