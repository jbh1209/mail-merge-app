// ============================================================================
// PDF GENERATION - Element Renderer
// ============================================================================
// Renders design elements to PDF with proper font handling and styling.
// Uses the new type system from the editor foundation.
// ============================================================================

import { PDFPage, PDFDocument, PDFFont, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import bwipjs from "https://esm.sh/bwip-js@4.8.0";
// @ts-ignore - QRCode types
import QRCode from "https://esm.sh/qrcode-svg@1.1.0";
import { FontCollection, getOrEmbedFont } from "./font-utils.ts";

/**
 * Points per millimeter
 */
const PT_PER_MM = 72 / 25.4;

function mmToPoints(mm: number): number {
  return mm * PT_PER_MM;
}

/**
 * Parse hex color to RGB values
 */
function parseColor(color: string): { r: number; g: number; b: number } {
  const hex = color.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;
  return { r, g, b };
}

/**
 * Wrap text to fit within maxWidth
 */
function wrapText(
  text: string,
  font: PDFFont,
  maxWidth: number,
  fontSize: number
): string[] {
  // Handle newlines first
  const paragraphs = text.split('\n');
  const allLines: string[] = [];
  
  for (const paragraph of paragraphs) {
    const words = paragraph.split(' ');
    let currentLine = '';
    
    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const width = font.widthOfTextAtSize(testLine, fontSize);
      
      if (width > maxWidth && currentLine) {
        allLines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    
    if (currentLine) allLines.push(currentLine);
  }
  
  return allLines;
}

/**
 * Render a text field to PDF
 */
export async function renderTextField(
  page: PDFPage,
  pdfDoc: PDFDocument,
  fontCollection: FontCollection,
  field: any,
  value: string,
  x: number,
  y: number,
  width: number,
  height: number
): Promise<void> {
  if (!value) return;
  
  const fontSize = field.style?.fontSize || 12;
  const fontFamily = field.style?.fontFamily || 'Roboto';
  const fontWeight = field.style?.fontWeight || 'normal';
  const textAlign = field.style?.textAlign || 'left';
  const verticalAlign = field.style?.verticalAlign || 'top';
  const colorHex = field.style?.color || '#000000';
  
  // Get or embed the correct font
  const font = await getOrEmbedFont(pdfDoc, fontCollection, fontFamily, fontWeight);
  
  // Parse color
  const { r, g, b } = parseColor(colorHex);
  
  // Calculate available space (with small padding)
  const padding = 2; // points
  const availableWidth = width - (padding * 2);
  const availableHeight = height - (padding * 2);
  
  // Handle label if enabled
  let yOffset = y + height - padding;
  
  if (field.showLabel && field.templateField) {
    const labelFont = fontCollection.regular;
    const labelSize = (field.labelStyle?.fontSize || fontSize * 0.7);
    const labelText = field.templateField.toUpperCase();
    
    page.drawText(labelText, {
      x: x + padding,
      y: yOffset - labelSize,
      size: labelSize,
      font: labelFont,
      color: rgb(0.4, 0.4, 0.4)
    });
    
    yOffset -= (labelSize + 2);
  }
  
  // Wrap text
  const lines = wrapText(value, font, availableWidth, fontSize);
  const lineHeight = fontSize * 1.2;
  const totalTextHeight = lines.length * lineHeight;
  
  // Calculate starting Y position based on vertical alignment
  let startY: number;
  const textAreaHeight = yOffset - y - padding;
  
  switch (verticalAlign) {
    case 'middle':
      startY = yOffset - (textAreaHeight - totalTextHeight) / 2 - fontSize;
      break;
    case 'bottom':
      startY = y + padding + totalTextHeight - fontSize;
      break;
    case 'top':
    default:
      startY = yOffset - fontSize;
  }
  
  // Render each line
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineY = startY - (i * lineHeight);
    
    // Skip if line would be outside the box
    if (lineY < y + padding) break;
    
    // Calculate X position based on alignment
    let lineX = x + padding;
    const textWidth = font.widthOfTextAtSize(line, fontSize);
    
    switch (textAlign) {
      case 'center':
        lineX = x + (width - textWidth) / 2;
        break;
      case 'right':
        lineX = x + width - textWidth - padding;
        break;
    }
    
    page.drawText(line, {
      x: lineX,
      y: lineY,
      size: fontSize,
      font: font,
      color: rgb(r, g, b)
    });
  }
}

/**
 * Render a barcode field to PDF
 */
export function renderBarcodeField(
  page: PDFPage,
  field: any,
  value: string,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  const format = field.typeConfig?.barcodeFormat || field.config?.format || 'CODE128';
  const barcodeValue = value || field.typeConfig?.staticValue || field.config?.staticValue || '123456789';
  
  try {
    // Map format names to bwip-js bcid values
    const bcidMap: Record<string, string> = {
      'CODE128': 'code128',
      'CODE39': 'code39',
      'EAN13': 'ean13',
      'UPC': 'upca',
      'UPCA': 'upca',
    };
    
    const bcid = bcidMap[format] || 'code128';
    
    // Generate barcode SVG
    const svg = bwipjs.toSVG({
      bcid: bcid,
      text: barcodeValue,
      scale: 3,
      height: 10,
      includetext: field.typeConfig?.showText ?? field.config?.showText ?? true,
      textxalign: 'center',
    });
    
    // Parse SVG to extract rectangles
    const rectRegex = /<rect\s+x="([^"]+)"\s+y="([^"]+)"\s+width="([^"]+)"\s+height="([^"]+)"/g;
    let match;
    
    // Get SVG dimensions
    const viewBoxMatch = svg.match(/viewBox="0 0 ([0-9.]+) ([0-9.]+)"/);
    if (!viewBoxMatch) throw new Error('Could not parse SVG viewBox');
    
    const svgWidth = parseFloat(viewBoxMatch[1]);
    const svgHeight = parseFloat(viewBoxMatch[2]);
    
    // Calculate scale to fit
    const scaleX = (width - 4) / svgWidth;
    const scaleY = (height - 4) / svgHeight;
    const scale = Math.min(scaleX, scaleY);
    
    // Center the barcode
    const offsetX = x + (width - (svgWidth * scale)) / 2;
    const offsetY = y + (height - (svgHeight * scale)) / 2;
    
    // Draw each rectangle
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
    // Draw error placeholder
    page.drawRectangle({
      x, y, width, height,
      borderColor: rgb(0.8, 0, 0),
      borderWidth: 1
    });
    page.drawText('BARCODE ERROR', {
      x: x + 4,
      y: y + height / 2,
      size: 8,
      color: rgb(1, 0, 0)
    });
  }
}

/**
 * Render a QR code field to PDF
 */
export function renderQRCodeField(
  page: PDFPage,
  field: any,
  value: string,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  const qrValue = value || field.typeConfig?.staticValue || field.config?.staticValue || 'https://example.com';
  const errorCorrection = field.typeConfig?.qrErrorCorrection || field.config?.errorCorrection || 'M';
  
  try {
    const size = Math.min(width, height) - 4;
    
    // Generate QR code SVG
    const qr = new QRCode({
      content: qrValue,
      padding: 0,
      width: 256,
      height: 256,
      color: '#000000',
      background: '#ffffff',
      ecl: errorCorrection,
    });
    
    const svg = qr.svg();
    
    // Parse SVG dimensions
    const widthMatch = svg.match(/width="([0-9.]+)"/);
    const heightMatch = svg.match(/height="([0-9.]+)"/);
    
    let svgWidth = 256, svgHeight = 256;
    if (widthMatch && heightMatch) {
      svgWidth = parseFloat(widthMatch[1]);
      svgHeight = parseFloat(heightMatch[1]);
    }
    
    // Calculate scale and centering
    const scale = size / Math.max(svgWidth, svgHeight);
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
    
    // Parse and draw QR modules
    const rectRegex = /<rect\s+x="([^"]+)"\s+y="([^"]+)"\s+width="([^"]+)"\s+height="([^"]+)"/g;
    let match;
    let isFirstRect = true;
    
    while ((match = rectRegex.exec(svg)) !== null) {
      // Skip first rect (background)
      if (isFirstRect) {
        isFirstRect = false;
        continue;
      }
      
      const rectX = parseFloat(match[1]);
      const rectY = parseFloat(match[2]);
      const rectW = parseFloat(match[3]);
      const rectH = parseFloat(match[4]);
      
      page.drawRectangle({
        x: offsetX + (rectX * scale),
        y: offsetY + size - ((rectY + rectH) * scale),
        width: rectW * scale,
        height: rectH * scale,
        color: rgb(0, 0, 0)
      });
    }
  } catch (error) {
    console.error('QR code generation error:', error);
    page.drawRectangle({
      x, y, width, height,
      borderColor: rgb(0.8, 0, 0),
      borderWidth: 1
    });
    page.drawText('QR ERROR', {
      x: x + 4,
      y: y + height / 2,
      size: 8,
      color: rgb(1, 0, 0)
    });
  }
}

/**
 * Render a sequence number field to PDF
 */
export async function renderSequenceField(
  page: PDFPage,
  pdfDoc: PDFDocument,
  fontCollection: FontCollection,
  field: any,
  recordIndex: number,
  x: number,
  y: number,
  width: number,
  height: number
): Promise<void> {
  const config = field.typeConfig || field.config || {};
  const start = config.sequenceStart || config.startNumber || 1;
  const prefix = config.sequencePrefix || config.prefix || '';
  const suffix = config.sequenceSuffix || config.suffix || '';
  const padding = config.sequencePadding || config.padding || 0;
  
  const number = start + recordIndex;
  const paddedNumber = String(number).padStart(padding, '0');
  const value = prefix + paddedNumber + suffix;
  
  const fontSize = field.style?.fontSize || 12;
  const fontFamily = field.style?.fontFamily || 'Roboto';
  const fontWeight = field.style?.fontWeight || 'normal';
  const textAlign = field.style?.textAlign || 'left';
  const colorHex = field.style?.color || '#000000';
  
  const font = await getOrEmbedFont(pdfDoc, fontCollection, fontFamily, fontWeight);
  const { r, g, b } = parseColor(colorHex);
  
  // Calculate X position based on alignment
  let xPos = x + 4;
  const textWidth = font.widthOfTextAtSize(value, fontSize);
  
  switch (textAlign) {
    case 'center':
      xPos = x + (width - textWidth) / 2;
      break;
    case 'right':
      xPos = x + width - textWidth - 4;
      break;
  }
  
  // Render from top of box
  const yPos = y + height - fontSize - 4;
  
  page.drawText(value, {
    x: xPos,
    y: yPos,
    size: fontSize,
    font: font,
    color: rgb(r, g, b)
  });
}

/**
 * Render an address block to PDF
 */
export async function renderAddressBlock(
  page: PDFPage,
  pdfDoc: PDFDocument,
  fontCollection: FontCollection,
  field: any,
  dataRow: Record<string, any>,
  mappings: Record<string, string>,
  x: number,
  y: number,
  width: number,
  height: number
): Promise<void> {
  const combinedFields = field.combinedFields || field.config?.combinedFields || [field.templateField];
  
  // Gather field values
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
  
  const fontSize = field.style?.fontSize || 12;
  const fontFamily = field.style?.fontFamily || 'Roboto';
  const fontWeight = field.style?.fontWeight || 'normal';
  const colorHex = field.style?.color || '#000000';
  const lineHeight = 1.2;
  
  const font = await getOrEmbedFont(pdfDoc, fontCollection, fontFamily, fontWeight);
  const { r, g, b } = parseColor(colorHex);
  
  // Render lines from top
  let yOffset = y + height - fontSize - 4;
  
  for (const line of lines) {
    if (yOffset < y) break;
    
    page.drawText(line, {
      x: x + 4,
      y: yOffset,
      size: fontSize,
      font: font,
      color: rgb(r, g, b)
    });
    
    yOffset -= fontSize * lineHeight;
  }
}

/**
 * Render a shape element to PDF
 */
export function renderShapeField(
  page: PDFPage,
  field: any,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  const shapeType = field.config?.shapeType || 'rectangle';
  const fillColor = field.style?.fill || '#e5e5e5';
  const strokeColor = field.style?.stroke || '#000000';
  const strokeWidth = field.style?.strokeWidth || 0.5;
  const opacity = field.style?.opacity || 1;
  
  const fill = parseColor(fillColor);
  const stroke = parseColor(strokeColor);
  
  if (shapeType === 'circle' || shapeType === 'ellipse') {
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    const radius = Math.min(width, height) / 2;
    
    page.drawCircle({
      x: centerX,
      y: centerY,
      size: radius,
      color: rgb(fill.r, fill.g, fill.b),
      borderColor: rgb(stroke.r, stroke.g, stroke.b),
      borderWidth: strokeWidth,
      opacity: opacity,
    });
  } else {
    // Rectangle
    page.drawRectangle({
      x, y, width, height,
      color: rgb(fill.r, fill.g, fill.b),
      borderColor: rgb(stroke.r, stroke.g, stroke.b),
      borderWidth: strokeWidth,
      opacity: opacity,
    });
  }
}
