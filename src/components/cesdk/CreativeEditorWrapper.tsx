import { useEffect, useRef, useState, useCallback } from 'react';
import CreativeEditorSDK, { Configuration, AssetSource, AssetResult, AssetsQueryResult } from '@cesdk/cesdk-js';
import { Loader2 } from 'lucide-react';
import { createBarcodeAssetSource } from './barcodeAssetSource';
import { createSequenceAssetSource, SequenceConfig, parseSequenceMetadata, formatSequenceNumber, createSequenceBlockName } from './sequenceAssetSource';
import { createImageAssetSource } from './imageAssetSource';
import { SequenceConfigDialog } from '@/components/canvas/SequenceConfigDialog';
import { exportDesign, ExportOptions, getPrintReadyExportOptions } from '@/lib/cesdk/exportUtils';
import { generateBarcodeDataUrl, generateQRCodeDataUrl } from '@/lib/barcode-svg-utils';
import { BarcodeConfigPanel, BarcodeConfig } from './BarcodeConfigPanel';
import { isLikelyImageField, detectImageColumnsFromValues } from '@/lib/avery-labels';
import { BackgroundGuidePanel } from './BackgroundGuidePanel';

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
  projectType?: string; // Project type: 'label', 'card', 'badge', etc.
  projectImages?: { name: string; url: string }[]; // Uploaded images for VDP
  // Page size can be updated externally (for non-label projects)
  key?: string; // Forces re-init when dimensions change
  /** Trim guide for bleed mode - shows where the cut will happen */
  trimGuideMm?: { width: number; height: number; bleedMm: number };
}

// Note: Design unit is set to 'Millimeter' so we pass mm values directly to CE.SDK
// Font sizes are always in points regardless of design unit

// ============ FONT CONFIGURATION FOR PROPER PDF EMBEDDING ============
// Using Roboto from CE.SDK CDN for consistent font embedding in PDF exports
const ROBOTO_TYPEFACE = {
  name: 'Roboto',
  fonts: [
    {
      uri: 'https://cdn.img.ly/assets/v2/ly.img.typeface/fonts/Roboto/Roboto-Regular.ttf',
      subFamily: 'Regular',
    },
    {
      uri: 'https://cdn.img.ly/assets/v2/ly.img.typeface/fonts/Roboto/Roboto-Bold.ttf',
      subFamily: 'Bold',
      weight: 'bold' as const,
    },
    {
      uri: 'https://cdn.img.ly/assets/v2/ly.img.typeface/fonts/Roboto/Roboto-Italic.ttf',
      subFamily: 'Italic',
      style: 'italic' as const,
    },
    {
      uri: 'https://cdn.img.ly/assets/v2/ly.img.typeface/fonts/Roboto/Roboto-BoldItalic.ttf',
      subFamily: 'Bold Italic',
      weight: 'bold' as const,
      style: 'italic' as const,
    },
  ],
};

/**
 * Set Roboto font on a text block for proper PDF embedding
 */
function setRobotoFont(engine: any, textBlock: number): void {
  try {
    const regularFont = ROBOTO_TYPEFACE.fonts.find(f => f.subFamily === 'Regular');
    if (regularFont) {
      engine.block.setFont(textBlock, regularFont.uri, ROBOTO_TYPEFACE);
    }
  } catch (e) {
    console.warn('Failed to set Roboto font:', e);
  }
}

/**
 * Enable all interaction scopes on a block.
 * Required because global scopes are set to "Defer" for trim guide locking.
 */
