import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from "https://esm.sh/pdf-lib@1.17.1";
import bwipjs from "https://esm.sh/bwip-js@4.8.0";
// @ts-ignore - QRCode types
import QRCode from "https://esm.sh/qrcode-svg@1.1.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * COORDINATE SYSTEM: Single source of truth
 * - Storage/Design: millimeters (mm) with TOP-LEFT origin
 * - PDF Output: points (pt) with BOTTOM-LEFT origin (flipped Y)
 * - 1 inch = 72 points = 25.4 mm
 * - PT_PER_MM = 72 / 25.4 = 2.8346456693
 */
const PT_PER_MM = 72 / 25.4;

function mmToPoints(mm: number): number {
  return mm * PT_PER_MM;
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
  if (field.showLabel && field.templateField) {
    const labelFont = fonts.regular;
    const labelSize = field.labelStyle?.fontSize || ((field.style?.fontSize || 12) * 0.7);
    const labelText = field.templateField.toUpperCase();
    
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
  // Note: PDF has limited font support - custom fonts would need embedding
  // For now, we map to standard PDF fonts based on style
  const font = field.style?.fontWeight === 'bold' ? fonts.bold : fonts.regular;
  const fontSize = field.style?.fontSize || 12;
  
  console.log(`   📝 Text field "${field.templateField}": fontSize=${fontSize}pt, box=${width.toFixed(1)}x${height.toFixed(1)}pt`);
  
  const lines = wrapText(value, font, width - 12, fontSize);
  
  for (const line of lines) {
    if (yOffset < y + 6) break;
    
    let xPos = x + 6;
    const textAlign = field.style?.textAlign || 'left';
    if (textAlign === 'center') {
      const textWidth = font.widthOfTextAtSize(line, fontSize);
      xPos = x + (width - textWidth) / 2;
    } else if (textAlign === 'right') {
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

// Render barcode using bwip-js for production-quality output
function renderBarcodeField(
  page: PDFPage,
  pdfDoc: PDFDocument,
  field: any,
  dataRow: Record<string, any>,
  dataColumn: string | null,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const value = dataColumn ? String(dataRow[dataColumn] || '') : field.typeConfig?.staticValue || '123456789012';
  const format = field.typeConfig?.barcodeFormat || 'CODE128';
  
  try {
    // Map format names to bwip-js bcid values
    const bcidMap: Record<string, string> = {
      'CODE128': 'code128',
      'CODE39': 'code39',
      'EAN13': 'ean13',
      'UPCA': 'upca',
    };
    
    const bcid = bcidMap[format] || 'code128';
    
    // Generate barcode SVG using bwip-js
    const svg = bwipjs.toSVG({
      bcid: bcid,
      text: value,
      scale: 3,
      height: 10,
      includetext: field.typeConfig?.showText ?? true,
      textxalign: 'center',
    });
    
    // Parse SVG to extract rectangles
    // SVG from bwip-js contains rect elements we can parse
    const rectRegex = /<rect\s+x="([^"]+)"\s+y="([^"]+)"\s+width="([^"]+)"\s+height="([^"]+)"/g;
    let match;
    
    // Get SVG dimensions
    const viewBoxMatch = svg.match(/viewBox="0 0 ([0-9.]+) ([0-9.]+)"/);
    if (!viewBoxMatch) throw new Error('Could not parse SVG viewBox');
    
    const svgWidth = parseFloat(viewBoxMatch[1]);
    const svgHeight = parseFloat(viewBoxMatch[2]);
    
    // Calculate scale to fit in PDF space
    const scaleX = (width - 4) / svgWidth;
    const scaleY = (height - 4) / svgHeight;
    const scale = Math.min(scaleX, scaleY);
    
    // Center the barcode
    const offsetX = x + (width - (svgWidth * scale)) / 2;
    const offsetY = y + (height - (svgHeight * scale)) / 2;
    
    // Draw each rectangle from the SVG
    while ((match = rectRegex.exec(svg)) !== null) {
      const rectX = parseFloat(match[1]);
      const rectY = parseFloat(match[2]);
      const rectW = parseFloat(match[3]);
      const rectH = parseFloat(match[4]);
      
      page.drawRectangle({
        x: offsetX + (rectX * scale),
        y: offsetY + ((svgHeight - rectY - rectH) * scale),
        width: rectW * scale,
        height: rectH * scale,
        color: rgb(0, 0, 0)
      });
    }
  } catch (error) {
    console.error('Barcode generation error:', error);
    // Fallback to placeholder
    page.drawRectangle({
      x: x,
      y: y,
      width: width,
      height: height,
      borderColor: rgb(0.8, 0, 0),
      borderWidth: 1
    });
    page.drawText('BARCODE ERROR', {
      x: x + 6,
      y: y + height / 2,
      size: 8,
      color: rgb(1, 0, 0)
    });
  }
}

// Render real QR code using qrcode-svg with proper module rendering
function renderQRCodeField(
  page: PDFPage,
  pdfDoc: PDFDocument,
  field: any,
  dataRow: Record<string, any>,
  dataColumn: string | null,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const value = dataColumn ? String(dataRow[dataColumn] || '') : field.typeConfig?.staticValue || 'https://example.com';
  
  console.log(`   🔲 QR Code value: "${value}"`);
  
  try {
    const size = Math.min(width, height) - 4;
    
    // Generate QR code SVG
    const qr = new QRCode({
      content: value,
      padding: 0,
      width: 256,  // Fixed size for generation, we'll scale to fit
      height: 256,
      color: '#000000',
      background: '#ffffff',
      ecl: field.typeConfig?.qrErrorCorrection || 'M',
    });
    
    const svg = qr.svg();
    console.log(`   QR SVG sample: ${svg.substring(0, 150)}...`);
    
    // Parse SVG to extract rect elements (QR code modules)
    const rectRegex = /<rect\s+x="([^"]+)"\s+y="([^"]+)"\s+width="([^"]+)"\s+height="([^"]+)"/g;
    let match;
    
    // Get SVG dimensions - try width/height attributes first (qrcode-svg format), then viewBox
    let svgWidth: number;
    let svgHeight: number;
    
    const widthMatch = svg.match(/width="([0-9.]+)"/);
    const heightMatch = svg.match(/height="([0-9.]+)"/);
    
    if (widthMatch && heightMatch) {
      svgWidth = parseFloat(widthMatch[1]);
      svgHeight = parseFloat(heightMatch[1]);
      console.log(`   Parsed from width/height attrs: ${svgWidth}x${svgHeight}`);
    } else {
      // Fallback to viewBox
      const viewBoxMatch = svg.match(/viewBox="0 0 ([0-9.]+) ([0-9.]+)"/);
      if (!viewBoxMatch) {
        throw new Error('Could not parse QR code SVG dimensions');
      }
      svgWidth = parseFloat(viewBoxMatch[1]);
      svgHeight = parseFloat(viewBoxMatch[2]);
      console.log(`   Parsed from viewBox: ${svgWidth}x${svgHeight}`);
    }
    
    // Calculate scale and centering
    const scaleX = size / svgWidth;
    const scaleY = size / svgHeight;
    const scale = Math.min(scaleX, scaleY);
    
    const offsetX = x + (width - size) / 2;
    const offsetY = y + (height - size) / 2;
    
    // Draw white background
    page.drawRectangle({
      x: offsetX,
      y: offsetY,
      width: size,
      height: size,
      color: rgb(1, 1, 1)
    });
    
    // Draw each QR code module from the SVG
    // IMPORTANT: Skip the first rect which is the white background (covers entire SVG)
    let rectCount = 0;
    let isFirstRect = true;
    
    while ((match = rectRegex.exec(svg)) !== null) {
      const rectX = parseFloat(match[1]);
      const rectY = parseFloat(match[2]);
      const rectW = parseFloat(match[3]);
      const rectH = parseFloat(match[4]);
      
      // Skip the first rect - it's the background that covers the entire QR code
      // Drawing it as black causes the "black square" issue
      if (isFirstRect) {
        isFirstRect = false;
        console.log(`   ⏭️ Skipping background rect: ${rectW}x${rectH}`);
        continue;
      }
      
      page.drawRectangle({
        x: offsetX + (rectX * scale),
        y: offsetY + size - ((rectY + rectH) * scale),
        width: rectW * scale,
        height: rectH * scale,
        color: rgb(0, 0, 0)
      });
      rectCount++;
    }
    console.log(`   ✅ QR code rendered with ${rectCount} modules (skipped bg)`);
    
  } catch (error) {
    console.error('QR code generation error:', error);
    // Fallback to placeholder with actual value for debugging
    page.drawRectangle({
      x: x,
      y: y,
      width: width,
      height: height,
      borderColor: rgb(0.8, 0, 0),
      borderWidth: 1
    });
    const displayValue = value.length > 25 ? value.substring(0, 22) + '...' : value;
    page.drawText(`QR: ${displayValue}`, {
      x: x + 4,
      y: y + height / 2,
      size: 6,
      color: rgb(1, 0, 0)
    });
  }
}

// Render sequence number - uses TOP-LEFT origin to match Fabric.js canvas rendering
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
  
  const font = field.style?.fontWeight === 'bold' ? fonts.bold : fonts.regular;
  const fontSize = field.style?.fontSize || 12;
  
  console.log(`   📊 Sequence field: fontSize=${fontSize}pt, value="${value}", box=${width.toFixed(1)}x${height.toFixed(1)}pt`);
  
  // Calculate text position based on textAlign - render from TOP of box (matching Fabric.js)
  const textAlign = field.style?.textAlign || 'left';
  let xPos = x + 6;
  
  if (textAlign === 'center') {
    const textWidth = font.widthOfTextAtSize(value, fontSize);
    xPos = x + (width - textWidth) / 2;
  } else if (textAlign === 'right') {
    const textWidth = font.widthOfTextAtSize(value, fontSize);
    xPos = x + width - textWidth - 6;
  }
  
  // Render from top of box (y + height - fontSize - padding) to match text fields
  const yPos = y + height - fontSize - 4;
  
  page.drawText(value, {
    x: xPos,
    y: yPos,
    size: fontSize,
    font: font,
    color: rgb(0, 0, 0)
  });
}

// Render address block with combined fields
function renderAddressBlock(
  page: PDFPage,
  field: any,
  dataRow: Record<string, any>,
  mappings: Record<string, string>,
  fonts: { regular: PDFFont; bold: PDFFont },
  x: number,
  y: number,
  width: number,
  height: number
) {
  const combinedFields = field.combinedFields || [field.templateField];
  
  // Gather all field values, skip empty/null
  const lines: string[] = [];
  for (const fieldName of combinedFields) {
    const dataColumn = mappings[fieldName];
    if (dataColumn && dataRow[dataColumn]) {
      const value = String(dataRow[dataColumn]).trim();
      if (value && value.toLowerCase() !== 'null') {
        lines.push(value);
      }
    }
  }
  
  if (lines.length === 0) return;
  
  // Use user's font size setting - NO auto-shrink to keep consistency
  const font = field.style?.fontWeight === 'bold' ? fonts.bold : fonts.regular;
  const fontSize = field.style?.fontSize || 12;
  const lineHeight = 1.2;
  
  console.log(`   📏 Address block: fontSize=${fontSize}pt, box=${width.toFixed(1)}x${height.toFixed(1)}pt, lines=${lines.length}`);
  
  // Render lines from top
  let yOffset = y + height - fontSize - 4;
  
  for (const line of lines) {
    if (yOffset < y) break;
    
    page.drawText(line, {
      x: x + 6,
      y: yOffset,
      size: fontSize,
      font: font,
      color: rgb(0, 0, 0)
    });
    yOffset -= fontSize * lineHeight;
  }
}

// Render a single label with design config
function renderLabelWithDesign(
  page: PDFPage,
  pdfDoc: PDFDocument,
  dataRow: Record<string, any>,
  fields: any[],
  mappings: Record<string, string>,
  offsetX: number,
  offsetY: number,
  labelHeight: number,
  fonts: { regular: PDFFont; bold: PDFFont },
  recordIndex: number
) {
  // Debug: Log all fields with their critical properties
  console.log(`📝 Fields to render: ${fields.length}`);
  console.log(`📐 Label top Y in PDF coords: ${offsetY + labelHeight}`);
  
  for (const field of fields) {
    if (!field.position || !field.size) {
      console.warn(`⚠️ Field "${field.templateField}" missing position or size, skipping`);
      continue;
    }
    
    // Get mapped data column
    const dataColumn = mappings[field.templateField] || null;
    
    console.log(`\n🔍 Processing field: ${field.templateField}`);
    console.log(`   Type: ${field.fieldType}`);
    console.log(`   Mapped to data column: ${dataColumn}`);
    console.log(`   Canvas position: (${field.position.x}mm, ${field.position.y}mm)`);
    
    // Convert field position from mm (top-left origin) to PDF points (bottom-left origin)
    // Field position is RELATIVE to label, so add label offset
    const fieldX = offsetX + mmToPoints(field.position.x);
    const fieldWidth = mmToPoints(field.size.width);
    const fieldHeight = mmToPoints(field.size.height);
    
    // PDF Y: Label top is at (offsetY + labelHeight)
    // Field top in canvas coords is field.position.y from label top
    // So field bottom in PDF coords = labelTop - field.position.y - field.height
    const labelTopY = offsetY + labelHeight;
    const fieldY = labelTopY - mmToPoints(field.position.y) - fieldHeight;
    
    console.log(`   PDF coords: x=${fieldX.toFixed(1)}, y=${fieldY.toFixed(1)}, w=${fieldWidth.toFixed(1)}, h=${fieldHeight.toFixed(1)}`);
    
    // Render based on field type
    switch (field.fieldType) {
      case 'text':
        console.log(`   ✏️ Rendering text field with fontSize=${field.style?.fontSize}pt`);
        renderTextField(page, field, dataRow, dataColumn, fonts, fieldX, fieldY, fieldWidth, fieldHeight);
        break;
        
      case 'address_block':
        console.log(`   ✏️ Rendering address block with ${field.combinedFields?.length || 1} fields`);
        renderAddressBlock(page, field, dataRow, mappings, fonts, fieldX, fieldY, fieldWidth, fieldHeight);
        break;
        
      case 'barcode':
        console.log(`   ✏️ Rendering barcode`);
        renderBarcodeField(page, pdfDoc, field, dataRow, dataColumn, fieldX, fieldY, fieldWidth, fieldHeight);
        break;
        
      case 'qrcode':
        console.log(`   ✏️ Rendering QR code`);
        renderQRCodeField(page, pdfDoc, field, dataRow, dataColumn, fieldX, fieldY, fieldWidth, fieldHeight);
        break;
        
      case 'sequence':
        console.log(`   ✏️ Rendering sequence #${recordIndex}`);
        renderSequenceField(page, field, recordIndex, fonts, fieldX, fieldY, fieldWidth, fieldHeight);
        break;
        
      default:
        console.log(`   ✏️ Rendering as text (default)`);
        renderTextField(page, field, dataRow, dataColumn, fonts, fieldX, fieldY, fieldWidth, fieldHeight);
    }
  }
}

// NOTE: renderLabelWithDesignWrapper removed - functionality consolidated into renderLabelWithDesign above

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

    // Get the most recent mapping (handles multiple entries gracefully)
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
    console.log('Field mappings loaded:', Object.keys(fieldMappings).length, 'fields');

    const designConfig = job.template.design_config || {};
    const fields = designConfig.fields || [];
    console.log('Design config fields:', fields.length);

    const dataSource = job.data_source;
    const parsedFields = dataSource.parsed_fields as any;
    // Use all rows, fallback to preview for backwards compatibility
    const dataRows = parsedFields?.rows || parsedFields?.preview || [];
    
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
          pdfDoc,
          row,
          fields,
          fieldMappings,
          position.x,
          position.y,
          layout.labelHeight,
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
