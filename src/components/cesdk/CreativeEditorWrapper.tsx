import { useEffect, useRef, useState, useCallback } from 'react';
import CreativeEditorSDK, { Configuration, AssetSource, AssetResult, AssetsQueryResult } from '@cesdk/cesdk-js';
import { Loader2 } from 'lucide-react';
import { createBarcodeAssetSource } from './barcodeAssetSource';
import { createSequenceAssetSource, SequenceConfig, parseSequenceMetadata, formatSequenceNumber, createSequenceBlockName } from './sequenceAssetSource';
import { SequenceConfigDialog } from '@/components/canvas/SequenceConfigDialog';
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

// Ref handle exposed to parent for imperative actions
export interface CesdkEditorHandle {
  saveScene: () => Promise<string>;
  cesdk: CreativeEditorSDK;
}

interface CreativeEditorWrapperProps {
  availableFields?: string[];
  sampleData?: Record<string, string>;
  allSampleData?: Record<string, string>[]; // All data rows for record navigation
  initialScene?: string;
  onSave?: (sceneString: string) => void;
  onSceneChange?: (hasChanges: boolean) => void; // Called when scene is modified
  onReady?: (handle: CesdkEditorHandle) => void; // Now exposes handle with save method
  licenseKey?: string;
  labelWidth?: number;
  labelHeight?: number;
  bleedMm?: number;
  whiteUnderlayer?: boolean;
  templateType?: string;
  // Page size can be updated externally (for non-label projects)
  key?: string; // Forces re-init when dimensions change
}

// Note: Design unit is set to 'Millimeter' so we pass mm values directly to CE.SDK
// Font sizes are always in points regardless of design unit

// Calculate auto-fit font size based on text content and available box dimensions
function calculateAutoFitFontSize(
  textContent: string,
  boxWidthPt: number,
  boxHeightPt: number,
  minFontSize: number = 10,
  maxFontSize: number = 48
): number {
  const lines = textContent.split('\n').filter(Boolean);
  const lineCount = Math.max(1, lines.length);
  const longestLine = Math.max(...lines.map(l => l.length), 1);
  
  // Height-based calculation: divide available height by line count (with 1.3 line spacing)
  const heightBasedSize = boxHeightPt / (lineCount * 1.4);
  
  // Width-based calculation: rough estimate based on character count
  // Approximate 0.5-0.6 em per character for most fonts
  const widthBasedSize = boxWidthPt / (longestLine * 0.55);
  
  // Use the smaller of the two to ensure text fits both ways
  const optimalSize = Math.min(heightBasedSize, widthBasedSize);
  
  // Clamp to reasonable range
  return Math.max(minFontSize, Math.min(maxFontSize, Math.floor(optimalSize)));
}

