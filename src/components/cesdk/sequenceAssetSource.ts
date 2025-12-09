import { AssetSource, AssetResult, AssetsQueryResult } from '@cesdk/cesdk-js';

export interface SequenceConfig {
  start: number;
  prefix: string;
  suffix: string;
  padding: number;
}

// Parse sequence metadata from block name
// Format: "vdp:sequence:start:prefix:suffix:padding"
export function parseSequenceMetadata(name: string): SequenceConfig | null {
  if (!name || !name.startsWith('vdp:sequence:')) return null;
  
  const parts = name.replace('vdp:sequence:', '').split(':');
  if (parts.length < 4) return null;
  
  return {
    start: parseInt(parts[0], 10) || 1,
    prefix: parts[1] || '',
    suffix: parts[2] || '',
    padding: parseInt(parts[3], 10) || 4,
  };
}

// Format a sequence number based on config and record index
export function formatSequenceNumber(config: SequenceConfig, recordIndex: number): string {
  const number = (config.start + recordIndex).toString().padStart(config.padding, '0');
  return `${config.prefix}${number}${config.suffix}`;
}

// Create block name from sequence config
export function createSequenceBlockName(config: SequenceConfig): string {
  return `vdp:sequence:${config.start}:${config.prefix}:${config.suffix}:${config.padding}`;
}

// Create asset source for sequences - triggers callback instead of directly adding
export function createSequenceAssetSource(
  onSequenceRequested: () => void
): AssetSource {
  return {
    id: 'sequences',
    findAssets: async (): Promise<AssetsQueryResult> => {
      const assets: AssetResult[] = [
        {
          id: 'add-sequence',
          label: 'Sequential Number',
          tags: ['sequence', 'auto-increment', 'number'],
          meta: {
            uri: 'sequence://new',
            blockType: '//ly.img.ubq/text',
            description: 'Auto-incrementing numbers with prefix/suffix',
          },
        },
      ];
      
      return {
        assets,
        currentPage: 1,
        nextPage: undefined,
        total: 1,
      };
    },
    applyAsset: async (): Promise<number | undefined> => {
      // Trigger the callback to open the config dialog
      onSequenceRequested();
      // Return undefined - we'll create the block after config is confirmed
      return undefined;
    },
  };
}
