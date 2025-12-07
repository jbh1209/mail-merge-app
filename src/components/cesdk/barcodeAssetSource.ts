import { AssetSource, AssetResult, AssetsQueryResult, CreativeEngine } from '@cesdk/cesdk-js';
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

/**
 * Create an asset source for barcodes and QR codes in CE.SDK
 * Supports both static values and variable data (VDP)
 */
export function createBarcodeAssetSource(
  config: BarcodeAssetConfig = {},
  engine: CreativeEngine
): AssetSource {
  const { availableFields = [], sampleData = {} } = config;

  return {
    id: 'barcodes-qrcodes',
    
    findAssets: async (queryData): Promise<AssetsQueryResult> => {
      const query = queryData?.query?.toLowerCase() || '';
      
      const assets: AssetResult[] = [];
      
      // Add static barcode options
      BARCODE_FORMATS.forEach((format) => {
        if (!query || format.label.toLowerCase().includes(query) || 'barcode'.includes(query)) {
          const sampleValue = getValidSampleValue(format.id);
          const dataUrl = generateBarcodeSVGDataUrl(sampleValue, format.id);
          
          assets.push({
            id: `barcode-static-${format.id}`,
            label: format.label,
            tags: ['barcode', 'static', format.id],
            meta: {
              // Required fields for CE.SDK to apply the asset
              uri: dataUrl,
              thumbUri: dataUrl,
              blockType: '//ly.img.ubq/graphic',
              fillType: '//ly.img.ubq/fill/image',
              shapeType: '//ly.img.ubq/shape/rect',
              kind: 'image',
              width: 200,
              height: 100,
              // Custom metadata for VDP
              barcodeType: 'barcode',
              barcodeFormat: format.id,
              isVariable: false,
            },
          });
        }
      });
      
      // Add static QR code option
      if (!query || 'qr'.includes(query) || 'qrcode'.includes(query)) {
        const qrDataUrl = generateQRCodeSVGDataUrl('https://example.com');
        assets.push({
          id: 'qrcode-static',
          label: 'QR Code',
          tags: ['qrcode', 'static'],
          meta: {
            uri: qrDataUrl,
            thumbUri: qrDataUrl,
            blockType: '//ly.img.ubq/graphic',
            fillType: '//ly.img.ubq/fill/image',
            shapeType: '//ly.img.ubq/shape/rect',
            kind: 'image',
            width: 100,
            height: 100,
            barcodeType: 'qrcode',
            isVariable: false,
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
            const fieldValue = sampleData[field];
            const sampleValue = fieldValue && isValidForFormat(fieldValue, format.id) 
              ? fieldValue 
              : getValidSampleValue(format.id);
            const dataUrl = generateBarcodeSVGDataUrl(sampleValue, format.id);
            
            assets.push({
              id: `barcode-var-${format.id}-${field}`,
              label: `${format.label} ({{${field}}})`,
              tags: ['barcode', 'variable', format.id, field],
              meta: {
                uri: dataUrl,
                thumbUri: dataUrl,
                blockType: '//ly.img.ubq/graphic',
                fillType: '//ly.img.ubq/fill/image',
                shapeType: '//ly.img.ubq/shape/rect',
                kind: 'image',
                width: 200,
                height: 100,
                barcodeType: 'barcode',
                barcodeFormat: format.id,
                isVariable: true,
                variableField: field,
                sampleValue,
              },
            });
          }
        });
        
        // Variable QR code
        if (!query || 'qr'.includes(query) || field.toLowerCase().includes(query)) {
          const qrValue = sampleData[field] || 'https://example.com';
          const qrDataUrl = generateQRCodeSVGDataUrl(qrValue);
          
          assets.push({
            id: `qrcode-var-${field}`,
            label: `QR Code ({{${field}}})`,
            tags: ['qrcode', 'variable', field],
            meta: {
              uri: qrDataUrl,
              thumbUri: qrDataUrl,
              blockType: '//ly.img.ubq/graphic',
              fillType: '//ly.img.ubq/fill/image',
              shapeType: '//ly.img.ubq/shape/rect',
              kind: 'image',
              width: 100,
              height: 100,
              barcodeType: 'qrcode',
              isVariable: true,
              variableField: field,
              sampleValue: qrValue,
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
    
    applyAsset: async (assetResult: AssetResult): Promise<number | undefined> => {
      // Use CE.SDK's default apply which handles block creation from metadata
      return engine.asset.defaultApplyAsset(assetResult);
    },
    
    applyAssetToBlock: async (assetResult: AssetResult, block: number): Promise<void> => {
      // Apply to existing block - update the fill
      const meta = assetResult.meta;
      if (meta?.uri) {
        const fill = engine.block.getFill(block);
        if (fill && engine.block.isValid(fill)) {
          engine.block.setString(fill, 'fill/image/imageFileURI', meta.uri as string);
        }
      }
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