function enableBlockInteraction(engine: any, blockId: number): void {
  try {
    engine.block.setScopeEnabled(blockId, 'editor/select', true);
    engine.block.setScopeEnabled(blockId, 'layer/move', true);
    engine.block.setScopeEnabled(blockId, 'layer/resize', true);
    engine.block.setScopeEnabled(blockId, 'layer/rotate', true);
    engine.block.setScopeEnabled(blockId, 'lifecycle/destroy', true);
    engine.block.setScopeEnabled(blockId, 'lifecycle/duplicate', true);
  } catch (e) {
    // Some blocks may not support scopes
  }
}

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
// IMAGE fields are SKIPPED from text layout - they get VDP image blocks instead
async function generateInitialLayout(
  engine: any,
  fields: string[],
  sampleData: Record<string, string>,
  allSampleData: Record<string, string>[],
  widthMm: number,
  heightMm: number,
  templateType: string,
  setLayoutStatus: (status: string | null) => void,
  projectImages: { name: string; url: string }[] = []
): Promise<void> {
  if (fields.length === 0 || Object.keys(sampleData).length === 0) {
    console.log('⏭️ Skipping auto-layout: no fields or sample data');
    return;
  }

  setLayoutStatus('Generating smart layout...');
  console.log('🎨 AUTO-TRIGGERING HYBRID AI LAYOUT FOR NEW DESIGN');

  // Detect image fields using value-based detection (handles "Unnamed_Column_2" with file paths)
  const sampleRows = allSampleData.length > 0 ? allSampleData : [sampleData];
  const imageFieldsDetected = detectImageColumnsFromValues(fields, sampleRows);
  console.log('🖼️ Detected image fields:', imageFieldsDetected);
  
  // Filter out image fields from layout generation - they will be handled separately
  const textFields = fields.filter(f => !imageFieldsDetected.includes(f));

  setLayoutStatus('Generating smart layout...');
  console.log('🎨 AUTO-TRIGGERING HYBRID AI LAYOUT FOR NEW DESIGN');

  try {
    const { supabase } = await import('@/integrations/supabase/client');
    const { executeLayout, DEFAULT_LAYOUT_CONFIG } = await import('@/lib/layout-engine');

    // Step 1: Call hybrid layout generator - use textFields (excluding images)
    const { data: hybridData, error: hybridError } = await supabase.functions.invoke('generate-layout', {
      body: {
        fieldNames: textFields.length > 0 ? textFields : fields, // Fall back to all fields if no text fields
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
        
        // Set explicit Roboto font for proper PDF embedding
        setRobotoFont(engine, textBlock);

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

          // For address blocks, use 94% height with 3% top margin for 6+ line addresses
          const horizontalMargin = 0.10;
          const topMarginPercent = 0.03;
          const boxWidthMm = widthMm * 0.80;
          const boxHeightMm = heightMm * 0.94;
          const startXMm = widthMm * horizontalMargin;
          const startYMm = heightMm * topMarginPercent;

          // CRITICAL: Append to page FIRST before setting text content and font size
          // CE.SDK requires blocks to be part of the scene hierarchy before styling takes effect
          engine.block.appendChild(page, textBlock);
          
          // Enable interaction scopes (required since global scopes are set to Defer)
          enableBlockInteraction(engine, textBlock);

          // Set position in mm (design unit is Millimeter)
          engine.block.setPositionX(textBlock, startXMm);
          engine.block.setPositionY(textBlock, startYMm);
          
          // Set FIXED width (Absolute mode) for line wrapping constraint - in mm
          engine.block.setWidthMode(textBlock, 'Absolute');
          engine.block.setWidth(textBlock, boxWidthMm);
          
          // Set FIXED height for auto-fit functionality
          engine.block.setHeightMode(textBlock, 'Absolute');
          engine.block.setHeight(textBlock, boxHeightMm);
          // Do NOT call setHeight() - that would override Auto mode!
          
          // Set text content using replaceText for proper text run initialization
          engine.block.replaceText(textBlock, textContent);
          
          // Font sizes are always in points, regardless of design unit
          // Use layout engine's calculated font size as base (field.fontSize)
          const baseFontSize = field.fontSize || 12;
          engine.block.setTextFontSize(textBlock, baseFontSize);
          
          engine.block.setName(textBlock, blockName);
          
          // Store auto-fit metadata for variable resolution
          engine.block.setMetadata(textBlock, 'autoFit', 'true');
          engine.block.setMetadata(textBlock, 'originalFontSize', String(baseFontSize));
          
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
          
          // Enable interaction scopes (required since global scopes are set to Defer)
          enableBlockInteraction(engine, textBlock);

          // Set position in mm (design unit is Millimeter)
          engine.block.setPositionX(textBlock, field.x);
          engine.block.setPositionY(textBlock, field.y);

          // Set FIXED width (Absolute mode) for line wrapping constraint - in mm
          engine.block.setWidthMode(textBlock, 'Absolute');
          engine.block.setWidth(textBlock, field.width);
          
          // Set FIXED height for auto-fit functionality
          const fieldHeight = field.height || Math.max(heightMm * 0.15, 8); // Use layout height or 15% of label
          engine.block.setHeightMode(textBlock, 'Absolute');
          engine.block.setHeight(textBlock, fieldHeight);

          // Set text content using replaceText
          engine.block.replaceText(textBlock, textContent);
          
          // Apply font size
          const baseFontSize = field.fontSize || 12;
          engine.block.setTextFontSize(textBlock, baseFontSize);

          // Store field name for VDP resolution
          engine.block.setName(textBlock, blockName);
          
          // Store auto-fit metadata for variable resolution
          engine.block.setMetadata(textBlock, 'autoFit', 'true');
          engine.block.setMetadata(textBlock, 'originalFontSize', String(baseFontSize));

          console.log(`✅ Created text block: ${blockName} - Fixed size (${field.width}mm × ${fieldHeight}mm)`);
        }
      } catch (blockError) {
        console.error(`❌ Failed to create block for ${field.templateField}:`, blockError);
      }
    }

    // Step 4: Create VDP image blocks for detected image fields
    if (imageFieldsDetected.length > 0) {
      console.log('🖼️ Creating VDP image blocks for:', imageFieldsDetected);
      
      // Helper to normalize image names for matching
      const normalizeForMatch = (name: string): string => {
        let baseName = name;
        if (name.includes('\\')) baseName = name.split('\\').pop() || name;
        else if (name.includes('/')) baseName = name.split('/').pop() || name;
        if (baseName.includes('?')) baseName = baseName.split('?')[0];
        return baseName.replace(/\.(png|jpg|jpeg|gif|webp|svg|bmp|tiff?)$/i, '').toLowerCase().trim();
      };
      
      console.log('📦 Available project images:', projectImages.map(img => ({
        name: img.name,
        normalized: normalizeForMatch(img.name)
      })));
      
      // Calculate image block position - place at BOTTOM CENTER for clean separation from text
      const imageSize = Math.min(widthMm * 0.3, heightMm * 0.35, 25); // Max 25mm, reduced height ratio
      // Center horizontally, position at bottom with margin
      let imageX = (widthMm - imageSize) / 2;
      let imageY = heightMm - imageSize - 3; // 3mm margin from bottom
      
      for (const imageField of imageFieldsDetected) {
        try {
          // Create graphic block for image
          const graphicBlock = engine.block.create('//ly.img.ubq/graphic');
          const shape = engine.block.createShape('//ly.img.ubq/shape/rect');
          engine.block.setShape(graphicBlock, shape);
          
          // Create image fill
          const imageFill = engine.block.createFill('//ly.img.ubq/fill/image');
          
          // Try to resolve actual image from sample data
          const sampleValue = sampleData?.[imageField];
          let imageUri = '';
          let resolvedImage = false;
          
          if (sampleValue && projectImages.length > 0) {
            const normalizedSample = normalizeForMatch(String(sampleValue));
            console.log('🔍 Matching image field:', { 
              imageField, 
              sampleValue, 
              normalizedSample,
              availableImages: projectImages.map(img => normalizeForMatch(img.name))
            });
            
            const matchingImage = projectImages.find(img => 
              normalizeForMatch(img.name) === normalizedSample
            );
            
            if (matchingImage && matchingImage.url) {
              imageUri = matchingImage.url;
              resolvedImage = true;
              console.log('✅ Resolved image:', matchingImage.name, '->', matchingImage.url.substring(0, 80) + '...');
            } else {
              console.warn('❌ No matching image found for:', normalizedSample);
            }
          }
          
          // Fall back to placeholder if no image resolved
          if (!resolvedImage) {
            imageUri = `data:image/svg+xml;base64,${btoa(`
              <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
                <rect width="200" height="200" fill="#f3f4f6"/>
                <path d="M75 50 L125 50 L125 100 L75 100 Z" fill="none" stroke="#9ca3af" stroke-width="2"/>
                <circle cx="90" cy="65" r="5" fill="#9ca3af"/>
                <path d="M75 95 L95 75 L115 90 L125 80" fill="none" stroke="#9ca3af" stroke-width="2"/>
                <text x="100" y="140" text-anchor="middle" fill="#6b7280" font-size="12">VDP Image</text>
                <text x="100" y="160" text-anchor="middle" fill="#9ca3af" font-size="10">${imageField}</text>
              </svg>
            `)}`;
          }
          
          engine.block.setString(imageFill, 'fill/image/imageFileURI', imageUri);
          engine.block.setFill(graphicBlock, imageFill);
          
          // Append to page FIRST
          engine.block.appendChild(page, graphicBlock);
          
          // Enable interaction scopes (required since global scopes are set to Defer)
          enableBlockInteraction(engine, graphicBlock);
          
          // Set size and position
          engine.block.setWidth(graphicBlock, imageSize);
          engine.block.setHeight(graphicBlock, imageSize);
          engine.block.setPositionX(graphicBlock, imageX);
          engine.block.setPositionY(graphicBlock, imageY);
          
          // Set VDP naming convention for resolution
          engine.block.setName(graphicBlock, `vdp:image:${imageField}`);
          
          console.log(`✅ Created VDP image block: vdp:image:${imageField} at (${imageX}, ${imageY})`, resolvedImage ? 'with resolved image' : 'with placeholder');
          
          // Stack multiple images horizontally at the bottom
          imageX += imageSize + 2;
          // If we run out of horizontal space, move up a row
          if (imageX + imageSize > widthMm - 3) {
            imageX = (widthMm - imageSize) / 2;
            imageY -= imageSize + 2;
          }
        } catch (imgError) {
          console.error(`❌ Failed to create image block for ${imageField}:`, imgError);
        }
      }
    }

    console.log('✅ Hybrid auto-layout complete:', layoutResult.fields.length, 'text blocks +', imageFieldsDetected.length, 'image blocks created');
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
  projectType = 'label',
  projectImages = [],
  trimGuideMm,
}: CreativeEditorWrapperProps) {
  // Detect image fields from available fields
  const imageFields = availableFields.filter(f => isLikelyImageField(f));
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<CreativeEditorSDK | null>(null);
  const pageCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
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
  
  // State for background guidance panel
  const [showBackgroundGuide, setShowBackgroundGuide] = useState(false);

  // Export function exposed to parent components
  const handleExport = useCallback(async (options?: Partial<ExportOptions>) => {
    if (!editorRef.current) return null;
    
    const exportOptions: ExportOptions = {
      ...getPrintReadyExportOptions({ whiteUnderlayer, bleedMm }),
      ...options,
    };
    
    return exportDesign(editorRef.current, exportOptions);
  }, [whiteUnderlayer, bleedMm]);

  // Handle adding background image from guide panel
  const handleAddBackgroundImage = useCallback(async (file: File) => {
    if (!editorRef.current) return;
    const engine = editorRef.current.engine;
    
    // Convert file to data URL
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      if (!dataUrl) return;
      
      try {
        // Get page and its dimensions
        const pages = engine.scene.getPages();
        if (pages.length === 0) return;
        
        const page = pages[0];
        const pageWidth = engine.block.getWidth(page);
        const pageHeight = engine.block.getHeight(page);
        
        // Create graphic block at full page size
        const graphic = engine.block.create('//ly.img.ubq/graphic');
        const rect = engine.block.createShape('//ly.img.ubq/shape/rect');
        engine.block.setShape(graphic, rect);
        
        // Create image fill
        const fill = engine.block.createFill('//ly.img.ubq/fill/image');
        engine.block.setString(fill, 'fill/image/imageFileURI', dataUrl);
        engine.block.setFill(graphic, fill);
        
        // Set size to fill page
        engine.block.setWidth(graphic, pageWidth);
        engine.block.setHeight(graphic, pageHeight);
        engine.block.setPositionX(graphic, 0);
        engine.block.setPositionY(graphic, 0);
        
        // Add to page and SEND TO BACK
        engine.block.appendChild(page, graphic);
        engine.block.sendToBack(graphic);
        
        // CRITICAL: Enable interaction scopes (required since global scopes are set to Defer)
        enableBlockInteraction(engine, graphic);
        
        // Name it for identification
        engine.block.setName(graphic, 'background');
        
        // Select it so user can adjust crop
        engine.block.setSelected(graphic, true);
        
        console.log('✅ Added background image at full page size, sent to back');
      } catch (err) {
        console.error('Failed to add background image:', err);
      }
    };
    reader.readAsDataURL(file);
  }, []);

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
    
    // CRITICAL: Append to page FIRST before setting position
    // CE.SDK position is relative to parent - must be parented first
    engine.block.appendChild(page, block);
    
    // Get actual page dimensions in mm
    const pageWidthMm = engine.block.getWidth(page);
    const pageHeightMm = engine.block.getHeight(page);
    
    // Set size relative to page dimensions
    const barcodeWidthMm = Math.min(pageWidthMm * 0.5, 50);  // ~50% of page width, max 50mm
    const barcodeHeightMm = Math.min(pageHeightMm * 0.3, 25); // ~30% of page height, max 25mm
    engine.block.setWidth(block, barcodeWidthMm);
    engine.block.setHeight(block, barcodeHeightMm);
    
    // Position: centered horizontally, lower half of label
    engine.block.setPositionX(block, (pageWidthMm - barcodeWidthMm) / 2);
    engine.block.setPositionY(block, pageHeightMm * 0.55);
    
    // Store metadata in block name for VDP resolution
    if (variableField) {
      engine.block.setName(block, `barcode:${format}:${variableField}`);
    }
    
    console.log(`✅ Created barcode: ${barcodeWidthMm.toFixed(1)}mm × ${barcodeHeightMm.toFixed(1)}mm`);
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
    
    // CRITICAL: Append to page FIRST before setting position
    // CE.SDK position is relative to parent - must be parented first
    engine.block.appendChild(page, block);
    
    // Get actual page dimensions in mm
    const pageWidthMm = engine.block.getWidth(page);
    const pageHeightMm = engine.block.getHeight(page);
    
    // QR codes should be square, sized relative to page dimensions
    const qrSizeMm = Math.min(pageWidthMm * 0.25, pageHeightMm * 0.6, 30); // Max 30mm
    engine.block.setWidth(block, qrSizeMm);
    engine.block.setHeight(block, qrSizeMm);
    
    // Position: right side with 5% margin, vertically centered
    engine.block.setPositionX(block, pageWidthMm - qrSizeMm - pageWidthMm * 0.05);
    engine.block.setPositionY(block, (pageHeightMm - qrSizeMm) / 2);
    
    // Store metadata in block name for VDP resolution
    if (variableField) {
      engine.block.setName(block, `qrcode::${variableField}`);
    }
    
    console.log(`✅ Created QR code: ${qrSizeMm.toFixed(1)}mm × ${qrSizeMm.toFixed(1)}mm`);
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
                show: false, // Hide "Customize Editor" button
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

                    // Add a custom "VDP Images" section for variable images
                    const imagesEntry = {
                      id: 'vdp-images',
                      sourceIds: ['vdp-images'],
                      previewLength: 3,
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
                      icon: () => 'https://img.icons8.com/ios/50/image.png',
                      title: () => 'Variable Images',
                    };
                    
                    return [dataFieldsEntry, barcodesEntry, sequencesEntry, imagesEntry, ...defaultEntries];
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
            // Removed 'ly.img.back.navigationBar' - redundant with our breadcrumbs
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

        // Disable page management features for label projects (labels are single-sided only)
        if (projectType === 'label') {
          try {
            cesdk.feature.disable('ly.img.page.add');
            cesdk.feature.disable('ly.img.page.move');
            cesdk.feature.disable('ly.img.page.duplicate');
            console.log('[CESDK] Page management disabled for label project (single-sided only)');
          } catch (e) {
            console.warn('Could not disable page features:', e);
          }
        } else {
          console.log(`[CESDK] Multi-page enabled for ${projectType} project`);
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

        // Register VDP image asset source - use value-based detection
        const detectedImageFields = detectImageColumnsFromValues(availableFields, allSampleData.length > 0 ? allSampleData : [sampleData]);
        if (detectedImageFields.length > 0 || projectImages.length > 0) {
          cesdk.engine.asset.addSource(createImageAssetSource({
            availableFields,
            sampleData,
            allSampleData,
            projectImages,
          }, cesdk.engine));
        }

        // Helper to set design unit to Millimeter and configure page size for ALL pages
        const setPageSizeMm = (pages: number[]) => {
          if (pages.length > 0) {
            // Set design unit to Millimeter - CE.SDK will handle internal conversions
            cesdk.engine.scene.setDesignUnit('Millimeter');
            // Apply dimensions to ALL pages (important for multi-page designs like double-sided cards)
            pages.forEach(page => {
              cesdk.engine.block.setWidth(page, labelWidth);
              cesdk.engine.block.setHeight(page, labelHeight);
            });
          }
        };
        
        // Periodically check and fix page dimensions for new pages
        let lastPageCount = 0;
        pageCheckIntervalRef.current = setInterval(() => {
          try {
            const allPages = cesdk.engine.scene.getPages();
            if (allPages.length !== lastPageCount) {
              lastPageCount = allPages.length;
              setPageSizeMm(allPages);
            }
          } catch (e) {
            // Editor might be disposed, ignore
          }
        }, 500);

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
            allSampleData,
            labelWidth,
            labelHeight,
            templateType,
            setLayoutStatus,
            projectImages
          );
          
          // Clear all selections for a clean initial view
          const allSelected = cesdk.engine.block.findAllSelected();
          allSelected.forEach(blockId => cesdk.engine.block.setSelected(blockId, false));
          console.log('🧹 Cleared selection after layout generation');
          
          // Show background guidance panel for new designs
          setShowBackgroundGuide(true);
        }

        // Trim guide is now handled in a separate useEffect to allow dynamic updates

        // ============ GLOBAL SCOPE CONFIGURATION ============
        // Set global scopes to "Defer" so block-level setScopeEnabled() calls work
        // This is REQUIRED for the trim guide to be non-selectable
        try {
          cesdk.engine.editor.setGlobalScope('editor/select', 'Defer');
          cesdk.engine.editor.setGlobalScope('layer/move', 'Defer');
          cesdk.engine.editor.setGlobalScope('layer/resize', 'Defer');
          cesdk.engine.editor.setGlobalScope('layer/rotate', 'Defer');
          cesdk.engine.editor.setGlobalScope('lifecycle/destroy', 'Defer');
          cesdk.engine.editor.setGlobalScope('lifecycle/duplicate', 'Defer');
          console.log('🔒 Global scopes set to Defer - trim guide will now be locked');
          
          // Enable scopes on ALL existing blocks (so they remain editable)
          const allBlocks = cesdk.engine.block.findAll();
          allBlocks.forEach(blockId => {
            try {
              const name = cesdk.engine.block.getName(blockId);
              // Skip trim guide - it should NOT be enabled
              if (name === '__trim_guide__') return;
              
              cesdk.engine.block.setScopeEnabled(blockId, 'editor/select', true);
              cesdk.engine.block.setScopeEnabled(blockId, 'layer/move', true);
              cesdk.engine.block.setScopeEnabled(blockId, 'layer/resize', true);
              cesdk.engine.block.setScopeEnabled(blockId, 'layer/rotate', true);
              cesdk.engine.block.setScopeEnabled(blockId, 'lifecycle/destroy', true);
              cesdk.engine.block.setScopeEnabled(blockId, 'lifecycle/duplicate', true);
            } catch (e) {
              // Some blocks may not support scopes (scene, page structure blocks)
            }
          });
        } catch (e) {
          console.warn('Could not set global scopes:', e);
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

        // ============ GLOBAL BLOCK INTERACTION LISTENER ============
        // Track known blocks so we can detect NEW blocks and enable interaction on them
        // This is critical because global scopes are set to "Defer", so new blocks
        // won't be selectable unless we explicitly enable their scopes
        let knownBlocks = new Set(cesdk.engine.block.findAll());
        
        // Add history listener to track unsaved changes AND enable interaction on new blocks
        cesdk.engine.editor.onHistoryUpdated(() => {
          onSceneChange?.(true);
          
          // Check for new blocks and enable interaction on them
          try {
            const currentBlocks = cesdk.engine.block.findAll();
            currentBlocks.forEach(blockId => {
              if (!knownBlocks.has(blockId)) {
                // This is a NEW block - enable interaction (unless it's the trim guide)
                try {
                  const name = cesdk.engine.block.getName(blockId) || '';
                  if (name !== '__trim_guide__') {
                    enableBlockInteraction(cesdk.engine, blockId);
                    console.log('🔓 Enabled interaction on new block:', blockId, name || '(unnamed)');
                  }
                } catch (e) {
                  // Block may not support getName or scopes
                }
                knownBlocks.add(blockId);
              }
            });
            
            // Update tracking set (also removes deleted blocks)
            knownBlocks = new Set(currentBlocks);
          } catch (e) {
            // Editor may be disposed or in transition state
          }
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
      // Clean up page check interval
      if (pageCheckIntervalRef.current) {
        clearInterval(pageCheckIntervalRef.current);
        pageCheckIntervalRef.current = null;
      }
      if (editorRef.current) {
        try {
          editorRef.current.dispose();
        } catch (err) {
          console.warn('CE.SDK disposal error (safe to ignore):', err);
        }
        editorRef.current = null;
      }
    };
  }, [licenseKey]);

  // Track previous dimensions to calculate offset for centering artwork
  const prevDimensionsRef = useRef<{ width: number; height: number } | null>(null);

  // Separate effect for handling dimension changes without reinitializing the editor
  useEffect(() => {
    if (!editorRef.current) return;

    try {
      const engine = editorRef.current.engine;
      const pages = engine.scene.getPages();

      if (pages.length > 0) {
        const page = pages[0];

        // Read actual current page dimensions from the engine (works on first toggle too)
        const currentWidth = engine.block.getWidth(page);
        const currentHeight = engine.block.getHeight(page);

        // Calculate offset to keep artwork centered (half the size change)
        const offsetX = (labelWidth - currentWidth) / 2;
        const offsetY = (labelHeight - currentHeight) / 2;

        // Update all page dimensions
        pages.forEach((p) => {
          engine.block.setWidth(p, labelWidth);
          engine.block.setHeight(p, labelHeight);
        });

        // Shift all existing artwork to keep it centered (only if there's an offset)
        if (offsetX !== 0 || offsetY !== 0) {
          const children = engine.block.getChildren(page);
          children.forEach((childId) => {
            try {
              const name = engine.block.getName(childId);
              // Don't move the trim guide - it positions itself based on bleed
              if (name === '__trim_guide__') return;

              const currentX = engine.block.getPositionX(childId);
              const currentY = engine.block.getPositionY(childId);
              engine.block.setPositionX(childId, currentX + offsetX);
              engine.block.setPositionY(childId, currentY + offsetY);
            } catch (e) {
              // Block might not support positioning
            }
          });
          console.log(
            `📐 Shifted artwork by (${offsetX.toFixed(2)}, ${offsetY.toFixed(2)})mm to keep centered`
          );
        }

        prevDimensionsRef.current = { width: labelWidth, height: labelHeight };
        console.log(`📐 Updated page dimensions: ${labelWidth}mm × ${labelHeight}mm`);
      }
    } catch (e) {
      console.warn('Failed to update page dimensions:', e);
    }
  }, [labelWidth, labelHeight]);

  // Ref to prevent re-entry during trim guide creation
  const trimGuideCreatingRef = useRef(false);

  // Separate effect for trim guide - add/remove dynamically without reinit
  useEffect(() => {
    if (!editorRef.current) return;
    
    // Prevent re-entry (race condition guard)
    if (trimGuideCreatingRef.current) {
      console.log('✂️ Trim guide creation already in progress, skipping');
      return;
    }
    
    // Small delay to ensure editor is fully ready after dimension changes
    const timeoutId = setTimeout(() => {
      if (!editorRef.current) return;
      if (trimGuideCreatingRef.current) return;
      
      trimGuideCreatingRef.current = true;
      
      try {
        const engine = editorRef.current.engine;
        const pages = engine.scene.getPages();
        if (pages.length === 0) {
          console.log('✂️ No pages found for trim guide');
          trimGuideCreatingRef.current = false;
          return;
        }
        
        const page = pages[0];
        
        // GLOBAL CLEANUP: Find and destroy ALL existing trim guides (not just page children)
        // This prevents duplicates from race conditions
        try {
          const allGraphics = engine.block.findByType('//ly.img.ubq/graphic');
          for (const blockId of allGraphics) {
            try {
              if (engine.block.getName(blockId) === '__trim_guide__') {
                engine.block.destroy(blockId);
                console.log('✂️ Cleaned up existing trim guide:', blockId);
              }
            } catch (e) {
              // Block might not exist anymore
            }
          }
        } catch (e) {
          console.warn('Failed to clean up existing trim guides:', e);
        }
        
        if (trimGuideMm) {
          const { width: trimWidth, height: trimHeight, bleedMm: bleed } = trimGuideMm;
          
          // CRITICAL FIX: Verify page dimensions are correct before creating guide
          // If page is still at old dimensions (before bleed was added), skip and let the effect re-run
          const currentPageWidth = engine.block.getWidth(page);
          const currentPageHeight = engine.block.getHeight(page);
          const expectedWidth = trimWidth + (bleed * 2);
          const expectedHeight = trimHeight + (bleed * 2);
          
          // Use a small tolerance for floating point comparison (0.1mm)
          const tolerance = 0.1;
          if (Math.abs(currentPageWidth - expectedWidth) > tolerance || 
              Math.abs(currentPageHeight - expectedHeight) > tolerance) {
            console.log(`✂️ Page dimensions not ready: ${currentPageWidth.toFixed(1)}×${currentPageHeight.toFixed(1)}mm, expected ${expectedWidth.toFixed(1)}×${expectedHeight.toFixed(1)}mm - will retry when dimensions update`);
            trimGuideCreatingRef.current = false;
            return; // The effect will re-run when labelWidth/labelHeight update
          }
          
          console.log(`✂️ Trim guide config: ${trimWidth}mm × ${trimHeight}mm, bleed: ${bleed}mm`);
          
          // Create new trim guide as a graphic with rect shape
          const trimGuide = engine.block.create('//ly.img.ubq/graphic');
          
          // SET NAME IMMEDIATELY to prevent duplicates in race conditions
          engine.block.setName(trimGuide, '__trim_guide__');
          
          const trimShape = engine.block.createShape('//ly.img.ubq/shape/rect');
          engine.block.setShape(trimGuide, trimShape);

          engine.block.setWidth(trimGuide, trimWidth);
          engine.block.setHeight(trimGuide, trimHeight);

          // Append to page
          engine.block.appendChild(page, trimGuide);

          // Position it inside the bleed area
          engine.block.setPositionX(trimGuide, bleed);
          engine.block.setPositionY(trimGuide, bleed);

          // Enable stroke and make it visible - subtle 0.3mm line
          engine.block.setStrokeEnabled(trimGuide, true);
          engine.block.setStrokeWidth(trimGuide, 0.3);
          engine.block.setStrokeStyle(trimGuide, 'DashedRound');
          // Magenta/pink color like professional print software
          engine.block.setColor(trimGuide, 'stroke/color/value', { r: 0.9, g: 0.0, b: 0.5, a: 1.0 });

          // No fill - just the outline
          engine.block.setFillEnabled(trimGuide, false);

          // Lock the trim guide to prevent any interaction (most reliable method)
          try {
            engine.block.setBool(trimGuide, 'locked', true);
          } catch (e) {
            console.warn('Could not set locked property:', e);
          }

          // Make trim guide non-interactive - purely visual reference (belt and suspenders)
          engine.block.setScopeEnabled(trimGuide, 'editor/select', false);
          engine.block.setScopeEnabled(trimGuide, 'layer/move', false);
          engine.block.setScopeEnabled(trimGuide, 'layer/resize', false);
          engine.block.setScopeEnabled(trimGuide, 'layer/rotate', false);
          engine.block.setScopeEnabled(trimGuide, 'lifecycle/destroy', false);
          engine.block.setScopeEnabled(trimGuide, 'lifecycle/duplicate', false);

          // Ensure it's above artwork
          engine.block.bringToFront(trimGuide);
          
          console.log(`✂️ Created trim guide: ${trimWidth}mm × ${trimHeight}mm with ${bleed}mm bleed`);
        }
        // If trimGuideMm is null, we already cleaned up all guides above
        
      } catch (e) {
        console.warn('Failed to manage trim guide:', e);
      } finally {
        trimGuideCreatingRef.current = false;
      }
    }, 100);
    
    return () => {
      clearTimeout(timeoutId);
      trimGuideCreatingRef.current = false;
    };
  }, [trimGuideMm, labelWidth, labelHeight]); // Re-run when dimensions change to ensure trim guide is created after page resize

  // Helper to normalize image names for matching
  const normalizeForImageMatch = (name: string): string => {
    let baseName = name;
    // Extract filename from Windows path
    if (name.includes('\\')) baseName = name.split('\\').pop() || name;
    // Extract filename from Unix path  
    else if (name.includes('/')) baseName = name.split('/').pop() || name;
    // Remove query params
    if (baseName.includes('?')) baseName = baseName.split('?')[0];
    // Remove extension and normalize
    return baseName.replace(/\.(png|jpg|jpeg|gif|webp|svg|bmp|tiff?)$/i, '').toLowerCase().trim();
  };

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
          // Filter out junk columns like Unnamed_Column_*
          const validFieldNames = fieldNames.filter(f => 
            !/^Unnamed_Column_\d+$/i.test(f.trim())
          );
          const newContent = validFieldNames
            .map(fieldName => currentSampleData[fieldName] || '')
            .filter(Boolean)
            .join('\n');
          
          // Always update, show placeholder if empty
          engine.block.replaceText(blockId, newContent || '(No data)');
          
          // Auto-scale font to fit container when content changes
          if (newContent) {
            try {
              const blockHeight = engine.block.getHeight(blockId);
              const blockWidth = engine.block.getWidth(blockId);
              const currentFontSize = engine.block.getFloat(blockId, 'text/fontSize') || 12;
              
              // Get original font size from metadata or use current
              const originalSizeStr = engine.block.getMetadata(blockId, 'originalFontSize');
              const baseFontSize = originalSizeStr ? parseFloat(originalSizeStr) : currentFontSize;
              
              // Reset to base font size to measure accurately
              engine.block.setTextFontSize(blockId, baseFontSize);
              
              // Measure rendered content
              const frameHeight = engine.block.getFrameHeight(blockId);
              const frameWidth = engine.block.getFrameWidth(blockId);
              
              if (frameHeight > 0 && blockHeight > 0) {
                const heightRatio = blockHeight / frameHeight;
                const widthRatio = blockWidth / frameWidth;
                const scaleFactor = Math.min(heightRatio, widthRatio, 1.0);
                
                if (scaleFactor < 0.95) {
                  const newFontSize = Math.max(6, baseFontSize * scaleFactor * 0.92);
                  engine.block.setTextFontSize(blockId, newFontSize);
                  console.log(`📐 Scaled address block: ${baseFontSize.toFixed(1)}pt → ${newFontSize.toFixed(1)}pt`);
                }
              }
            } catch (err) {
              console.warn('Font scaling error:', err);
            }
          }
        } else if (blockName.startsWith('vdp:text:')) {
          // Individual field
          const fieldName = blockName.replace('vdp:text:', '');
          const value = currentSampleData[fieldName] || `{{${fieldName}}}`;
          engine.block.replaceText(blockId, value);
        }
      });
      
      // Update VDP image blocks with current record's image
      const graphicBlocks = engine.block.findByType('//ly.img.ubq/graphic');
      console.log('🖼️ Updating VDP image blocks for record', currentRecordIndex);
      console.log('📦 Project images available:', projectImages.length, projectImages.map(img => ({
        name: img.name,
        normalized: normalizeForImageMatch(img.name),
        urlPreview: img.url?.substring(0, 60) + '...'
      })));
      
      graphicBlocks.forEach((blockId) => {
        const blockName = engine.block.getName(blockId);
        
        if (blockName?.startsWith('vdp:image:')) {
          const fieldName = blockName.replace('vdp:image:', '');
          const fieldValue = currentSampleData[fieldName];
          
          console.log('🔍 Processing image block:', { fieldName, fieldValue });
          
          if (fieldValue && projectImages.length > 0) {
            // Normalize the field value to match uploaded image
            const normalizedValue = normalizeForImageMatch(String(fieldValue));
            
            console.log('🔍 Matching:', {
              fieldName,
              fieldValue,
              normalizedValue,
              availableNormalized: projectImages.map(img => normalizeForImageMatch(img.name))
            });
            
            // Find matching project image
            const matchingImage = projectImages.find(img => 
              normalizeForImageMatch(img.name) === normalizedValue
            );
            
            if (matchingImage) {
              console.log('✅ Found matching image:', matchingImage.name, '->', matchingImage.url?.substring(0, 80));
              try {
                const fill = engine.block.getFill(blockId);
                if (fill && engine.block.isValid(fill)) {
                  engine.block.setString(fill, 'fill/image/imageFileURI', matchingImage.url);
                  console.log('✅ Updated image block fill');
                }
              } catch (imgErr) {
                console.warn(`Failed to update image block ${fieldName}:`, imgErr);
              }
            } else {
              console.warn('❌ No matching image found for:', normalizedValue);
            }
          } else {
            console.log('⚠️ No fieldValue or no projectImages:', { fieldValue, imageCount: projectImages.length });
          }
        }
      });
    } catch (e) {
      console.warn('Failed to update record preview:', e);
    }
  }, [currentRecordIndex, currentSampleData, projectImages]);

  // DEDICATED EFFECT: Resolve VDP images when projectImages becomes available
  // This handles the race condition where projectImages loads AFTER the scene is already rendered
  useEffect(() => {
    if (!editorRef.current || isLoading) return;
    
    console.log('🖼️ [VDP Image Resolution] Effect triggered');
    console.log('📦 projectImages count:', projectImages.length);
    
    if (projectImages.length === 0) {
      console.log('⏳ Waiting for projectImages to load...');
      return;
    }
    
    console.log('📦 Available projectImages:', projectImages.map(img => ({
      name: img.name,
      normalized: normalizeForImageMatch(img.name),
      urlExists: !!img.url
    })));
    
    const engine = editorRef.current.engine;
    const graphicBlocks = engine.block.findByType('//ly.img.ubq/graphic');
    
    console.log('🔍 Scanning', graphicBlocks.length, 'graphic blocks for VDP image blocks...');
    
    let resolvedCount = 0;
    let notFoundCount = 0;
    
    graphicBlocks.forEach((blockId) => {
      const blockName = engine.block.getName(blockId);
      
      if (blockName?.startsWith('vdp:image:')) {
        const fieldName = blockName.replace('vdp:image:', '');
        const fieldValue = currentSampleData[fieldName];
        
        console.log('🔍 Found VDP image block:', { blockName, fieldName, fieldValue });
        
        if (fieldValue) {
          const normalizedValue = normalizeForImageMatch(String(fieldValue));
          
          console.log('🔍 Attempting to match:', {
            originalValue: fieldValue,
            normalizedValue,
            against: projectImages.map(img => normalizeForImageMatch(img.name))
          });
          
          const matchingImage = projectImages.find(img => 
            normalizeForImageMatch(img.name) === normalizedValue
          );
          
          if (matchingImage?.url) {
            try {
              const fill = engine.block.getFill(blockId);
              if (fill && engine.block.isValid(fill)) {
                engine.block.setString(fill, 'fill/image/imageFileURI', matchingImage.url);
                console.log('✅ [VDP Image Resolution] Resolved:', fieldName, '->', matchingImage.name);
                resolvedCount++;
              }
            } catch (e) {
              console.warn('❌ Failed to set image fill:', e);
            }
          } else {
            console.warn('❌ [VDP Image Resolution] No match found for:', { fieldName, fieldValue, normalizedValue });
            notFoundCount++;
          }
        } else {
          console.warn('⚠️ [VDP Image Resolution] No field value for:', fieldName);
        }
      }
    });
    
    console.log('📊 [VDP Image Resolution] Summary:', { resolved: resolvedCount, notFound: notFoundCount, totalBlocks: graphicBlocks.length });
  }, [projectImages, isLoading, currentSampleData]);

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
    
    // Set explicit Roboto font for proper PDF embedding
    setRobotoFont(engine, textBlock);
    
    // CRITICAL: Append to page FIRST before setting position
    // CE.SDK position is relative to parent - must be parented first
    engine.block.appendChild(page, textBlock);
    
    // CRITICAL: Enable interaction scopes (required since global scopes are set to Defer)
    // The global listener may not catch text blocks created via engine.block.create()
    enableBlockInteraction(engine, textBlock);
    
    // Now set text content
    engine.block.replaceText(textBlock, displayValue);
    
    // Store sequence config in block name
    engine.block.setName(textBlock, createSequenceBlockName(seqConfig));
    
    // Get page dimensions in mm
    const pageWidthMm = engine.block.getWidth(page);
    const pageHeightMm = engine.block.getHeight(page);
    
    // Set size relative to label dimensions - wider for sequence text
    const seqWidthMm = Math.min(pageWidthMm * 0.4, 50);  // 40% of width, max 50mm
    const seqHeightMm = Math.min(pageHeightMm * 0.25, 15); // 25% of height, max 15mm
    
    engine.block.setWidthMode(textBlock, 'Absolute');
    engine.block.setWidth(textBlock, seqWidthMm);
    engine.block.setHeightMode(textBlock, 'Absolute');
    engine.block.setHeight(textBlock, seqHeightMm);
    
    // NOTE: Sequence blocks do NOT use auto-fit - they use fixed font size
    // Auto-fit causes issues with the setFloat API during export
    
    // Position at bottom-left with proper margins (5% from edges)
    engine.block.setPositionX(textBlock, pageWidthMm * 0.05);
    engine.block.setPositionY(textBlock, pageHeightMm * 0.70); // 70% down = bottom area
    
    // Set a reasonable font size (14pt is good for sequences)
    engine.block.setTextFontSize(textBlock, 14);
    
    // Select the new block
    engine.block.setSelected(textBlock, true);
    
    console.log(`✅ Created sequence block: ${seqWidthMm.toFixed(1)}mm × auto, at (${(pageWidthMm * 0.05).toFixed(1)}, ${(pageHeightMm * 0.70).toFixed(1)})`);
    
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
      
      {/* Record Navigation Bar - positioned above page timeline */}
      {totalRecords > 1 && !isLoading && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-card border rounded-lg shadow-lg px-3 py-2">
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
      
      {/* Background Image Guidance Panel */}
      <BackgroundGuidePanel
        open={showBackgroundGuide}
        onClose={() => setShowBackgroundGuide(false)}
        onAddBackground={handleAddBackgroundImage}
        templateType={templateType}
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