// Generate initial layout using hybrid AI system (generate-layout → layout-engine)
// This properly handles combined address blocks as a single text element
async function generateInitialLayout(
  engine: any,
  fields: string[],
  sampleData: Record<string, string>,
  widthMm: number,
  heightMm: number,
  templateType: string,
  setLayoutStatus: (status: string | null) => void
): Promise<void> {
  if (fields.length === 0 || Object.keys(sampleData).length === 0) {
    console.log('⏭️ Skipping auto-layout: no fields or sample data');
    return;
  }

  setLayoutStatus('Generating smart layout...');
  console.log('🎨 AUTO-TRIGGERING HYBRID AI LAYOUT FOR NEW DESIGN');

  try {
    const { supabase } = await import('@/integrations/supabase/client');
    const { executeLayout, DEFAULT_LAYOUT_CONFIG } = await import('@/lib/layout-engine');

    // Step 1: Call hybrid layout generator (analyze-label-complexity → design-with-ai)
    const { data: hybridData, error: hybridError } = await supabase.functions.invoke('generate-layout', {
      body: {
        fieldNames: fields,
        sampleData: [sampleData],
        templateSize: { width: widthMm, height: heightMm },
        templateType: templateType || 'address_label',
      },
    });

    if (hybridError) {
      console.warn('⚠️ Hybrid layout API error:', hybridError);
      setLayoutStatus(null);
      return;
    }

    if (!hybridData?.designStrategy) {
      console.warn('⚠️ No design strategy returned from hybrid layout');
      setLayoutStatus(null);
      return;
    }

    console.log('📐 Hybrid design strategy received:', hybridData.designStrategy.strategy);

    // Step 2: Execute layout using the deterministic layout engine
    const layoutConfig = {
      ...DEFAULT_LAYOUT_CONFIG,
      templateSize: { width: widthMm, height: heightMm },
    };

    const layoutResult = executeLayout(hybridData.designStrategy, layoutConfig, sampleData);
    console.log('📏 Layout engine result:', layoutResult.fields.length, 'fields');

    // Get the current page
    const pages = engine.scene.getPages();
    if (pages.length === 0) {
      console.warn('⚠️ No pages available for layout');
      setLayoutStatus(null);
      return;
    }
    const page = pages[0];

    // Step 3: Create text blocks from layout result
    for (const field of layoutResult.fields) {
      try {
        const textBlock = engine.block.create('//ly.img.ubq/text');

        // Handle combined address blocks (fieldType: 'address_block')
        let textContent: string;
        let blockName: string;

        if (field.fieldType === 'address_block' && field.combinedFields && field.combinedFields.length > 0) {
          // Combined address block: join all field values with newlines, filtering empty values
          const fieldValues = field.combinedFields
            .map(fieldName => sampleData[fieldName] || '')
            .filter(Boolean); // Remove empty lines
          
          // If we have actual data, use it; otherwise show a preview placeholder
          textContent = fieldValues.length > 0 
            ? fieldValues.join('\n')
            : field.combinedFields.map(f => `{{${f}}}`).join('\n');
          
          // Store combined field names for VDP resolution
          blockName = `vdp:address_block:${field.combinedFields.join(',')}`;
          console.log('📦 Creating combined address block with fields:', field.combinedFields, '→', fieldValues.length, 'non-empty values');

          // For address blocks, use 80% of label with 10% margin on each side
          const marginPercent = 0.10;
          const boxWidthMm = widthMm * 0.80;
          const boxHeightMm = heightMm * 0.80;
          const startXMm = widthMm * marginPercent;
          const startYMm = heightMm * marginPercent;

          // CRITICAL: Append to page FIRST before setting text content and font size
          // CE.SDK requires blocks to be part of the scene hierarchy before styling takes effect
          engine.block.appendChild(page, textBlock);

          // Set position in mm (design unit is Millimeter)
          engine.block.setPositionX(textBlock, startXMm);
          engine.block.setPositionY(textBlock, startYMm);
          
          // Set FIXED width (Absolute mode) for line wrapping constraint - in mm
          engine.block.setWidthMode(textBlock, 'Absolute');
          engine.block.setWidth(textBlock, boxWidthMm);
          
          // Set height mode to Auto - CE.SDK will auto-size height based on content
          engine.block.setHeightMode(textBlock, 'Auto');
          // Do NOT call setHeight() - that would override Auto mode!
          
          // Set text content using replaceText for proper text run initialization
          engine.block.replaceText(textBlock, textContent);
          
          // Font sizes are always in points, regardless of design unit
          // Use layout engine's calculated font size as base (field.fontSize)
          const baseFontSize = field.fontSize || 12;
          engine.block.setTextFontSize(textBlock, baseFontSize);
          
          engine.block.setName(textBlock, blockName);
          
          // --- SCALE TO FILL LABEL (both up and down as needed) ---
          // Read the auto-sized frame dimensions (returned in current design unit = mm)
          const actualHeightMm = engine.block.getFrameHeight(textBlock);
          const actualWidthMm = engine.block.getFrameWidth(textBlock);
          
          // Calculate scale factors for both dimensions
          if (actualHeightMm > 0 && actualWidthMm > 0) {
            const heightRatio = boxHeightMm / actualHeightMm;
            const widthRatio = boxWidthMm / actualWidthMm;
            
            // Use the smaller ratio to ensure text fits both dimensions
            const scaleFactor = Math.min(heightRatio, widthRatio);
            
            // Scale if there's a meaningful difference (more than 5%)
            if (Math.abs(scaleFactor - 1.0) > 0.05) {
              const newFontSize = Math.max(8, Math.min(baseFontSize * scaleFactor, 72));
              engine.block.setTextFontSize(textBlock, newFontSize);
              console.log(`📐 Scaled address block: ${baseFontSize}pt → ${newFontSize.toFixed(1)}pt (factor: ${scaleFactor.toFixed(2)})`);
            }
          }
          
          console.log(`✅ Created address block: Fixed width (${boxWidthMm.toFixed(1)}mm) + Auto height`);
        } else {
          // Individual field - use layout engine positioning
          textContent = sampleData[field.templateField] || `{{${field.templateField}}}`;
          blockName = `vdp:text:${field.templateField}`;

          // CRITICAL: Append to page FIRST before setting text content and font size
          engine.block.appendChild(page, textBlock);

          // Set position in mm (design unit is Millimeter)
          engine.block.setPositionX(textBlock, field.x);
          engine.block.setPositionY(textBlock, field.y);

          // Set FIXED width (Absolute mode) for line wrapping constraint - in mm
          engine.block.setWidthMode(textBlock, 'Absolute');
          engine.block.setWidth(textBlock, field.width);
          
          // Set height mode to Auto - CE.SDK will auto-size height based on content
          engine.block.setHeightMode(textBlock, 'Auto');
          // Do NOT call setHeight() - that would override Auto mode!

          // Set text content using replaceText
          engine.block.replaceText(textBlock, textContent);
          
          // Apply font size - height will auto-adjust to fit content
          if (field.fontSize) {
            engine.block.setTextFontSize(textBlock, field.fontSize);
          }

          // Store field name for VDP resolution
          engine.block.setName(textBlock, blockName);

          console.log(`✅ Created text block: ${blockName} - Fixed width (${field.width}mm) + Auto height`);
        }
      } catch (blockError) {
        console.error(`❌ Failed to create block for ${field.templateField}:`, blockError);
      }
    }

    console.log('✅ Hybrid auto-layout complete:', layoutResult.fields.length, 'text blocks created');
    setLayoutStatus(null);
  } catch (err) {
    console.error('❌ Hybrid auto-layout generation failed:', err);
    setLayoutStatus(null);
  }
}

