import { useEffect, useRef, useState, useCallback } from 'react';
import CreativeEditorSDK, { Configuration, AssetSource, AssetResult, AssetsQueryResult } from '@cesdk/cesdk-js';
import { Loader2 } from 'lucide-react';
import { createBarcodeAssetSource } from './barcodeAssetSource';
import { exportDesign, ExportOptions, getPrintReadyExportOptions } from '@/lib/cesdk/exportUtils';
import { generateBarcodeSVG, generateQRCodeSVG } from '@/lib/barcode-svg-utils';

// Get the correct assets URL - must match the installed package version
const CESDK_VERSION = '1.65.0';
const CESDK_ASSETS_URL = `https://cdn.img.ly/packages/imgly/cesdk-js/${CESDK_VERSION}/assets`;

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
  // Bleed margin in mm (for print-ready output)
  bleedMm?: number;
  // Enable white underlayer for clear substrates
  whiteUnderlayer?: boolean;
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
  bleedMm = 0,
  whiteUnderlayer = false,
}: CreativeEditorWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<CreativeEditorSDK | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Export function exposed to parent components
  const handleExport = useCallback(async (options?: Partial<ExportOptions>) => {
    if (!editorRef.current) return null;
    
    const exportOptions: ExportOptions = {
      ...getPrintReadyExportOptions({ whiteUnderlayer, bleedMm }),
      ...options,
    };
    
    return exportDesign(editorRef.current, exportOptions);
  }, [whiteUnderlayer, bleedMm]);

  // Add barcode to canvas
  const addBarcodeToCanvas = useCallback(async (
    value: string,
    format: string,
    variableField?: string
  ) => {
    if (!editorRef.current) return;
    
    const engine = editorRef.current.engine;
    const pages = engine.scene.getPages();
    if (pages.length === 0) return;
    
    const page = pages[0];
    
    // Generate barcode SVG
    const svg = generateBarcodeSVG(value, format.toUpperCase(), { 
      height: 75, 
      includetext: true 
    });
    const dataUrl = `data:image/svg+xml;base64,${btoa(svg)}`;
    
    // Create graphic block
    const block = engine.block.create('//ly.img.ubq/graphic');
    const shape = engine.block.createShape('//ly.img.ubq/shape/rect');
    engine.block.setShape(block, shape);
    
    // Create image fill with barcode
    const fill = engine.block.createFill('//ly.img.ubq/fill/image');
    engine.block.setString(fill, 'fill/image/imageFileURI', dataUrl);
    engine.block.setFill(block, fill);
    
    // Set size and position
    engine.block.setWidth(block, 150);
    engine.block.setHeight(block, 75);
    engine.block.setPositionX(block, 50);
    engine.block.setPositionY(block, 50);
    
    // Store metadata in block name for VDP resolution
    if (variableField) {
      engine.block.setName(block, `barcode:${format}:${variableField}`);
    }
    
    engine.block.appendChild(page, block);
  }, []);

  // Add QR code to canvas
  const addQRCodeToCanvas = useCallback(async (
    value: string,
    variableField?: string
  ) => {
    if (!editorRef.current) return;
    
    const engine = editorRef.current.engine;
    const pages = engine.scene.getPages();
    if (pages.length === 0) return;
    
    const page = pages[0];
    
    // Generate QR code SVG
    const svg = generateQRCodeSVG(value, { width: 100, height: 100 });
    const dataUrl = `data:image/svg+xml;base64,${btoa(svg)}`;
    
    // Create graphic block
    const block = engine.block.create('//ly.img.ubq/graphic');
    const shape = engine.block.createShape('//ly.img.ubq/shape/rect');
    engine.block.setShape(block, shape);
    
    // Create image fill with QR code
    const fill = engine.block.createFill('//ly.img.ubq/fill/image');
    engine.block.setString(fill, 'fill/image/imageFileURI', dataUrl);
    engine.block.setFill(block, fill);
    
    // Set size and position (square)
    engine.block.setWidth(block, 100);
    engine.block.setHeight(block, 100);
    engine.block.setPositionX(block, 50);
    engine.block.setPositionY(block, 50);
    
    // Store metadata in block name for VDP resolution
    if (variableField) {
      engine.block.setName(block, `qrcode::${variableField}`);
    }
    
    engine.block.appendChild(page, block);
  }, []);

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
          baseURL: CESDK_ASSETS_URL,
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
                    
                    // Add a custom "Barcodes & QR" section
                    const barcodesEntry = {
                      id: 'barcodes-qrcodes',
                      sourceIds: ['barcodes-qrcodes'],
                      previewLength: 4,
                      gridColumns: 2,
                      gridItemHeight: 'auto' as const,
                      cardLabel: (asset: AssetResult) => asset.label || asset.id,
                      cardLabelStyle: () => ({
                        height: '24px',
                        width: '100%',
                        fontSize: '11px',
                        textAlign: 'center' as const,
                        overflow: 'hidden',
                        whiteSpace: 'nowrap' as const,
                        textOverflow: 'ellipsis',
                      }),
                      icon: () => 'https://img.icons8.com/ios/50/barcode.png',
                      title: () => 'Barcodes & QR',
                    };
                    
                    return [dataFieldsEntry, barcodesEntry, ...defaultEntries];
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

        // Performance optimization: limit max image size
        try {
          cesdk.engine.editor.setSettingFloat('maxImageSize', 4096);
        } catch (e) {
          console.warn('Could not set maxImageSize:', e);
        }

        // Add default asset sources (shapes, stickers, images, etc.)
        await cesdk.addDefaultAssetSources();
        
        // Add demo assets with upload support (limited for performance)
        await cesdk.addDemoAssetSources({ 
          sceneMode: 'Design', 
          withUploadAssetSources: true 
        });

        // Register custom asset source for data fields (text variables)
        if (availableFields.length > 0) {
          cesdk.engine.asset.addSource(createDataFieldsAssetSource(availableFields, sampleData));
        }
        
        // Register barcode/QR code asset source
        cesdk.engine.asset.addSource(createBarcodeAssetSource({
          availableFields,
          sampleData,
        }));

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
