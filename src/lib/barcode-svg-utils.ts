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

// Map format names to bwip-js bcid values
const BCID_MAP: Record<string, string> = {
  'CODE128': 'code128',
  'CODE39': 'code39',
  'EAN13': 'ean13',
  'UPCA': 'upca',
  'code128': 'code128',
  'code39': 'code39',
  'ean13': 'ean13',
  'upca': 'upca'
};

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
 * Generate a PNG data URL for a barcode using bwip-js (FAST - no pixel conversion)
 */
export function generateBarcodeDataUrl(
  value: string,
  format: string,
  options: BarcodeOptions = {}
): string {
  try {
    const canvas = document.createElement('canvas');
    const bcid = BCID_MAP[format] || BCID_MAP[format.toUpperCase()] || 'code128';
    
    bwipjs.toCanvas(canvas, {
      bcid: bcid,
      text: value,
      scale: 3,
      height: options.height ? options.height / 3 : 10,
      includetext: options.includetext ?? false,
      textxalign: 'center',
    });
    
    // Direct canvas to data URL - no pixel-by-pixel conversion!
    return canvas.toDataURL('image/png');
  } catch (error) {
    console.error('Error generating barcode data URL:', error);
    return generateErrorPlaceholderDataUrl('Barcode Error');
  }
}

/**
 * Generate SVG string for a barcode using bwip-js (LEGACY - use generateBarcodeDataUrl for better performance)
 */
export function generateBarcodeSVG(
  value: string,
  format: string,
  options: BarcodeOptions = {}
): string {
  try {
    const canvas = document.createElement('canvas');
    const bcid = BCID_MAP[format] || BCID_MAP[format.toUpperCase()] || 'code128';
    
    bwipjs.toCanvas(canvas, {
      bcid: bcid,
      text: value,
      scale: 3,
      height: options.height ? options.height / 3 : 10,
      includetext: options.includetext ?? false,
      textxalign: 'center',
    });
    
    const svgWidth = canvas.width;
    const svgHeight = canvas.height;
    
    // Embed the canvas as a data URL in an SVG - much faster than pixel-by-pixel
    const pngDataUrl = canvas.toDataURL('image/png');
    
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">
      <image href="${pngDataUrl}" width="${svgWidth}" height="${svgHeight}"/>
    </svg>`;
  } catch (error) {
    console.error('Error generating barcode SVG:', error);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">
      <rect width="200" height="100" fill="white" stroke="black"/>
      <text x="100" y="50" text-anchor="middle" font-size="12" fill="red">Barcode Error</text>
    </svg>`;
  }
}

/**
 * Generate a PNG data URL for a QR code (FAST)
 */
export function generateQRCodeDataUrl(
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
    
    const svg = qr.svg();
    return `data:image/svg+xml;base64,${btoa(svg)}`;
  } catch (error) {
    console.error('Error generating QR code data URL:', error);
    return generateErrorPlaceholderDataUrl('QR Error');
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
    return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
      <rect width="200" height="200" fill="white" stroke="black"/>
      <text x="100" y="100" text-anchor="middle" font-size="12" fill="red">QR Error</text>
    </svg>`;
  }
}

/**
 * Generate an error placeholder as a data URL
 */
function generateErrorPlaceholderDataUrl(message: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">
    <rect width="200" height="100" fill="white" stroke="#ccc"/>
    <text x="100" y="50" text-anchor="middle" font-size="12" fill="#999">${message}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

/**
 * Get minimum recommended size in mm for a barcode format
 */
export function getMinimumBarcodeSize(format: string): { width: number; height: number } {
  const sizes: Record<string, { width: number; height: number }> = {
    'CODE128': { width: 30, height: 21 },
    'CODE39': { width: 30, height: 21 },
    'EAN13': { width: 37.29, height: 25.93 },
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