export function CreativeEditorWrapper({
  availableFields = [],
  sampleData = {},
  allSampleData = [],
  initialScene,
  onSave,
  onSceneChange,
  onReady,
  licenseKey,
  labelWidth = 100,
  labelHeight = 50,
  bleedMm = 0,
  whiteUnderlayer = false,
  templateType = 'address_label',
}: CreativeEditorWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<CreativeEditorSDK | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [layoutStatus, setLayoutStatus] = useState<string | null>(null);
  
  // Record navigation state
  const totalRecords = allSampleData.length || (Object.keys(sampleData).length > 0 ? 1 : 0);
  const [currentRecordIndex, setCurrentRecordIndex] = useState(0);
  const currentSampleData = allSampleData[currentRecordIndex] || sampleData;
  
  // State for barcode/QR config panel
  const [configPanelOpen, setConfigPanelOpen] = useState(false);
  const [selectedBlockId, setSelectedBlockId] = useState<number | null>(null);
  const [selectedBlockType, setSelectedBlockType] = useState<'barcode' | 'qrcode'>('barcode');
  const [initialBarcodeConfig, setInitialBarcodeConfig] = useState<Partial<BarcodeConfig>>({});
  
  // State for sequence config dialog
  const [sequenceDialogOpen, setSequenceDialogOpen] = useState(false);

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

        // We'll use Millimeter design unit - pass mm values directly to CE.SDK
        // No need to convert to points - CE.SDK handles the conversion internally

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

                    // Add a custom "Sequences" section
                    const sequencesEntry = {
                      id: 'sequences',
                      sourceIds: ['sequences'],
                      previewLength: 1,
                      gridColumns: 1,
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
                      icon: () => 'https://img.icons8.com/ios/50/123.png',
                      title: () => 'Sequential Numbers',
                    };
                    
                    return [dataFieldsEntry, barcodesEntry, sequencesEntry, ...defaultEntries];
                  },
                },
              },
              navigation: {
                show: true,
                action: {
                  export: false,  // Hide CE.SDK export - we have our own button
                  save: false,    // Hide CE.SDK save - we have our own button
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

        // Remove preview button from navigation bar - it causes bugs and isn't needed for WYSIWYG
        try {
          cesdk.ui.setNavigationBarOrder([
            'ly.img.back.navigationBar',
            'ly.img.undoRedo.navigationBar',
            'ly.img.spacer',
            'ly.img.title.navigationBar',
            'ly.img.spacer',
            'ly.img.zoom.navigationBar',
            // Intentionally omitting 'ly.img.preview.navigationBar'
            'ly.img.actions.navigationBar',
          ]);
        } catch (e) {
          console.warn('Could not customize navigation bar:', e);
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
        
        // Register sequence asset source
        cesdk.engine.asset.addSource(createSequenceAssetSource(() => {
          setSequenceDialogOpen(true);
        }));

        // Helper to set design unit to Millimeter and configure page size
        const setPageSizeMm = (pages: number[]) => {
          if (pages.length > 0) {
            const page = pages[0];
            // Set design unit to Millimeter - CE.SDK will handle internal conversions
            cesdk.engine.scene.setDesignUnit('Millimeter');
            // Now set dimensions in mm directly
            cesdk.engine.block.setWidth(page, labelWidth);
            cesdk.engine.block.setHeight(page, labelHeight);
          }
        };

        // Create a new design or load existing scene
        if (initialScene) {
          try {
            // Check if scene is saved as archive (base64) or legacy string format
            if (initialScene.startsWith('archive:')) {
              // Load from archive blob (handles data URIs like barcodes)
              const base64 = initialScene.slice(8); // Remove 'archive:' prefix
              const binaryString = atob(base64);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              const blob = new Blob([bytes], { type: 'application/zip' });
              const archiveUrl = URL.createObjectURL(blob);
              try {
                await cesdk.engine.scene.loadFromArchiveURL(archiveUrl);
              } finally {
                URL.revokeObjectURL(archiveUrl);
              }
            } else {
              // Legacy: Load from string
              await cesdk.engine.scene.loadFromString(initialScene);
            }
            // Force page dimensions to match template (in case scene was saved with different size)
            setPageSizeMm(cesdk.engine.scene.getPages());
          } catch (e) {
            console.warn('Failed to load scene, creating new design:', e);
            await cesdk.createDesignScene();
            setPageSizeMm(cesdk.engine.scene.getPages());
          }
        } else {
          // Create a new design with specified dimensions
          await cesdk.createDesignScene();
          
          // Set page size in millimeters
          setPageSizeMm(cesdk.engine.scene.getPages());

          // AUTO-LAYOUT: Generate initial layout using AI for new designs
          await generateInitialLayout(
            cesdk.engine,
            availableFields,
            sampleData,
            labelWidth,
            labelHeight,
            templateType,
            setLayoutStatus
          );
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

        // Add history listener to track unsaved changes
        cesdk.engine.editor.onHistoryUpdated(() => {
          onSceneChange?.(true);
        });

        setIsLoading(false);
        
        // Expose handle with save method to parent
        onReady?.({
          cesdk,
          saveScene: async () => {
            // Use saveToArchive to handle data URIs (barcodes, embedded images)
            const archiveBlob = await cesdk.engine.scene.saveToArchive();
            // Convert blob to base64 string for storage
            const arrayBuffer = await archiveBlob.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);
            let binaryString = '';
            for (let i = 0; i < bytes.length; i++) {
              binaryString += String.fromCharCode(bytes[i]);
            }
            const base64 = btoa(binaryString);
            const archiveString = `archive:${base64}`;
            onSave?.(archiveString);
            return archiveString;
          },
        });
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

  // Update text content when record changes (including sequences)
  useEffect(() => {
    if (!editorRef.current) return;

    const engine = editorRef.current.engine;
    
    // Find all text blocks and update with current record's data
    try {
      const textBlocks = engine.block.findByType('//ly.img.ubq/text');
      textBlocks.forEach((blockId) => {
        const blockName = engine.block.getName(blockId);
        
        if (blockName.startsWith('vdp:sequence:')) {
          // Sequential number block - calculate value based on record index
          const seqConfig = parseSequenceMetadata(blockName);
          if (seqConfig) {
            const formattedValue = formatSequenceNumber(seqConfig, currentRecordIndex);
            engine.block.replaceText(blockId, formattedValue);
          }
        } else if (blockName.startsWith('vdp:address_block:')) {
          // Combined address block - extract field names and rebuild content
          const fieldNamesStr = blockName.replace('vdp:address_block:', '');
          const fieldNames = fieldNamesStr.split(',');
          const newContent = fieldNames
            .map(fieldName => currentSampleData[fieldName] || '')
            .filter(Boolean)
            .join('\n');
          
          if (newContent) {
            engine.block.replaceText(blockId, newContent);
          }
        } else if (blockName.startsWith('vdp:text:')) {
          // Individual field
          const fieldName = blockName.replace('vdp:text:', '');
          const value = currentSampleData[fieldName] || `{{${fieldName}}}`;
          engine.block.replaceText(blockId, value);
        }
      });
    } catch (e) {
      console.warn('Failed to update record preview:', e);
    }
  }, [currentRecordIndex, currentSampleData]);

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

  // Handle sequence config confirm - create text block with sequence
  const handleSequenceConfirm = useCallback((config: any) => {
    if (!editorRef.current) return;
    
    const engine = editorRef.current.engine;
    const pages = engine.scene.getPages();
    if (pages.length === 0) return;
    
    const page = pages[0];
    
    // Extract sequence config from the config object
    const seqConfig: SequenceConfig = {
      start: config.typeConfig?.sequenceStart || 1,
      prefix: config.typeConfig?.sequencePrefix || '',
      suffix: config.typeConfig?.sequenceSuffix || '',
      padding: config.typeConfig?.sequencePadding || 4,
    };
    
    // Create formatted preview value
    const displayValue = formatSequenceNumber(seqConfig, currentRecordIndex);
    
    // Create text block
    const textBlock = engine.block.create('//ly.img.ubq/text');
    engine.block.setString(textBlock, 'text/text', displayValue);
    
    // Store sequence config in block name
    engine.block.setName(textBlock, createSequenceBlockName(seqConfig));
    
    // Set reasonable default size and position (center of page)
    const pageWidth = engine.block.getWidth(page);
    const pageHeight = engine.block.getHeight(page);
    engine.block.setWidth(textBlock, Math.min(150, pageWidth * 0.6));
    engine.block.setHeight(textBlock, 30);
    engine.block.setPositionX(textBlock, (pageWidth - 150) / 2);
    engine.block.setPositionY(textBlock, (pageHeight - 30) / 2);
    
    // Add to page
    engine.block.appendChild(page, textBlock);
    
    // Select the new block
    engine.block.setSelected(textBlock, true);
    
    setSequenceDialogOpen(false);
  }, [currentRecordIndex]);

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

  // Record navigation handlers
  const goToPreviousRecord = useCallback(() => {
    setCurrentRecordIndex(prev => Math.max(0, prev - 1));
  }, []);

  const goToNextRecord = useCallback(() => {
    setCurrentRecordIndex(prev => Math.min(totalRecords - 1, prev + 1));
  }, [totalRecords]);

  return (
    <div className="relative h-full w-full">
      {(isLoading || layoutStatus) && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-muted-foreground">
              {layoutStatus || 'Loading editor...'}
            </span>
          </div>
        </div>
      )}
      
      {/* Record Navigation Bar */}
      {totalRecords > 1 && !isLoading && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-card border rounded-lg shadow-lg px-3 py-2">
          <button
            onClick={goToPreviousRecord}
            disabled={currentRecordIndex === 0}
            className="p-1 rounded hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
            title="Previous record"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <span className="text-sm font-medium tabular-nums min-w-[80px] text-center">
            Record {currentRecordIndex + 1} of {totalRecords}
          </span>
          <button
            onClick={goToNextRecord}
            disabled={currentRecordIndex === totalRecords - 1}
            className="p-1 rounded hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
            title="Next record"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          </button>
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
      
      {/* Sequence Configuration Dialog */}
      <SequenceConfigDialog
        open={sequenceDialogOpen}
        onOpenChange={setSequenceDialogOpen}
        onConfirm={handleSequenceConfirm}
        templateSize={{ width: labelWidth, height: labelHeight }}
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
