import CreativeEditorSDK from '@cesdk/cesdk-js';
import { generateBarcodeSVG, generateQRCodeSVG } from '@/lib/barcode-svg-utils';

export interface VariableData {
  [key: string]: string | number | boolean;
}

/**
 * Resolve all variables in a CE.SDK scene with actual data values
 * This handles both text variables and barcode/QR code regeneration
 */
export async function resolveVariables(
  engine: CreativeEditorSDK['engine'],
  data: VariableData
): Promise<void> {
  // Set all string variables using CE.SDK's native variable system
  Object.entries(data).forEach(([key, value]) => {
    try {
      engine.variable.setString(key, String(value));
    } catch (e) {
      console.warn(`Failed to set variable ${key}:`, e);
    }
  });
  
  // Update barcode/QR graphic blocks with resolved values
  await updateBarcodeBlocks(engine, data);
}

/**
 * Update all barcode and QR code blocks with resolved variable data
 */
async function updateBarcodeBlocks(
  engine: CreativeEditorSDK['engine'],
  data: VariableData
): Promise<void> {
  try {
    // Find all graphic blocks
    const graphicBlocks = engine.block.findByType('//ly.img.ubq/graphic');
    
    for (const blockId of graphicBlocks) {
      // Check if this block has barcode metadata
      const metadata = getBarcodeMetadata(engine, blockId);
      
      if (metadata && metadata.isVariable && metadata.variableField) {
        const fieldValue = data[metadata.variableField];
        
        if (fieldValue !== undefined) {
          // Regenerate the barcode/QR with the actual value
          const newSvgDataUrl = metadata.barcodeType === 'qrcode'
            ? generateQRCodeDataUrl(String(fieldValue))
            : generateBarcodeDataUrl(String(fieldValue), metadata.barcodeFormat || 'code128');
          
          // Update the block's image fill
          await updateBlockImage(engine, blockId, newSvgDataUrl);
        }
      }
    }
  } catch (e) {
    console.warn('Failed to update barcode blocks:', e);
  }
}

/**
 * Get barcode metadata from a block's fill
 */
function getBarcodeMetadata(
  engine: CreativeEditorSDK['engine'],
  blockId: number
): BarcodeMetadata | null {
  try {
    // Check if block has image fill
    const fill = engine.block.getFill(blockId);
    if (!fill) return null;
    
    // Try to get the image URI and parse metadata from it
    const uri = engine.block.getString(fill, 'fill/image/imageFileURI');
    
    // Check if this is a barcode data URL with metadata
    if (uri && uri.includes('data:image/svg+xml')) {
      // Look for metadata in block name or custom properties
      const name = engine.block.getName(blockId);
      
      if (name?.startsWith('barcode:') || name?.startsWith('qrcode:')) {
        const [type, format, field] = name.split(':');
        return {
          barcodeType: type as 'barcode' | 'qrcode',
          barcodeFormat: format,
          variableField: field,
          isVariable: !!field,
        };
      }
    }
    
    return null;
  } catch (e) {
    return null;
  }
}

interface BarcodeMetadata {
  barcodeType: 'barcode' | 'qrcode';
  barcodeFormat?: string;
  variableField?: string;
  isVariable: boolean;
}

/**
 * Update a block's image fill with a new data URL
 */
async function updateBlockImage(
  engine: CreativeEditorSDK['engine'],
  blockId: number,
  dataUrl: string
): Promise<void> {
  try {
    const fill = engine.block.getFill(blockId);
    if (fill) {
      engine.block.setString(fill, 'fill/image/imageFileURI', dataUrl);
    }
  } catch (e) {
    console.warn(`Failed to update block ${blockId} image:`, e);
  }
}

/**
 * Generate a barcode SVG data URL
 */
function generateBarcodeDataUrl(value: string, format: string): string {
  const svg = generateBarcodeSVG(value, format.toUpperCase(), {
    height: 75,
    includetext: true,
  });
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

/**
 * Generate a QR code SVG data URL
 */
function generateQRCodeDataUrl(value: string): string {
  const svg = generateQRCodeSVG(value, { width: 200, height: 200 });
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

/**
 * Get all variable names used in the scene
 */
export function getUsedVariables(engine: CreativeEditorSDK['engine']): string[] {
  const variables = new Set<string>();
  
  try {
    // Find text blocks with {{variable}} syntax
    const textBlocks = engine.block.findByType('//ly.img.ubq/text');
    
    textBlocks.forEach((blockId) => {
      const text = engine.block.getString(blockId, 'text/text');
      const matches = text.matchAll(/\{\{(\w+)\}\}/g);
      
      for (const match of matches) {
        variables.add(match[1]);
      }
    });
    
    // Find barcode blocks with variable fields
    const graphicBlocks = engine.block.findByType('//ly.img.ubq/graphic');
    
    graphicBlocks.forEach((blockId) => {
      const name = engine.block.getName(blockId);
      
      if (name?.startsWith('barcode:') || name?.startsWith('qrcode:')) {
        const parts = name.split(':');
        if (parts[2]) {
          variables.add(parts[2]);
        }
      }
    });
  } catch (e) {
    console.warn('Failed to get used variables:', e);
  }
  
  return Array.from(variables);
}
