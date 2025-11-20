import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Convert mm to PDF points (1 inch = 72 points, 1 inch = 25.4 mm)
function mmToPoints(mm: number): number {
  return (mm / 25.4) * 72;
}

// Wrap text to fit within maxWidth
function wrapText(
  text: string,
  font: PDFFont,
  maxWidth: number,
  fontSize: number
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  
  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const width = font.widthOfTextAtSize(testLine, fontSize);
    
    if (width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  
  if (currentLine) lines.push(currentLine);
  return lines;
}

// Get page dimensions based on template type
function getPageDimensions(template: any): [number, number] {
  if (template.template_type === 'built_in_library') {
    return [612, 792]; // US Letter: 8.5" x 11"
  }
  
  if (template.width_mm && template.height_mm) {
    return [mmToPoints(template.width_mm), mmToPoints(template.height_mm)];
  }
  
  return [612, 792]; // Default to US Letter
}

// Calculate label grid layout for Avery labels
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
  
  const marginTop = mmToPoints(12.7);
  const marginLeft = mmToPoints(4.76);
  const horizontalGap = mmToPoints(3.18);
  const verticalGap = 0;
  
  const columns = Math.floor((pageWidth - marginLeft) / (labelWidth + horizontalGap));
  const rows = Math.floor((pageHeight - marginTop) / (labelHeight + verticalGap));
  
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

// Calculate position for a specific label index
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

// Render text field with optional label
function renderTextField(
  page: PDFPage,
  field: any,
  dataRow: Record<string, any>,
  dataColumn: string | null,
  fonts: { regular: PDFFont; bold: PDFFont },
  x: number,
  y: number,
  width: number,
  height: number
) {
  const value = dataColumn ? String(dataRow[dataColumn] || '') : '';
  let yOffset = y + height - 6;
  
  // Render label if enabled
  if (field.showLabel && field.name) {
    const labelFont = fonts.regular;
    const labelSize = field.labelStyle?.fontSize || (field.fontSize * 0.7);
    const labelText = field.name.toUpperCase();
    
    page.drawText(labelText, {
      x: x + 6,
      y: yOffset,
      size: labelSize,
      font: labelFont,
      color: rgb(0.4, 0.4, 0.4)
    });
    
    yOffset -= (labelSize + 2);
  }
  
  // Render value
  const font = field.fontWeight === 'bold' ? fonts.bold : fonts.regular;
  const fontSize = field.fontSize || 12;
  const lines = wrapText(value, font, width - 12, fontSize);
  
  for (const line of lines) {
    if (yOffset < y + 6) break;
    
    let xPos = x + 6;
    if (field.textAlign === 'center') {
      const textWidth = font.widthOfTextAtSize(line, fontSize);
      xPos = x + (width - textWidth) / 2;
    } else if (field.textAlign === 'right') {
      const textWidth = font.widthOfTextAtSize(line, fontSize);
      xPos = x + width - textWidth - 6;
    }
    
    page.drawText(line, {
      x: xPos,
      y: yOffset,
      size: fontSize,
      font: font,
      color: rgb(0, 0, 0)
    });
    yOffset -= (fontSize + 2);
  }
}

// Render barcode placeholder
function renderBarcodeField(
  page: PDFPage,
  field: any,
  dataRow: Record<string, any>,
  dataColumn: string | null,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const value = dataColumn ? String(dataRow[dataColumn] || '') : '';
  
  for (let i = 0; i < 15; i++) {
    if (i % 2 === 0) {
      page.drawRectangle({
        x: x + 6 + (i * ((width - 12) / 15)),
        y: y + height * 0.35,
        width: (width - 12) / 15,
        height: height * 0.4,
        color: rgb(0, 0, 0)
      });
    }
  }
  
  page.drawText(value, {
    x: x + 6,
    y: y + 8,
    size: 8,
    color: rgb(0, 0, 0)
  });
}

// Render QR code placeholder
function renderQRCodeField(
  page: PDFPage,
  field: any,
  dataRow: Record<string, any>,
  dataColumn: string | null,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const size = Math.min(width, height) - 12;
  const cellSize = size / 12;
  const startX = x + (width - size) / 2;
  const startY = y + (height - size) / 2;
  
  for (let row = 0; row < 12; row++) {
    for (let col = 0; col < 12; col++) {
      if ((row + col) % 2 === 0) {
        page.drawRectangle({
          x: startX + (col * cellSize),
          y: startY + size - ((row + 1) * cellSize),
          width: cellSize,
          height: cellSize,
          color: rgb(0, 0, 0)
        });
      }
    }
  }
}

// Render sequence number
function renderSequenceField(
  page: PDFPage,
  field: any,
  recordIndex: number,
  fonts: { regular: PDFFont; bold: PDFFont },
  x: number,
  y: number,
  width: number,
  height: number
) {
  const config = field.typeConfig || {};
  const start = config.sequenceStart || 1;
  const prefix = config.sequencePrefix || '';
  const padding = config.sequencePadding || 0;
  
  const number = start + recordIndex;
  const paddedNumber = String(number).padStart(padding, '0');
  const value = prefix + paddedNumber;
  
  const font = field.fontWeight === 'bold' ? fonts.bold : fonts.regular;
  const fontSize = field.fontSize || 12;
  
  page.drawText(value, {
    x: x + 6,
    y: y + (height / 2) - (fontSize / 2),
    size: fontSize,
    font: font,
    color: rgb(0, 0, 0)
  });
}

// Render a single label with design config
function renderLabelWithDesign(
  page: PDFPage,
  dataRow: Record<string, any>,
  fields: any[],
  mappings: Record<string, string>,
  offsetX: number,
  offsetY: number,
  pageHeight: number,
  fonts: { regular: PDFFont; bold: PDFFont },
  recordIndex: number
) {
  try {
    console.log(`🎨 Rendering label at offset (${offsetX}, ${offsetY})`);
    console.log(`📊 Data row keys:`, Object.keys(dataRow));
    console.log(`🗺️ Mappings:`, mappings);
    console.log(`📝 Fields to render:`, fields.length);

    for (const field of fields) {
      const dataColumn = mappings[field.name] || null;
      
      console.log(`\n🔍 Processing field: ${field.name}`);
      console.log(`   Type: ${field.fieldType || 'text'}`);
      console.log(`   Mapped to data column: ${dataColumn}`);
      console.log(`   showLabel: ${field.showLabel}`);
      
      if (dataColumn) {
        const dataValue = dataRow[dataColumn];
        console.log(`   Data value: "${dataValue}"`);
      }
      
      const x = offsetX + mmToPoints(field.x);
      const y = pageHeight - offsetY - mmToPoints(field.y) - mmToPoints(field.height);
      const width = mmToPoints(field.width);
      const height = mmToPoints(field.height);
      
      console.log(`   Position: (${x}, ${y}), Size: ${width}x${height}`);
      
      switch (field.fieldType) {
        case 'barcode':
          console.log(`   ✏️ Rendering barcode`);
          renderBarcodeField(page, field, dataRow, dataColumn, x, y, width, height);
          break;
        case 'qrcode':
          console.log(`   ✏️ Rendering QR code`);
          renderQRCodeField(page, field, dataRow, dataColumn, x, y, width, height);
          break;
        case 'sequence':
          console.log(`   ✏️ Rendering sequence #${recordIndex}`);
          renderSequenceField(page, field, recordIndex, fonts, x, y, width, height);
          break;
        case 'text':
        default:
          console.log(`   ✏️ Rendering text field`);
          renderTextField(page, field, dataRow, dataColumn, fonts, x, y, width, height);
          break;
      }
    }
  } catch (error) {
    console.error('❌ Error rendering label:', error);
    page.drawText('ERROR', {
      x: offsetX + 6,
      y: pageHeight - offsetY - 20,
      size: 8,
      font: fonts.regular,
      color: rgb(1, 0, 0),
    });
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { mergeJobId } = await req.json();
    console.log('Starting PDF generation for job:', mergeJobId);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    await supabase
      .from('merge_jobs')
      .update({ 
        status: 'processing',
        processing_started_at: new Date().toISOString()
      })
      .eq('id', mergeJobId);

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

    console.log('Job details loaded:', {
      template: job.template.name,
      totalPages: job.total_pages,
      templateType: job.template.template_type,
      hasDesignConfig: !!job.template.design_config
    });

    const { data: mappings, error: mappingsError } = await supabase
      .from('field_mappings')
      .select('mappings')
      .eq('data_source_id', job.data_source_id)
      .eq('template_id', job.template_id)
      .single();

    if (mappingsError || !mappings) {
      throw new Error('Field mappings not found');
    }

    const fieldMappings = mappings.mappings as Record<string, string>;
    console.log('Field mappings loaded:', Object.keys(fieldMappings).length, 'fields');

    const designConfig = job.template.design_config || {};
    const fields = designConfig.fields || [];
    console.log('Design config fields:', fields.length);

    const dataSource = job.data_source;
    const parsedFields = dataSource.parsed_fields as any;
    const dataRows = parsedFields?.preview || [];
    
    if (dataRows.length === 0) {
      throw new Error('No data rows found in data source');
    }

    console.log('Processing', dataRows.length, 'records');

    const pdfDoc = await PDFDocument.create();
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fonts = { regular: regularFont, bold: boldFont };

    const [pageWidth, pageHeight] = getPageDimensions(job.template);
    const layout = calculateLabelLayout(job.template);
    
    console.log('Layout calculated:', {
      pageSize: `${pageWidth}x${pageHeight}`,
      labelSize: `${layout.labelWidth}x${layout.labelHeight}`,
      grid: `${layout.columns}x${layout.rows}`,
      labelsPerPage: layout.labelsPerPage
    });

    let currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
    let labelsOnCurrentPage = 0;
    let processedRecords = 0;
    const updateInterval = Math.max(Math.floor(dataRows.length / 10), 10);

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      
      if (labelsOnCurrentPage >= layout.labelsPerPage) {
        currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
        labelsOnCurrentPage = 0;
        console.log('Created new page');
      }

      const position = calculateLabelPosition(labelsOnCurrentPage, layout, pageHeight);
      
      if (fields.length > 0) {
        renderLabelWithDesign(
          currentPage,
          row,
          fields,
          fieldMappings,
          position.x,
          position.y,
          pageHeight,
          fonts,
          i
        );
      }
      
      labelsOnCurrentPage++;
      processedRecords++;

      if (processedRecords % updateInterval === 0) {
        await supabase
          .from('merge_jobs')
          .update({ processed_pages: processedRecords })
          .eq('id', mergeJobId);
        
        console.log(`Progress: ${processedRecords}/${dataRows.length} records`);
      }
    }

    await supabase
      .from('merge_jobs')
      .update({ processed_pages: processedRecords })
      .eq('id', mergeJobId);

    const pdfBytes = await pdfDoc.save();
    console.log('PDF generated:', {
      size: `${(pdfBytes.length / 1024).toFixed(2)} KB`,
      pages: pdfDoc.getPageCount(),
      records: processedRecords
    });

    const fileName = `${mergeJobId}_${Date.now()}.pdf`;
    console.log('Attempting to upload PDF to storage...', {
      bucket: 'generated-pdfs',
      fileName,
      sizeKB: (pdfBytes.length / 1024).toFixed(2)
    });

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('generated-pdfs')
      .upload(fileName, pdfBytes, {
        contentType: 'application/pdf',
        upsert: false
      });

    if (uploadError) {
      console.error('Storage upload error details:', {
        message: uploadError.message,
        error: uploadError
      });
      
      const { data: buckets } = await supabase.storage.listBuckets();
      console.log('Available buckets:', buckets?.map(b => b.name));
      
      throw new Error(`Failed to upload PDF: ${uploadError.message}`);
    }

    console.log('PDF uploaded:', uploadData.path);

    // Store the file storage path (not signed URL) for on-demand URL generation
    const storagePath = uploadData.path;

    // Set expiration to 30 days
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

    await supabase
      .from('merge_jobs')
      .update({
        status: 'complete',
        output_url: storagePath,
        processing_completed_at: new Date().toISOString()
      })
      .eq('id', mergeJobId);

    const currentDate = new Date();
    const billingCycleMonth = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
    
    await supabase.from('usage_logs').insert({
      workspace_id: job.workspace_id,
      user_id: job.data_source.workspace_id,
      merge_job_id: mergeJobId,
      pages_generated: pdfDoc.getPageCount(),
      billing_cycle_month: billingCycleMonth
    });

    await supabase.rpc('increment_workspace_usage', {
      workspace_id: job.workspace_id,
      pages_count: pdfDoc.getPageCount()
    });

    console.log('Job completed successfully');

    return new Response(
      JSON.stringify({ 
        success: true,
        output_url: storagePath,
        page_count: pdfDoc.getPageCount()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('PDF generation error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

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
