// @ts-ignore - bwip-js types are defined in src/types/bwip-js.d.ts
import bwipjs from 'bwip-js';
// @ts-ignore - qrcode-svg has no TypeScript definitions
import QRCode from 'qrcode-svg';

export interface BarcodeOptions {
  width?: number;
  height?: number;
  includetext?: boolean;
  textsize?: number;
}

export interface QRCodeOptions {
  width?: number;
  height?: number;
  ecLevel?: 'L' | 'M' | 'Q' | 'H';
}

export interface BarcodeValidationResult {
  valid: boolean;
  message?: string;
}

/**
 * Validate barcode input for a specific format
 */
export function validateBarcodeInput(value: string, format: string): BarcodeValidationResult {
  const upperFormat = format.toUpperCase();
  
  switch (upperFormat) {
    case 'EAN13':
      if (!/^\d{13}$/.test(value)) {
        return { valid: false, message: 'EAN-13 requires exactly 13 numeric digits' };
      }
      break;
    case 'UPCA':
      if (!/^\d{12}$/.test(value)) {
        return { valid: false, message: 'UPC-A requires exactly 12 numeric digits' };
      }
      break;
    case 'CODE128':
    case 'CODE39':
      if (!value || value.length === 0) {
        return { valid: false, message: 'Barcode value cannot be empty' };
      }
      break;
  }
  
  return { valid: true };
}

/**
 * Get a valid sample value for a barcode format
 */
export function getValidSampleValue(format: string): string {
  const upperFormat = format.toUpperCase();
  
  switch (upperFormat) {
    case 'EAN13':
      return '5901234123457'; // Valid EAN-13 with check digit
    case 'UPCA':
      return '012345678905'; // Valid UPC-A with check digit
    case 'CODE128':
    case 'CODE39':
    default:
      return '123456789';
  }
}

/**
 * Generate SVG string for a barcode using bwip-js
 */
export function generateBarcodeSVG(
  value: string,
  format: string,
  options: BarcodeOptions = {}
): string {
  try {
    // Create a canvas element for bwip-js
    const canvas = document.createElement('canvas');
    
    // Map our format names to bwip-js bcid values
    const bcidMap: Record<string, string> = {
      'CODE128': 'code128',
      'CODE39': 'code39',
      'EAN13': 'ean13',
      'UPCA': 'upca',
      'code128': 'code128',
      'code39': 'code39',
      'ean13': 'ean13',
      'upca': 'upca'
    };
    
    const bcid = bcidMap[format] || 'code128';
    
    bwipjs.toCanvas(canvas, {
      bcid: bcid,
      text: value,
      scale: 3,
      height: options.height ? options.height / 3 : 10,
      includetext: options.includetext ?? false,
      textxalign: 'center',
    });
    
    // Convert canvas to SVG
    const svgWidth = canvas.width;
    const svgHeight = canvas.height;
    const ctx = canvas.getContext('2d');
    const imageData = ctx?.getImageData(0, 0, svgWidth, svgHeight);
    
    if (!imageData) {
      throw new Error('Failed to get image data from canvas');
    }
    
    // Build SVG from pixel data
    let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">`;
    svgContent += `<rect width="${svgWidth}" height="${svgHeight}" fill="white"/>`;
    
    // Draw black pixels as rectangles
    for (let y = 0; y < svgHeight; y++) {
      for (let x = 0; x < svgWidth; x++) {
        const index = (y * svgWidth + x) * 4;
        const r = imageData.data[index];
        const g = imageData.data[index + 1];
        const b = imageData.data[index + 2];
        
        // If pixel is black (or dark)
        if (r < 128 && g < 128 && b < 128) {
          svgContent += `<rect x="${x}" y="${y}" width="1" height="1" fill="black"/>`;
        }
      }
    }
    
    svgContent += '</svg>';
    
    return svgContent;
  } catch (error) {
    console.error('Error generating barcode SVG:', error);
    // Return a placeholder SVG
    return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">
      <rect width="200" height="100" fill="white" stroke="black"/>
      <text x="100" y="50" text-anchor="middle" font-size="12" fill="red">Barcode Error</text>
    </svg>`;
  }
}

/**
 * Generate SVG string for a QR code using qrcode-svg
 */
export function generateQRCodeSVG(
  value: string,
  options: QRCodeOptions = {}
): string {
  try {
    const qr = new QRCode({
      content: value || 'https://example.com',
      padding: 0,
      width: options.width || 256,
      height: options.height || 256,
      color: '#000000',
      background: '#ffffff',
      ecl: options.ecLevel || 'M',
    });
    
    return qr.svg();
  } catch (error) {
    console.error('Error generating QR code SVG:', error);
    // Return a placeholder SVG
    return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
      <rect width="200" height="200" fill="white" stroke="black"/>
      <text x="100" y="100" text-anchor="middle" font-size="12" fill="red">QR Error</text>
    </svg>`;
  }
}

/**
 * Get minimum recommended size in mm for a barcode format
 */
export function getMinimumBarcodeSize(format: string): { width: number; height: number } {
  const sizes: Record<string, { width: number; height: number }> = {
    'CODE128': { width: 30, height: 21 },
    'CODE39': { width: 30, height: 21 },
    'EAN13': { width: 37.29, height: 25.93 }, // Standard EAN-13 size
    'UPCA': { width: 37.29, height: 25.93 },
  };
  
  return sizes[format] || { width: 30, height: 21 };
}

/**
 * Get minimum recommended size in mm for QR codes
 */
export function getMinimumQRCodeSize(): { width: number; height: number } {
  return { width: 20, height: 20 };
}
