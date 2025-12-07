import { AssetSource, AssetResult, AssetsQueryResult, CreativeEngine } from '@cesdk/cesdk-js';
import { generateBarcodeDataUrl, generateQRCodeDataUrl, getValidSampleValue } from '@/lib/barcode-svg-utils';

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

// Thumbnail cache to avoid regenerating the same barcodes
const thumbnailCache = new Map<string, string>();

/**
 * Get a cached thumbnail or generate and cache a new one
 */
function getCachedBarcodeThumbnail(format: string, value: string): string {
  const cacheKey = `barcode:${format}:${value}`;
  if (thumbnailCache.has(cacheKey)) {
    return thumbnailCache.get(cacheKey)!;
  }
  const dataUrl = generateBarcodeDataUrl(value, format, { height: 75, includetext: true });
  thumbnailCache.set(cacheKey, dataUrl);
  return dataUrl;
}

function getCachedQRCodeThumbnail(value: string): string {
  const cacheKey = `qrcode:${value}`;
  if (thumbnailCache.has(cacheKey)) {
    return thumbnailCache.get(cacheKey)!;
  }
  const dataUrl = generateQRCodeDataUrl(value, { width: 100, height: 100 });
  thumbnailCache.set(cacheKey, dataUrl);
  return dataUrl;
}

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
          const dataUrl = getCachedBarcodeThumbnail(format.id, sampleValue);
          
          assets.push({
            id: `barcode-static-${format.id}`,
            label: format.label,
            tags: ['barcode', 'static', format.id],
            meta: {
              uri: dataUrl,
              thumbUri: dataUrl,
              blockType: '//ly.img.ubq/graphic',
              fillType: '//ly.img.ubq/fill/image',
              shapeType: '//ly.img.ubq/shape/rect',
              kind: 'image',
              width: 200,
              height: 100,
              mimeType: 'image/png',
              barcodeType: 'barcode',
              barcodeFormat: format.id,
              isVariable: false,
            },
          });
        }
      });
      
      // Add static QR code option
      if (!query || 'qr'.includes(query) || 'qrcode'.includes(query)) {
        const qrDataUrl = getCachedQRCodeThumbnail('https://example.com');
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
            mimeType: 'image/svg+xml',
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
            const dataUrl = getCachedBarcodeThumbnail(format.id, sampleValue);
            
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
                mimeType: 'image/png',
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
          const qrDataUrl = getCachedQRCodeThumbnail(qrValue);
          
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
              mimeType: 'image/svg+xml',
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
      const blockId = await engine.asset.defaultApplyAsset(assetResult);
      
      // Set block name with metadata for config panel detection
      if (blockId !== undefined) {
        const meta = assetResult.meta;
        const barcodeType = meta?.barcodeType as string || 'barcode';
        const format = meta?.barcodeFormat as string || 'code128';
        const isVariable = meta?.isVariable as boolean || false;
        const variableField = meta?.variableField as string || '';
        
        // Format: "barcode:format:dataSource:value" or "qrcode:dataSource:value"
        let blockName: string;
        if (barcodeType === 'qrcode') {
          if (isVariable && variableField) {
            blockName = `qrcode:field:${variableField}`;
          } else {
            blockName = `qrcode:static:https://example.com`;
          }
        } else {
          if (isVariable && variableField) {
            blockName = `barcode:${format}:field:${variableField}`;
          } else {
            blockName = `barcode:${format}:static:${getValidSampleValue(format)}`;
          }
        }
        
        engine.block.setName(blockId, blockName);
      }
      
      return blockId;
    },
    
    applyAssetToBlock: async (assetResult: AssetResult, block: number): Promise<void> => {
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

export default createBarcodeAssetSource;