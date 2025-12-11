import CreativeEditorSDK from '@cesdk/cesdk-js';
import { generateBarcodeSVG, generateQRCodeSVG } from '@/lib/barcode-svg-utils';
import { parseSequenceMetadata, formatSequenceNumber } from '@/components/cesdk/sequenceAssetSource';

export interface VariableData {
  [key: string]: string | number | boolean;
}

/**
 * Resolve all variables in a CE.SDK scene with actual data values
 * Uses direct text replacement (replaceText) to match canvas preview behavior
 */
export async function resolveVariables(
  engine: CreativeEditorSDK['engine'],
  data: VariableData,
  recordIndex: number = 0
): Promise<void> {
  // Find all text blocks and update content based on VDP naming convention
  const textBlocks = engine.block.findByType('//ly.img.ubq/text');
  
  for (const blockId of textBlocks) {
    try {
      const blockName = engine.block.getName(blockId);
      
      if (!blockName) continue;
      
      if (blockName.startsWith('vdp:sequence:')) {
        // Sequential number - calculate based on record index
        const seqConfig = parseSequenceMetadata(blockName);
        if (seqConfig) {
          const value = formatSequenceNumber(seqConfig, recordIndex);
          engine.block.replaceText(blockId, value);
        }
      } else if (blockName.startsWith('vdp:address_block:')) {
        // Combined address block - multiple fields joined with newlines
        const fieldNames = blockName.replace('vdp:address_block:', '').split(',');
        const content = fieldNames
          .map(f => String(data[f.trim()] || ''))
          .filter(Boolean)
          .join('\n');
        engine.block.replaceText(blockId, content || ' ');
      } else if (blockName.startsWith('vdp:text:')) {
        // Individual field
        const fieldName = blockName.replace('vdp:text:', '');
        const value = data[fieldName];
        engine.block.replaceText(blockId, value !== undefined ? String(value) : ' ');
      }
    } catch (e) {
      console.warn(`Failed to update text block ${blockId}:`, e);
    }
  }
  
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
      const blockName = engine.block.getName(blockId);
      
      if (!blockName) continue;
      
      // Check for barcode naming convention: vdp:barcode:FORMAT:FIELD or vdp:qrcode:FIELD
      if (blockName.startsWith('vdp:barcode:')) {
        const parts = blockName.replace('vdp:barcode:', '').split(':');
        const format = parts[0] || 'code128';
        const fieldName = parts[1];
        
        if (fieldName && data[fieldName] !== undefined) {
          const value = String(data[fieldName]);
          const newSvgDataUrl = generateBarcodeDataUrl(value, format);
          await updateBlockImage(engine, blockId, newSvgDataUrl);
        }
      } else if (blockName.startsWith('vdp:qrcode:')) {
        const fieldName = blockName.replace('vdp:qrcode:', '');
        
        if (fieldName && data[fieldName] !== undefined) {
          const value = String(data[fieldName]);
          const newSvgDataUrl = generateQRCodeDataUrl(value);
          await updateBlockImage(engine, blockId, newSvgDataUrl);
        }
      } else {
        // Legacy format: barcode:format:field or qrcode::field
        const metadata = getBarcodeMetadata(engine, blockId);
        
        if (metadata && metadata.isVariable && metadata.variableField) {
          const fieldValue = data[metadata.variableField];
          
          if (fieldValue !== undefined) {
            const newSvgDataUrl = metadata.barcodeType === 'qrcode'
              ? generateQRCodeDataUrl(String(fieldValue))
              : generateBarcodeDataUrl(String(fieldValue), metadata.barcodeFormat || 'code128');
            
            await updateBlockImage(engine, blockId, newSvgDataUrl);
          }
        }
      }
    }
  } catch (e) {
    console.warn('Failed to update barcode blocks:', e);
  }
}

/**
 * Get barcode metadata from a block's name (legacy format)
 */
function getBarcodeMetadata(
  engine: CreativeEditorSDK['engine'],
  blockId: number
): BarcodeMetadata | null {
  try {
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
    // Find text blocks with VDP naming
    const textBlocks = engine.block.findByType('//ly.img.ubq/text');
    
    textBlocks.forEach((blockId) => {
      const name = engine.block.getName(blockId);
      
      if (name?.startsWith('vdp:text:')) {
        variables.add(name.replace('vdp:text:', ''));
      } else if (name?.startsWith('vdp:address_block:')) {
        const fields = name.replace('vdp:address_block:', '').split(',');
        fields.forEach(f => variables.add(f.trim()));
      }
      
      // Also check for {{variable}} syntax in text content
      const text = engine.block.getString(blockId, 'text/text');
      const matches = text.matchAll(/\{\{(\w+)\}\}/g);
      
      for (const match of matches) {
        variables.add(match[1]);
      }
    });
    
    // Find barcode/QR blocks with variable fields
    const graphicBlocks = engine.block.findByType('//ly.img.ubq/graphic');
    
    graphicBlocks.forEach((blockId) => {
      const name = engine.block.getName(blockId);
      
      if (name?.startsWith('vdp:barcode:')) {
        const parts = name.replace('vdp:barcode:', '').split(':');
        if (parts[1]) variables.add(parts[1]);
      } else if (name?.startsWith('vdp:qrcode:')) {
        const field = name.replace('vdp:qrcode:', '');
        if (field) variables.add(field);
      } else if (name?.startsWith('barcode:') || name?.startsWith('qrcode:')) {
        const parts = name.split(':');
        if (parts[2]) variables.add(parts[2]);
      }
    });
  } catch (e) {
    console.warn('Failed to get used variables:', e);
  }
  
  return Array.from(variables);
}
