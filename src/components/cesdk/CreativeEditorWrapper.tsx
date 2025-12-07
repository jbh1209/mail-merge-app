import { useEffect, useRef, useState } from 'react';
import CreativeEditorSDK, { Configuration, AssetSource, AssetResult, AssetsQueryResult } from '@cesdk/cesdk-js';
import { Loader2 } from 'lucide-react';

// Get the correct assets URL based on installed package version
function getCESDKAssetsURL(): string {
  // CE.SDK assets are served from the CDN - we need to match the installed version
  // The package automatically exposes this, but for Vite we use a dynamic import approach
  return 'https://cdn.img.ly/packages/imgly/cesdk-js/1.50.1/assets';
}

interface CreativeEditorWrapperProps {
  // Available merge fields from data source
  availableFields?: string[];
  // Sample data for preview
  sampleData?: Record<string, string>;
  // Template scene to load (JSON string or URL)
  initialScene?: string;
  // Callback when scene is saved
  onSave?: (sceneString: string) => void;
  // Callback when editor is ready
  onReady?: (editor: CreativeEditorSDK) => void;
  // License key (optional - works in trial mode without it)
  licenseKey?: string;
  // Label dimensions in mm
  labelWidth?: number;
  labelHeight?: number;
}

export function CreativeEditorWrapper({
  availableFields = [],
  sampleData = {},
  initialScene,
  onSave,
  onReady,
  licenseKey,
  labelWidth = 100,
  labelHeight = 50,
}: CreativeEditorWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<CreativeEditorSDK | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;

    const initEditor = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Convert mm to design units (CE.SDK uses a base of 72 DPI for points)
        const mmToPoints = (mm: number) => (mm / 25.4) * 72;
        const widthPoints = mmToPoints(labelWidth);
        const heightPoints = mmToPoints(labelHeight);

        const config: Configuration = {
          license: licenseKey || '',
          userId: 'lovable-user',
          baseURL: getCESDKAssetsURL(),
          ui: {
            elements: {
              view: 'default',
              panels: {
                inspector: {
                  show: true,
                },
                settings: {
                  show: true,
                },
              },
              dock: {
                iconSize: 'normal',
                hideLabels: false,
              },
              libraries: {
                insert: {
                  entries: (defaultEntries) => {
                    // Add a custom "Data Fields" section for VDP
                    const dataFieldsEntry = {
                      id: 'data-fields',
                      sourceIds: ['data-fields'],
                      previewLength: 3,
                      gridColumns: 2,
                      gridItemHeight: 'auto' as const,
                      cardLabel: (asset: AssetResult) => asset.label || asset.id,
                      cardLabelStyle: () => ({
                        height: '24px',
                        width: '100%',
                        fontSize: '12px',
                        textAlign: 'center' as const,
                        overflow: 'hidden',
                        whiteSpace: 'nowrap' as const,
                        textOverflow: 'ellipsis',
                      }),
                      icon: () => 'https://img.icons8.com/ios/50/merge-files.png',
                      title: () => 'Data Fields',
                    };
                    return [dataFieldsEntry, ...defaultEntries];
                  },
                },
              },
              navigation: {
                show: true,
                action: {
                  export: true,
                  save: !!onSave,
                },
              },
            },
          },
          callbacks: {
            onSave: async (sceneString) => {
              onSave?.(sceneString);
              return Promise.resolve();
            },
            onExport: async (blobs) => {
              // Handle PDF export
              if (blobs.length > 0) {
                const blob = blobs[0];
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'design.pdf';
                a.click();
                URL.revokeObjectURL(url);
              }
              return Promise.resolve();
            },
          },
        };

        const cesdk = await CreativeEditorSDK.create(container, config);
        editorRef.current = cesdk;

        // Register custom asset source for data fields
        if (availableFields.length > 0) {
          cesdk.engine.asset.addSource(createDataFieldsAssetSource(availableFields, sampleData));
        }

        // Create a new design or load existing scene
        if (initialScene) {
          try {
            await cesdk.engine.scene.loadFromString(initialScene);
          } catch (e) {
            console.warn('Failed to load scene, creating new design:', e);
            await cesdk.createDesignScene();
          }
        } else {
          // Create a new design with specified dimensions
          await cesdk.createDesignScene();
          
          // Set page size
          const pages = cesdk.engine.scene.getPages();
          if (pages.length > 0) {
            const page = pages[0];
            cesdk.engine.block.setWidth(page, widthPoints);
            cesdk.engine.block.setHeight(page, heightPoints);
          }
        }

        setIsLoading(false);
        onReady?.(cesdk);
      } catch (err) {
        console.error('Failed to initialize CE.SDK:', err);
        setError(err instanceof Error ? err.message : 'Failed to initialize editor');
        setIsLoading(false);
      }
    };

    initEditor();

    return () => {
      if (editorRef.current) {
        editorRef.current.dispose();
        editorRef.current = null;
      }
    };
  }, [licenseKey, labelWidth, labelHeight]);

  // Update variables when sample data changes
  useEffect(() => {
    if (!editorRef.current || Object.keys(sampleData).length === 0) return;

    const engine = editorRef.current.engine;
    
    // Find all text blocks and update variable values
    try {
      const textBlocks = engine.block.findByType('//ly.img.ubq/text');
      textBlocks.forEach((blockId) => {
        const text = engine.block.getString(blockId, 'text/text');
        // Replace {{fieldName}} with actual values for preview
        let updatedText = text;
        Object.entries(sampleData).forEach(([key, value]) => {
          const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
          updatedText = updatedText.replace(regex, value);
        });
        if (updatedText !== text) {
          engine.block.setString(blockId, 'text/text', updatedText);
        }
      });
    } catch (e) {
      console.warn('Failed to update variables:', e);
    }
  }, [sampleData]);

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted">
        <div className="text-center">
          <p className="text-destructive font-medium">Failed to load editor</p>
          <p className="text-sm text-muted-foreground mt-1">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      {isLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80">
          <div className="flex items-center gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-muted-foreground">Loading editor...</span>
          </div>
        </div>
      )}
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}

// Create a custom asset source for data fields (VDP variables)
function createDataFieldsAssetSource(fields: string[], sampleData: Record<string, string>): AssetSource {
  return {
    id: 'data-fields',
    findAssets: async (): Promise<AssetsQueryResult> => {
      const assets: AssetResult[] = fields.map((field) => ({
        id: `field-${field}`,
        label: field,
        tags: ['data', 'variable', 'merge'],
        meta: {
          uri: `text://{{${field}}}`,
          blockType: '//ly.img.ubq/text',
          fillType: '//ly.img.ubq/fill/solid',
          value: sampleData[field] || `{{${field}}}`,
        },
        context: {
          sourceId: 'data-fields',
        },
      }));
      
      return {
        assets,
        currentPage: 1,
        nextPage: undefined,
        total: fields.length,
      };
    },
    applyAsset: async (): Promise<number> => {
      // This is handled by the engine automatically for text blocks
      // Return 0 to indicate success
      return 0;
    },
  };
}

export default CreativeEditorWrapper;
