import { AssetSource, AssetResult, AssetsQueryResult, CreativeEngine } from '@cesdk/cesdk-js';
import { detectImageColumnsFromValues } from '@/lib/avery-labels';

export interface ImageAssetConfig {
  availableFields?: string[];
  sampleData?: Record<string, string>;
  allSampleData?: Record<string, string>[]; // All rows for better image detection
  projectId?: string;
  workspaceId?: string;
  projectImages?: { name: string; url: string }[];
}

// Placeholder image for VDP image blocks
const PLACEHOLDER_IMAGE = 'data:image/svg+xml;base64,' + btoa(`
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
  <rect width="200" height="200" fill="#f3f4f6"/>
  <path d="M75 50 L125 50 L125 100 L75 100 Z" fill="none" stroke="#9ca3af" stroke-width="2"/>
  <circle cx="90" cy="65" r="5" fill="#9ca3af"/>
  <path d="M75 95 L95 75 L115 90 L125 80" fill="none" stroke="#9ca3af" stroke-width="2"/>
  <text x="100" y="140" text-anchor="middle" fill="#6b7280" font-size="14">Variable Image</text>
  <text x="100" y="160" text-anchor="middle" fill="#9ca3af" font-size="11">{{field_name}}</text>
</svg>
`);

/**
 * Create an asset source for VDP images in CE.SDK
 * Allows users to add image placeholders that will be replaced with actual images per record
 */
export function createImageAssetSource(
  config: ImageAssetConfig = {},
  engine: CreativeEngine
): AssetSource {
  const { availableFields = [], sampleData = {}, allSampleData = [], projectImages = [] } = config;

  // Detect image fields using value-based detection (handles "Unnamed_Column_2" etc.)
  const sampleRows = allSampleData.length > 0 ? allSampleData : (Object.keys(sampleData).length > 0 ? [sampleData] : []);
  const imageFields = detectImageColumnsFromValues(availableFields, sampleRows);

  return {
    id: 'vdp-images',
    
    findAssets: async (queryData): Promise<AssetsQueryResult> => {
      const query = queryData?.query?.toLowerCase() || '';
      
      const assets: AssetResult[] = [];
      
      // Helper to normalize image names for matching
      const normalizeForMatch = (name: string): string => {
        let baseName = name;
        if (name.includes('\\')) baseName = name.split('\\').pop() || name;
        else if (name.includes('/')) baseName = name.split('/').pop() || name;
        if (baseName.includes('?')) baseName = baseName.split('?')[0];
        return baseName.replace(/\.(png|jpg|jpeg|gif|webp|svg|bmp|tiff?)$/i, '').toLowerCase().trim();
      };
      
      // Add variable image placeholders for detected fields
      imageFields.forEach((field) => {
        if (!query || field.toLowerCase().includes(query) || 'image'.includes(query)) {
          // Check if we have a sample image for this field
          const sampleValue = sampleData[field];
          const normalizedSample = sampleValue ? normalizeForMatch(String(sampleValue)) : '';
          
          // Find matching image using normalized comparison
          const matchingImage = normalizedSample 
            ? projectImages.find(img => normalizeForMatch(img.name) === normalizedSample)
            : null;
          
          const thumbnailUrl = matchingImage?.url || PLACEHOLDER_IMAGE;
          
          assets.push({
            id: `vdp-image-${field}`,
            label: `Image: {{${field}}}`,
            tags: ['image', 'variable', field],
            meta: {
              uri: thumbnailUrl,
              thumbUri: thumbnailUrl,
              blockType: '//ly.img.ubq/graphic',
              fillType: '//ly.img.ubq/fill/image',
              shapeType: '//ly.img.ubq/shape/rect',
              kind: 'image',
              width: 200,
              height: 200,
              mimeType: 'image/png',
              isVariable: true,
              variableField: field,
              imageType: 'vdp',
            },
          });
        }
      });
      
      // Add option for custom field selection
      if (!query || 'custom'.includes(query) || 'other'.includes(query)) {
        assets.push({
          id: 'vdp-image-custom',
          label: 'Custom Image Field',
          tags: ['image', 'variable', 'custom'],
          meta: {
            uri: PLACEHOLDER_IMAGE,
            thumbUri: PLACEHOLDER_IMAGE,
            blockType: '//ly.img.ubq/graphic',
            fillType: '//ly.img.ubq/fill/image',
            shapeType: '//ly.img.ubq/shape/rect',
            kind: 'image',
            width: 200,
            height: 200,
            mimeType: 'image/png',
            isVariable: true,
            variableField: '',
            imageType: 'vdp-custom',
          },
        });
      }
      
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
      
      // Set block name with VDP naming convention for image resolution
      if (blockId !== undefined) {
        const meta = assetResult.meta;
        const variableField = meta?.variableField as string || '';
        
        // Format: "vdp:image:FIELD_NAME"
        const blockName = variableField 
          ? `vdp:image:${variableField}`
          : 'vdp:image:FIELD_NAME'; // Placeholder for custom field selection
        
        engine.block.setName(blockId, blockName);
        
        console.log(`✅ Created VDP image block: ${blockName}`);
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
 * Parse VDP image block name to extract field name
 */
export function parseImageBlockName(blockName: string): { fieldName: string } | null {
  if (!blockName?.startsWith('vdp:image:')) return null;
  
  const fieldName = blockName.replace('vdp:image:', '');
  return { fieldName };
}

/**
 * Create a VDP image block name
 */
export function createImageBlockName(fieldName: string): string {
  return `vdp:image:${fieldName}`;
}

export default createImageAssetSource;