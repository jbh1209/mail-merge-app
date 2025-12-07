import { useEffect, useRef, useState, useCallback } from 'react';
import CreativeEditorSDK, { Configuration, AssetSource, AssetResult, AssetsQueryResult } from '@cesdk/cesdk-js';
import { Loader2 } from 'lucide-react';
import { createBarcodeAssetSource } from './barcodeAssetSource';
import { exportDesign, ExportOptions, getPrintReadyExportOptions } from '@/lib/cesdk/exportUtils';
import { generateBarcodeDataUrl, generateQRCodeDataUrl } from '@/lib/barcode-svg-utils';
import { BarcodeConfigPanel, BarcodeConfig } from './BarcodeConfigPanel';

// Get the correct assets URL - must match the installed package version
const CESDK_VERSION = '1.65.0';
const CESDK_ASSETS_URL = `https://cdn.img.ly/packages/imgly/cesdk-js/${CESDK_VERSION}/assets`;

// Helper to parse barcode metadata from block name
function parseBarcodeMetadata(name: string): { type: 'barcode' | 'qrcode'; format: string; dataSource: 'static' | 'field'; staticValue: string; variableField: string } | null {
  if (!name) return null;
  
  // Format: "barcode:format:dataSource:value" or "qrcode:dataSource:value"
  if (name.startsWith('barcode:')) {
    const parts = name.split(':');
    const format = parts[1] || 'code128';
    const dataSource = parts[2] as 'static' | 'field' || 'static';
    const value = parts[3] || '';
    return {
      type: 'barcode',
      format,
      dataSource,
      staticValue: dataSource === 'static' ? value : '',
      variableField: dataSource === 'field' ? value : '',
    };
  }
  if (name.startsWith('qrcode:')) {
    const parts = name.split(':');
    const dataSource = parts[1] as 'static' | 'field' || 'static';
    const value = parts[2] || '';
    return {
      type: 'qrcode',
      format: 'qrcode',
      dataSource,
      staticValue: dataSource === 'static' ? value : '',
      variableField: dataSource === 'field' ? value : '',
    };
  }
  return null;
}

interface CreativeEditorWrapperProps {
  availableFields?: string[];
  sampleData?: Record<string, string>;
  initialScene?: string;
  onSave?: (sceneString: string) => void;
  onReady?: (editor: CreativeEditorSDK) => void;
  licenseKey?: string;
  labelWidth?: number;
  labelHeight?: number;
  bleedMm?: number;
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
  
  // State for barcode/QR config panel
  const [configPanelOpen, setConfigPanelOpen] = useState(false);
  const [selectedBlockId, setSelectedBlockId] = useState<number | null>(null);
  const [selectedBlockType, setSelectedBlockType] = useState<'barcode' | 'qrcode'>('barcode');
  const [initialBarcodeConfig, setInitialBarcodeConfig] = useState<Partial<BarcodeConfig>>({});

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
    
    // Generate barcode using fast data URL generation
    const dataUrl = generateBarcodeDataUrl(value, format.toUpperCase(), { 
      height: 75, 
      includetext: true 
    });
    
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
    
