import { AssetSource, AssetResult, AssetsQueryResult } from '@cesdk/cesdk-js';
import { generateBarcodeSVG, generateQRCodeSVG, getValidSampleValue } from '@/lib/barcode-svg-utils';

export interface BarcodeAssetConfig {
  availableFields?: string[];
  sampleData?: Record<string, string>;
}

// Barcode format definitions
const BARCODE_FORMATS = [
  { id: 'code128', label: 'Code 128', description: 'Alphanumeric, variable length' },
  { id: 'code39', label: 'Code 39', description: 'Alphanumeric, variable length' },
  { id: 'ean13', label: 'EAN-13', description: '13-digit numeric (retail)' },
  { id: 'upca', label: 'UPC-A', description: '12-digit numeric (US retail)' },
];

const QR_FORMATS = [
  { id: 'qrcode', label: 'QR Code', description: 'Universal 2D code' },
];

/**
 * Create an asset source for barcodes and QR codes in CE.SDK
 * Supports both static values and variable data (VDP)
 */
export function createBarcodeAssetSource(config: BarcodeAssetConfig = {}): AssetSource {
  const { availableFields = [], sampleData = {} } = config;

  return {
    id: 'barcodes-qrcodes',
    
    findAssets: async (queryData): Promise<AssetsQueryResult> => {
      const query = queryData?.query?.toLowerCase() || '';
      
      const assets: AssetResult[] = [];
      
      // Add static barcode options
      BARCODE_FORMATS.forEach((format) => {
        if (!query || format.label.toLowerCase().includes(query) || 'barcode'.includes(query)) {
          // Use format-specific valid sample data
          const sampleValue = getValidSampleValue(format.id);
          assets.push({
            id: `barcode-static-${format.id}`,
            label: format.label,
            tags: ['barcode', 'static', format.id],
            meta: {
              blockType: '//ly.img.ubq/graphic',
              fillType: '//ly.img.ubq/fill/image',
              barcodeType: 'barcode',
              barcodeFormat: format.id,
              isVariable: false,
              thumbUri: generateBarcodeSVGDataUrl(sampleValue, format.id),
            },
          });
        }
      });
      
      // Add static QR code option
      if (!query || 'qr'.includes(query) || 'qrcode'.includes(query)) {
        assets.push({
          id: 'qrcode-static',
          label: 'QR Code',
          tags: ['qrcode', 'static'],
          meta: {
            blockType: '//ly.img.ubq/graphic',
            fillType: '//ly.img.ubq/fill/image',
            barcodeType: 'qrcode',
            isVariable: false,
            thumbUri: generateQRCodeSVGDataUrl('https://example.com'),
          },
        });
      }
      
      // Add variable barcode options (one per field that makes sense for barcodes)
      const barcodeFields = availableFields.filter(field => 
        field.toLowerCase().includes('barcode') ||
        field.toLowerCase().includes('sku') ||
        field.toLowerCase().includes('code') ||
        field.toLowerCase().includes('id') ||
        field.toLowerCase().includes('upc') ||
        field.toLowerCase().includes('ean')
      );
      
      barcodeFields.forEach((field) => {
        BARCODE_FORMATS.forEach((format) => {
          if (!query || format.label.toLowerCase().includes(query) || field.toLowerCase().includes(query)) {
            // Use format-specific valid sample if field data isn't suitable
            const fieldValue = sampleData[field];
            const sampleValue = fieldValue && isValidForFormat(fieldValue, format.id) 
              ? fieldValue 
              : getValidSampleValue(format.id);
            
            assets.push({
              id: `barcode-var-${format.id}-${field}`,
              label: `${format.label} ({{${field}}})`,
              tags: ['barcode', 'variable', format.id, field],
              meta: {
                blockType: '//ly.img.ubq/graphic',
                fillType: '//ly.img.ubq/fill/image',
                barcodeType: 'barcode',
                barcodeFormat: format.id,
                isVariable: true,
                variableField: field,
                sampleValue,
                thumbUri: generateBarcodeSVGDataUrl(sampleValue, format.id),
              },
            });
          }
        });
        
        // Variable QR code
        if (!query || 'qr'.includes(query) || field.toLowerCase().includes(query)) {
          assets.push({
            id: `qrcode-var-${field}`,
            label: `QR Code ({{${field}}})`,
            tags: ['qrcode', 'variable', field],
            meta: {
              blockType: '//ly.img.ubq/graphic',
              fillType: '//ly.img.ubq/fill/image',
              barcodeType: 'qrcode',
              isVariable: true,
              variableField: field,
              sampleValue: sampleData[field] || 'https://example.com',
              thumbUri: generateQRCodeSVGDataUrl(sampleData[field] || 'https://example.com'),
            },
          });
        }
      });
      
      return {
        assets,
        currentPage: 1,
        nextPage: undefined,
        total: assets.length,
      };
    },
    
    applyAsset: async (assetResult): Promise<number | undefined> => {
      // The asset will be applied by the engine
      // We return undefined to let the default handler work
      return undefined;
    },
  };
}

/**
 * Check if a value is valid for a specific barcode format
 */
function isValidForFormat(value: string, formatId: string): boolean {
  switch (formatId) {
    case 'ean13':
      return /^\d{13}$/.test(value);
    case 'upca':
      return /^\d{12}$/.test(value);
    case 'code128':
    case 'code39':
      return value.length > 0;
    default:
      return true;
  }
}

/**
 * Generate a data URL for a barcode SVG
 */
function generateBarcodeSVGDataUrl(value: string, format: string): string {
  const svg = generateBarcodeSVG(value, format.toUpperCase(), { 
    height: 75, 
    includetext: true 
  });
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

/**
 * Generate a data URL for a QR code SVG
 */
function generateQRCodeSVGDataUrl(value: string): string {
  const svg = generateQRCodeSVG(value, { width: 100, height: 100 });
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

export default createBarcodeAssetSource;