    // Generate QR code using fast data URL generation
    const dataUrl = generateQRCodeDataUrl(value, { width: 100, height: 100 });
    
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
          cesdk.engine.asset.addSource(createDataFieldsAssetSource(availableFields, sampleData, cesdk.engine));
        }
        
        // Register barcode/QR code asset source with engine reference
        cesdk.engine.asset.addSource(createBarcodeAssetSource({
          availableFields,
          sampleData,
        }, cesdk.engine));

        // Create a new design or load existing scene
        if (initialScene) {
          try {
            await cesdk.engine.scene.loadFromString(initialScene);
            // Force page dimensions to match template (in case scene was saved with different size)
            const pages = cesdk.engine.scene.getPages();
            if (pages.length > 0) {
              const page = pages[0];
              cesdk.engine.block.setWidth(page, widthPoints);
              cesdk.engine.block.setHeight(page, heightPoints);
            }
          } catch (e) {
            console.warn('Failed to load scene, creating new design:', e);
            await cesdk.createDesignScene();
            const pages = cesdk.engine.scene.getPages();
            if (pages.length > 0) {
              const page = pages[0];
              cesdk.engine.block.setWidth(page, widthPoints);
              cesdk.engine.block.setHeight(page, heightPoints);
            }
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

        // Add selection listener to detect barcode/QR blocks
        cesdk.engine.block.onSelectionChanged(() => {
          const selected = cesdk.engine.block.findAllSelected();
          if (selected.length === 1) {
            const blockId = selected[0];
            try {
              const name = cesdk.engine.block.getName(blockId);
              const metadata = parseBarcodeMetadata(name);
              if (metadata) {
                setSelectedBlockId(blockId);
                setSelectedBlockType(metadata.type);
                setInitialBarcodeConfig({
                  format: metadata.format,
                  dataSource: metadata.dataSource,
                  staticValue: metadata.staticValue,
                  variableField: metadata.variableField,
                });
                setConfigPanelOpen(true);
              }
            } catch {
              // Not a barcode block
            }
          }
        });

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

  // Handle barcode/QR config changes
  const handleBarcodeConfigConfirm = useCallback((config: BarcodeConfig) => {
    if (!editorRef.current || selectedBlockId === null) return;

    const engine = editorRef.current.engine;
    const value = config.dataSource === 'static' ? config.staticValue : config.variableField;
    
    // Generate new image
    let dataUrl: string;
    if (config.type === 'qrcode') {
      dataUrl = generateQRCodeDataUrl(value || 'https://example.com', { width: 150, height: 150 });
    } else {
      dataUrl = generateBarcodeDataUrl(value || '12345', config.format, { height: 75, includetext: true });
    }

    // Update block image
    try {
      const fill = engine.block.getFill(selectedBlockId);
      engine.block.setString(fill, 'fill/image/imageFileURI', dataUrl);
      
      // Update block name with new metadata
      const metadataName = config.type === 'qrcode'
        ? `qrcode:${config.dataSource}:${value}`
        : `barcode:${config.format}:${config.dataSource}:${value}`;
      engine.block.setName(selectedBlockId, metadataName);
    } catch (e) {
      console.error('Failed to update barcode block:', e);
    }

    setSelectedBlockId(null);
    setConfigPanelOpen(false);
  }, [selectedBlockId]);

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
      
      {/* Barcode/QR Configuration Panel */}
      <BarcodeConfigPanel
        open={configPanelOpen}
        onOpenChange={setConfigPanelOpen}
        onConfirm={handleBarcodeConfigConfirm}
        availableFields={availableFields}
        initialConfig={initialBarcodeConfig}
        type={selectedBlockType}
      />
    </div>
  );
}

// Create a custom asset source for data fields (VDP variables)
function createDataFieldsAssetSource(
  fields: string[], 
  sampleData: Record<string, string>,
  engine: CreativeEditorSDK['engine']
): AssetSource {
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
          fieldName: field,
        },
      }));
      
      return {
        assets,
        currentPage: 1,
        nextPage: undefined,
        total: fields.length,
      };
    },
    applyAsset: async (assetResult: AssetResult): Promise<number> => {
      // Create a text block on the canvas
      const pages = engine.scene.getPages();
      if (pages.length === 0) return 0;
      
      const page = pages[0];
      const fieldName = String(assetResult.meta?.fieldName || assetResult.label || 'field');
      const displayValue = sampleData[fieldName] || `{{${fieldName}}}`;
      
      // Create text block
      const textBlock = engine.block.create('//ly.img.ubq/text');
      
      // Set text content with variable placeholder for merge, show sample data for preview
      engine.block.setString(textBlock, 'text/text', displayValue);
      
      // Store the field name in the block name for VDP resolution
      engine.block.setName(textBlock, `vdp:text:${fieldName}`);
      
      // Set reasonable default size and position
      engine.block.setWidth(textBlock, 150);
      engine.block.setHeight(textBlock, 30);
      engine.block.setPositionX(textBlock, 20);
      engine.block.setPositionY(textBlock, 20);
      
      // Add to page
      engine.block.appendChild(page, textBlock);
      
      // Select the new block
      engine.block.setSelected(textBlock, true);
      
      return textBlock;
    },
  };
}

export default CreativeEditorWrapper;
