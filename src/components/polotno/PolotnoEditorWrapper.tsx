/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState, useCallback, createElement } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Import from JS bridge - TypeScript will treat these as `any`, avoiding type resolution
import {
  loadPolotnoModules,
  createPolotnoStore,
  configureBleed,
  loadScene,
  saveScene,
  getPolotnoComponents,
  exportToPdf,
  mmToPixels as runtimeMmToPixels,
  cropMarkMmToPixels,
} from '@/vendor/polotno-runtime.js';

import {
  createVdpFieldsSection,
  createBarcodesSection,
  createProjectImagesSection,
  createSequenceSection,
  buildCustomSections,
} from '@/vendor/polotno-sections.js';

// Import React panel components (no polotno imports, pure React)
import { VdpFieldsPanel } from './panels/VdpFieldsPanel';
import { BarcodePanel } from './panels/BarcodePanel';
import { ProjectImagesPanel } from './panels/ProjectImagesPanel';
import { SequencePanel } from './panels/SequencePanel';

// VDP variable resolution with image matching, caching, and layout merge
import { 
  resolveVdpVariables, 
  batchResolveVdp, 
  prefetchImagesForRecords,
  warmCacheForAdjacentRecords,
  findImageUrl,
  mergeLayoutToBase,
} from '@/lib/polotno/vdpResolver';
import type { PolotnoScene } from '@/lib/polotno/types';

// Supabase client for edge function calls
import { supabase } from '@/integrations/supabase/client';

// Ref handle exposed to parent for imperative actions
export interface PolotnoEditorHandle {
  /** Save the base template scene (without VDP values) */
  saveScene: () => Promise<string>;
  /** Export current view as PDF */
  exportPdf: (options?: PrintExportOptions) => Promise<Blob>;
  /** Export a specific resolved scene as PDF (for batch export) */
  exportResolvedPdf: (scene: PolotnoScene, options?: PrintExportOptions) => Promise<Blob>;
  /** Get resolved scene for a specific record */
  getResolvedScene: (record: Record<string, string>, recordIndex: number) => PolotnoScene;
  /** Batch resolve all records for export */
  batchResolve: (records: Record<string, string>[]) => PolotnoScene[];
  /** Raw Polotno store instance */
  store: any;
  /** Get the base template scene (without VDP resolution) */
  getBaseScene: () => string;
  /** Regenerate AI layout (for reset functionality) */
  regenerateLayout: () => Promise<void>;
}

// Print export options for PDF generation
export interface PrintExportOptions {
  includeBleed?: boolean;
  includeCropMarks?: boolean;
  cropMarkSizeMm?: number;
  pixelRatio?: number;
  fileName?: string;
}

// Record navigation state exposed to parent
export interface RecordNavigationState {
  currentIndex: number;
  totalRecords: number;
  goToNext: () => void;
  goToPrevious: () => void;
}

interface PolotnoEditorWrapperProps {
  availableFields?: string[];
  sampleData?: Record<string, string>;
  allSampleData?: Record<string, string>[];
  initialScene?: string;
  onSave?: (sceneString: string) => void;
  onSceneChange?: (hasChanges: boolean) => void;
  onReady?: (handle: PolotnoEditorHandle) => void;
  onRecordNavigationChange?: (state: RecordNavigationState) => void;
  labelWidth?: number;
  labelHeight?: number;
  bleedMm?: number;
  projectType?: string;
  projectImages?: { name: string; url: string }[];
  trimGuideMm?: { width: number; height: number; bleedMm: number };
}

// Use runtime's mmToPixels for consistency
const mmToPixels = (mm: number, dpi = 300) => runtimeMmToPixels(mm, dpi);

// Convert pt to px for font sizes (layout engine returns pt, Polotno uses px)
const ptToPx = (pt: number): number => pt * (96 / 72); // 96 DPI screen / 72 pt per inch

/**
 * Detect if a field is likely an image field based on its name or sample values
 */
function detectImageColumnsFromValues(
  fields: string[],
  sampleRows: Record<string, string>[]
): string[] {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'];
  const imageFields: string[] = [];
  
  for (const field of fields) {
    // Check by name patterns
    const lowerName = field.toLowerCase();
    if (lowerName.includes('image') || lowerName.includes('photo') || 
        lowerName.includes('logo') || lowerName.includes('picture') ||
        lowerName.includes('img') || lowerName.includes('avatar')) {
      imageFields.push(field);
      continue;
    }
    
    // Check sample values for file extensions
    for (const row of sampleRows) {
      const value = String(row[field] || '').toLowerCase();
      if (imageExtensions.some(ext => value.endsWith(ext)) || 
          value.startsWith('http') && imageExtensions.some(ext => value.includes(ext))) {
        imageFields.push(field);
        break;
      }
    }
  }
  
  return imageFields;
}

/**
 * Infer image aspect ratio from field name
 */
function inferImageAspectRatio(fieldName: string): { width: number; height: number } {
  const name = fieldName.toLowerCase();
  // Logos, avatars, icons are typically square
  if (name.includes('logo') || name.includes('avatar') || name.includes('icon') || name.includes('qr')) {
    return { width: 1, height: 1 };
  }
  // Photos are typically 3:2 landscape
  return { width: 3, height: 2 };
}

/**
 * Calculate image dimensions that fit within bounds while preserving aspect ratio
 */
function calculateImageDimensions(
  aspectRatio: { width: number; height: number },
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  const aspectW = aspectRatio.width / aspectRatio.height;
  
  // Try fitting by width
  let width = maxWidth;
  let height = width / aspectW;
  
  // If height exceeds max, fit by height instead
  if (height > maxHeight) {
    height = maxHeight;
    width = height * aspectW;
  }
  
  return { width, height };
}

// Layout spec from AI
interface LayoutSpec {
  layoutType: 'split_text_left_image_right' | 'text_only' | 'split_image_left_text_right';
  textArea: {
    xPercent: number;
    yPercent: number;
    widthPercent: number;
    heightPercent: number;
  };
  imageArea?: {
    xPercent: number;
    yPercent: number;
    widthPercent: number;
    heightPercent: number;
    aspectRatio: { width: number; height: number };
  };
  images?: Array<{
    fieldName: string;
    aspectRatio: { width: number; height: number };
  }>;
  gap: number;
}

/**
 * AI-assisted layout generation for Polotno
 * Now uses structured layoutSpec from the AI for direct application
 */
async function generateInitialLayoutPolotno(
  store: any,
  fields: string[],
  sampleData: Record<string, string>,
  allSampleData: Record<string, string>[],
  widthMm: number,
  heightMm: number,
  templateType: string,
  projectImages: { name: string; url: string }[] = []
): Promise<string | null> {
  if (fields.length === 0 || Object.keys(sampleData).length === 0) {
    console.log('⏭️ Skipping auto-layout: no fields or sample data');
    return null;
  }

  console.log('🎨 AUTO-TRIGGERING AI LAYOUT GENERATION');

  // Detect image fields using value-based detection
  const sampleRows = allSampleData.length > 0 ? allSampleData : [sampleData];
  const imageFieldsDetected = detectImageColumnsFromValues(fields, sampleRows);
  console.log('🖼️ Detected image fields:', imageFieldsDetected);
  
  // Filter out image fields from text layout - they will be handled via layoutSpec
  const textFields = fields.filter(f => !imageFieldsDetected.includes(f));

  try {
    // Step 1: Call hybrid layout generator to get AI strategy with layoutSpec
    const { data: hybridData, error: hybridError } = await supabase.functions.invoke('generate-layout', {
      body: {
        fieldNames: fields, // Send all fields including images for proper detection
        sampleData: [sampleData],
        templateSize: { width: widthMm, height: heightMm },
        templateType: templateType || 'address_label',
      },
    });

    if (hybridError) {
      console.warn('⚠️ Hybrid layout API error:', hybridError);
      return applyFallbackLayout(store, textFields, imageFieldsDetected, sampleData, widthMm, heightMm, projectImages);
    }

    if (!hybridData?.designStrategy) {
      console.warn('⚠️ No design strategy returned from hybrid layout');
      return applyFallbackLayout(store, textFields, imageFieldsDetected, sampleData, widthMm, heightMm, projectImages);
    }

    console.log('📐 Design strategy received:', hybridData.designStrategy.strategy);
    
    // Step 2: Apply layout using the structured layoutSpec (if available)
    const layoutSpec = hybridData.designStrategy.layoutSpec as LayoutSpec | undefined;
    
    if (layoutSpec) {
      console.log('📐 Using structured layoutSpec:', layoutSpec.layoutType);
      return applyStructuredLayout(store, textFields, imageFieldsDetected, layoutSpec, sampleData, widthMm, heightMm, projectImages);
    }
    
    // Fallback: use intelligent defaults if no layoutSpec
    console.log('📐 No layoutSpec - using intelligent fallback');
    return applyFallbackLayout(store, textFields, imageFieldsDetected, sampleData, widthMm, heightMm, projectImages);
    
  } catch (error) {
    console.error('❌ Layout generation error:', error);
    return applyFallbackLayout(store, textFields, imageFieldsDetected, sampleData, widthMm, heightMm, projectImages);
  }
}

/**
 * Apply structured layout from AI's layoutSpec
 */
function applyStructuredLayout(
  store: any,
  textFields: string[],
  imageFields: string[],
  layoutSpec: LayoutSpec,
  sampleData: Record<string, string>,
  widthMm: number,
  heightMm: number,
  projectImages: { name: string; url: string }[]
): string | null {
  const page = store.activePage;
  if (!page) {
    console.warn('⚠️ No active page available for layout');
    return null;
  }

  const hasImages = imageFields.length > 0 && layoutSpec.imageArea;
  
  // Calculate text area bounds from layoutSpec
  const textAreaX = widthMm * layoutSpec.textArea.xPercent;
  const textAreaY = heightMm * layoutSpec.textArea.yPercent;
  const textAreaWidth = widthMm * layoutSpec.textArea.widthPercent;
  const textAreaHeight = heightMm * layoutSpec.textArea.heightPercent;
  
  console.log('📐 Text area:', { x: textAreaX, y: textAreaY, w: textAreaWidth, h: textAreaHeight });

  // Step 1: Create text elements in text area
  if (textFields.length > 0) {
    const fieldCount = textFields.length;
    const gapMm = Math.min(2, textAreaHeight * 0.03); // 3% gap, max 2mm
    const fieldHeight = (textAreaHeight - (fieldCount - 1) * gapMm) / fieldCount;
    
    // Calculate optimal font size based on field height and label size
    // Use larger fonts for bigger labels
    const baseFontPt = Math.max(14, Math.min(fieldHeight * 2.5, 36)); // Scale with field height
    
    textFields.forEach((field, index) => {
      const fieldY = textAreaY + index * (fieldHeight + gapMm);
      
      // Create VDP placeholder text
      const textContent = `{{${field}}}`;
      
      page.addElement({
        type: 'text',
        x: mmToPixels(textAreaX),
        y: mmToPixels(fieldY),
        width: mmToPixels(textAreaWidth),
        height: mmToPixels(fieldHeight),
        text: textContent,
        fontSize: ptToPx(baseFontPt),
        fontFamily: 'Roboto',
        fontWeight: index === 0 ? 'bold' : 'normal', // First field bold
        align: 'left',
        verticalAlign: 'middle',
        custom: {
          variable: field,
          templateElementId: crypto.randomUUID(), // Stable ID for z-order preservation
        },
      });
      
      console.log(`✅ Text element: ${field} at (${textAreaX.toFixed(1)}, ${fieldY.toFixed(1)}mm) h=${fieldHeight.toFixed(1)}mm font=${baseFontPt}pt`);
    });
  }

  // Step 2: Create image elements in image area (if present)
  if (hasImages && layoutSpec.imageArea) {
    const imageAreaX = widthMm * layoutSpec.imageArea.xPercent;
    const imageAreaY = heightMm * layoutSpec.imageArea.yPercent;
    const imageAreaWidth = widthMm * layoutSpec.imageArea.widthPercent;
    const imageAreaHeight = heightMm * layoutSpec.imageArea.heightPercent;
    
    console.log('📐 Image area:', { x: imageAreaX, y: imageAreaY, w: imageAreaWidth, h: imageAreaHeight });

    imageFields.forEach((imageField, index) => {
      // Use aspect ratio from layoutSpec or infer from field name
      const imageConfig = layoutSpec.images?.find(i => i.fieldName === imageField);
      const aspectRatio = imageConfig?.aspectRatio || inferImageAspectRatio(imageField);
      
      // Calculate image dimensions preserving aspect ratio
      const imgDims = calculateImageDimensions(aspectRatio, imageAreaWidth, imageAreaHeight);
      
      // Center image within its area
      const imageX = imageAreaX + (imageAreaWidth - imgDims.width) / 2;
      const imageY = imageAreaY + (imageAreaHeight - imgDims.height) / 2;
      
      // Find matching project image
      const sampleValue = sampleData[imageField];
      let imageSrc = '';
      
      if (sampleValue) {
        const matchedUrl = findImageUrl(sampleValue, projectImages);
        if (matchedUrl) {
          imageSrc = matchedUrl;
          console.log(`✅ Image matched: "${sampleValue}" -> ${matchedUrl.substring(0, 50)}...`);
        } else if (sampleValue.startsWith('http') || sampleValue.startsWith('data:')) {
          imageSrc = sampleValue;
        }
      }
      
      // Stack multiple images vertically if needed
      const stackOffset = index * (imgDims.height + 2);
      
      page.addElement({
        type: 'image',
        x: mmToPixels(imageX),
        y: mmToPixels(imageY + stackOffset),
        width: mmToPixels(imgDims.width),
        height: mmToPixels(imgDims.height),
        src: imageSrc,
        custom: {
          variable: imageField,
          templateElementId: crypto.randomUUID(), // Stable ID for z-order preservation
        },
      });
      
      console.log(`✅ Image element: ${imageField} at (${imageX.toFixed(1)}, ${(imageY + stackOffset).toFixed(1)}mm) ${imgDims.width.toFixed(1)}×${imgDims.height.toFixed(1)}mm (${aspectRatio.width}:${aspectRatio.height})`);
    });
  }

  // Wait for MobX to propagate element additions
  return finalizeLayout(store, page);
}

/**
 * Fallback layout when AI doesn't provide a structured layoutSpec
 * Still produces a professional, non-overlapping layout
 */
function applyFallbackLayout(
  store: any,
  textFields: string[],
  imageFields: string[],
  sampleData: Record<string, string>,
  widthMm: number,
  heightMm: number,
  projectImages: { name: string; url: string }[]
): string | null {
  const page = store.activePage;
  if (!page) {
    console.warn('⚠️ No active page available for fallback layout');
    return null;
  }

  const hasImages = imageFields.length > 0;
  const marginPercent = 0.05;
  const marginMm = Math.max(widthMm * marginPercent, 3);
  
  // Professional split: 65% for text, 30% for image, 5% gap
  const textWidthPercent = hasImages ? 0.60 : 0.90;
  const imageWidthPercent = 0.28;
  const gapPercent = 0.02;
  
  const textAreaX = marginMm;
  const textAreaY = marginMm;
  const textAreaWidth = (widthMm - 2 * marginMm) * textWidthPercent;
  const textAreaHeight = heightMm - 2 * marginMm;
  
  console.log('📐 Fallback layout - Text area:', { x: textAreaX, y: textAreaY, w: textAreaWidth, h: textAreaHeight });

  // Create text elements
  if (textFields.length > 0) {
    const fieldCount = textFields.length;
    const gapMm = Math.min(2, textAreaHeight * 0.03);
    const fieldHeight = (textAreaHeight - (fieldCount - 1) * gapMm) / fieldCount;
    const baseFontPt = Math.max(14, Math.min(fieldHeight * 2.5, 36));
    
    textFields.forEach((field, index) => {
      const fieldY = textAreaY + index * (fieldHeight + gapMm);
      
      page.addElement({
        type: 'text',
        x: mmToPixels(textAreaX),
        y: mmToPixels(fieldY),
        width: mmToPixels(textAreaWidth),
        height: mmToPixels(fieldHeight),
        text: `{{${field}}}`,
        fontSize: ptToPx(baseFontPt),
        fontFamily: 'Roboto',
        fontWeight: index === 0 ? 'bold' : 'normal',
        align: 'left',
        verticalAlign: 'middle',
        custom: {
          variable: field,
          templateElementId: crypto.randomUUID(),
        },
      });
      
      console.log(`✅ Fallback text: ${field} at (${textAreaX.toFixed(1)}, ${fieldY.toFixed(1)}mm)`);
    });
  }

  // Create image elements on the right side
  if (hasImages) {
    const imageAreaX = marginMm + (widthMm - 2 * marginMm) * (textWidthPercent + gapPercent);
    const imageAreaWidth = (widthMm - 2 * marginMm) * imageWidthPercent;
    const imageAreaHeight = textAreaHeight * 0.80;
    const imageAreaY = marginMm + (textAreaHeight - imageAreaHeight) / 2;
    
    console.log('📐 Fallback layout - Image area:', { x: imageAreaX, y: imageAreaY, w: imageAreaWidth, h: imageAreaHeight });

    imageFields.forEach((imageField, index) => {
      const aspectRatio = inferImageAspectRatio(imageField);
      const imgDims = calculateImageDimensions(aspectRatio, imageAreaWidth, imageAreaHeight);
      
      const imageX = imageAreaX + (imageAreaWidth - imgDims.width) / 2;
      const imageY = imageAreaY + (imageAreaHeight - imgDims.height) / 2;
      
      const sampleValue = sampleData[imageField];
      let imageSrc = '';
      
      if (sampleValue) {
        const matchedUrl = findImageUrl(sampleValue, projectImages);
        if (matchedUrl) {
          imageSrc = matchedUrl;
        } else if (sampleValue.startsWith('http') || sampleValue.startsWith('data:')) {
          imageSrc = sampleValue;
        }
      }
      
      const stackOffset = index * (imgDims.height + 2);
      
      page.addElement({
        type: 'image',
        x: mmToPixels(imageX),
        y: mmToPixels(imageY + stackOffset),
        width: mmToPixels(imgDims.width),
        height: mmToPixels(imgDims.height),
        src: imageSrc,
        custom: {
          variable: imageField,
          templateElementId: crypto.randomUUID(),
        },
      });
      
      console.log(`✅ Fallback image: ${imageField} (${aspectRatio.width}:${aspectRatio.height}) at (${imageX.toFixed(1)}, ${(imageY + stackOffset).toFixed(1)}mm)`);
    });
  }

  return finalizeLayout(store, page);
}

/**
 * Finalize layout by waiting for MobX and saving scene
 */
function finalizeLayout(store: any, page: any): string | null {
  // Synchronous check
  const childCount = page.children?.length || 0;
  console.log(`📊 Page has ${childCount} elements after layout`);
  
  if (childCount === 0) {
    console.warn('⚠️ No elements in page after layout');
    return null;
  }
  
  // Save and return the base scene
  const baseScene = saveScene(store);
  
  try {
    const parsed = JSON.parse(baseScene);
    const sceneChildCount = parsed.pages?.[0]?.children?.length || 0;
    console.log(`💾 Saved scene has ${sceneChildCount} elements`);
    
    if (sceneChildCount === 0) {
      console.error('❌ Scene serialized with 0 elements!');
      return null;
    }
  } catch (parseError) {
    console.error('❌ Failed to parse saved scene:', parseError);
    return null;
  }
  
  return baseScene;
}

// Bootstrap stages for debugging
type BootstrapStage = 'waiting_for_mount' | 'fetch_key' | 'load_modules' | 'create_store' | 'render_ui' | 'ready' | 'error';

const STAGE_LABELS: Record<BootstrapStage, string> = {
  waiting_for_mount: 'Waiting for editor mount...',
  fetch_key: 'Fetching API key...',
  load_modules: 'Loading editor modules...',
  create_store: 'Creating editor store...',
  render_ui: 'Rendering editor UI...',
  ready: 'Ready',
  error: 'Error',
};

export function PolotnoEditorWrapper({
  availableFields = [],
  allSampleData = [],
  initialScene,
  onSave,
  onSceneChange,
  onReady,
  onRecordNavigationChange,
  labelWidth = 100,
  labelHeight = 50,
  bleedMm = 0,
  projectType = 'label',
  projectImages = [],
}: PolotnoEditorWrapperProps) {
  // ============================================================================
  // PHASE 0: Always render mount div - use callback ref to detect when it exists
  // ============================================================================
  const [mountEl, setMountEl] = useState<HTMLDivElement | null>(null);
  
  const storeRef = useRef<any>(null);
  const rootRef = useRef<Root | null>(null);
  
  // Phase control refs
  const bootstrapInFlightRef = useRef(false);
  const layoutGeneratedRef = useRef(false);
  const layoutInFlightRef = useRef(false);
  
  const [bootstrapStage, setBootstrapStage] = useState<BootstrapStage>('waiting_for_mount');
  const [error, setError] = useState<string | null>(null);
  const [currentRecordIndex, setCurrentRecordIndex] = useState(0);
  const [layoutStatus, setLayoutStatus] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  
  const lastSavedSceneRef = useRef<string>('');
  // Base template scene (without VDP resolution) - used for preview switching
  const baseSceneRef = useRef<string>('');
  const handleRef = useRef<PolotnoEditorHandle | null>(null);

  // ============================================================================
  // Regenerate Layout Function (for Phase 5)
  // ============================================================================
  const regenerateLayout = useCallback(async () => {
    const store = storeRef.current;
    if (!store || availableFields.length === 0 || allSampleData.length === 0) return;
    
    setLayoutStatus('Regenerating layout...');
    console.log('🔄 Regenerating AI layout...');
    
    try {
      // Clear current elements
      const page = store.activePage;
      if (page) {
        // Remove all children
        while (page.children?.length > 0) {
          page.children[0].remove();
        }
      }
      
      const firstRecord = allSampleData[0] || {};
      
      const generatedScene = await generateInitialLayoutPolotno(
        store,
        availableFields,
        firstRecord,
        allSampleData,
        labelWidth,
        labelHeight,
        projectType,
        projectImages
      );
      
      if (generatedScene) {
        baseSceneRef.current = generatedScene;
        lastSavedSceneRef.current = generatedScene;
        
        // Apply VDP resolution
        const parsed = JSON.parse(generatedScene) as PolotnoScene;
        const resolved = resolveVdpVariables(parsed, {
          record: firstRecord,
          recordIndex: 0,
          projectImages,
          useCachedImages: true,
        });
        store.loadJSON(resolved);
        
        console.log('✅ Layout regenerated successfully');
      }
    } catch (err) {
      console.error('❌ Layout regeneration failed:', err);
    } finally {
      setLayoutStatus(null);
    }
  }, [availableFields, allSampleData, labelWidth, labelHeight, projectType, projectImages]);

  // ============================================================================
  // PHASE 1: Bootstrap only when mount element is available (via callback ref)
  // ============================================================================
  useEffect(() => {
    // Guard: Need mount element
    if (!mountEl) {
      console.log('⏳ Waiting for mount element...');
      return;
    }
    
    // Guard: Already bootstrapping or bootstrapped
    if (bootstrapInFlightRef.current) {
      console.log('⏳ Bootstrap already in flight, skipping');
      return;
    }
    
    // Guard: Already ready (unless retrying)
    if (bootstrapStage === 'ready' && handleRef.current) {
      console.log('✅ Already ready, skipping bootstrap');
      return;
    }
    
    let cancelled = false;
    let changeInterval: ReturnType<typeof setInterval> | null = null;
    
    const bootstrap = async () => {
      bootstrapInFlightRef.current = true;
      console.log('🚀 Bootstrap starting with mount element available');
      
      try {
        // ---- FETCH KEY ----
        setBootstrapStage('fetch_key');
        
        const keyResponse = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-polotno-key`
        );
        
        if (cancelled) return;
        
        if (!keyResponse.ok) {
          throw new Error(`Failed to fetch Polotno API key (status: ${keyResponse.status})`);
        }
        
        const { apiKey, error: keyError } = await keyResponse.json();
        
        if (keyError || !apiKey) {
          throw new Error(keyError || 'Polotno API key not configured');
        }

        if (cancelled) return;
        
        // ---- LOAD MODULES ----
        setBootstrapStage('load_modules');
        await loadPolotnoModules();
        
        if (cancelled) return;
        
        // ---- CREATE STORE ----
        setBootstrapStage('create_store');
        
        const store = await createPolotnoStore({
          apiKey,
          unit: 'mm',
          dpi: 300,
          width: mmToPixels(labelWidth),
          height: mmToPixels(labelHeight),
        });

        if (cancelled) return;

        // Configure bleed
        configureBleed(store, mmToPixels(bleedMm));
        storeRef.current = store;
        console.log('✅ Polotno store created');
        
        // ---- RENDER UI ----
        setBootstrapStage('render_ui');
        
        // Double-check mount element still exists
        if (!mountEl) {
          throw new Error('Mount element disappeared before UI render');
        }
        
        const {
          PolotnoContainer,
          SidePanelWrap,
          WorkspaceWrap,
          Toolbar,
          PagesTimeline,
          ZoomButtons,
          SidePanel,
          Workspace,
        } = getPolotnoComponents();

        // Build custom sections with our VDP panels
        const customSections = [
          createVdpFieldsSection(VdpFieldsPanel, { store, availableFields, projectImages }),
          createBarcodesSection(BarcodePanel, { store, availableFields }),
          createProjectImagesSection(ProjectImagesPanel, { store, projectImages }),
          createSequenceSection(SequencePanel, { store }),
        ];
        
        const sections = buildCustomSections(customSections);

        // Cleanup previous root if exists
        if (rootRef.current) {
          try {
            rootRef.current.unmount();
          } catch (e) {
            console.warn('Previous root unmount failed:', e);
          }
          rootRef.current = null;
        }

        rootRef.current = createRoot(mountEl);
        rootRef.current.render(
          createElement(
            PolotnoContainer,
            { style: { width: '100%', height: '100%' } },
            createElement(
              SidePanelWrap,
              null,
              createElement(SidePanel, { store, sections })
            ),
            createElement(
              WorkspaceWrap,
              null,
              createElement(Toolbar, { store }),
              createElement(Workspace, { store, backgroundColor: '#f0f0f0' }),
              createElement(ZoomButtons, { store }),
              createElement(PagesTimeline, { store })
            )
          )
        );
        
        console.log('✅ Polotno UI render() called');
        
        // ---- VERIFY UI MOUNTED ----
        await new Promise<void>((resolve, reject) => {
          requestAnimationFrame(() => {
            setTimeout(() => {
              if (cancelled) {
                resolve();
                return;
              }
              
              const childCount = mountEl?.childElementCount || 0;
              console.log(`🔍 DOM verification: mount has ${childCount} child elements`);
              
              if (childCount === 0) {
                reject(new Error('Polotno rendered 0 DOM nodes - render failed silently'));
                return;
              }
              
              // Close the sidebar after UI mounts
              store.openSidePanel('');
              console.log('✅ Polotno UI verified with', childCount, 'DOM nodes');
              resolve();
            }, 150);
          });
        });
        
        if (cancelled) return;

        // ---- CREATE HANDLE ----
        const handle: PolotnoEditorHandle = {
          saveScene: async () => {
            // Get current store state (has resolved data + user layout changes)
            const currentSceneJson = saveScene(store);
            const currentScene = JSON.parse(currentSceneJson) as PolotnoScene;
            
            // Get the original base template (with placeholders)
            const baseScene = baseSceneRef.current 
              ? JSON.parse(baseSceneRef.current) as PolotnoScene
              : currentScene;
            
            // Merge layout changes back to base template (preserves placeholders)
            const mergedTemplate = mergeLayoutToBase(currentScene, baseScene);
            const mergedJson = JSON.stringify(mergedTemplate);
            
            // Update refs with the merged template
            baseSceneRef.current = mergedJson;
            lastSavedSceneRef.current = mergedJson;
            
            onSave?.(mergedJson);
            return mergedJson;
          },
          exportPdf: async (options?: PrintExportOptions) => {
            const {
              includeBleed = true,
              includeCropMarks = false,
              cropMarkSizeMm = 3,
              pixelRatio = 2,
              fileName = 'output.pdf',
            } = options || {};

            return exportToPdf(store, {
              includeBleed,
              cropMarkSize: includeCropMarks ? cropMarkMmToPixels(cropMarkSizeMm) : 0,
              pixelRatio,
              fileName,
            });
          },
          exportResolvedPdf: async (scene: PolotnoScene, options?: PrintExportOptions) => {
            const currentScene = saveScene(store);
            await store.loadJSON(scene);
            
            const {
              includeBleed = true,
              includeCropMarks = false,
              cropMarkSizeMm = 3,
              pixelRatio = 2,
              fileName = 'output.pdf',
            } = options || {};

            const blob = await exportToPdf(store, {
              includeBleed,
              cropMarkSize: includeCropMarks ? cropMarkMmToPixels(cropMarkSizeMm) : 0,
              pixelRatio,
              fileName,
            });
            
            await loadScene(store, currentScene);
            return blob;
          },
          getResolvedScene: (record: Record<string, string>, recordIndex: number) => {
            const baseScene = baseSceneRef.current || saveScene(store);
            const parsed = JSON.parse(baseScene) as PolotnoScene;
            return resolveVdpVariables(parsed, { record, recordIndex, projectImages });
          },
          batchResolve: (records: Record<string, string>[]) => {
            const baseScene = baseSceneRef.current || saveScene(store);
            return batchResolveVdp(baseScene, records, undefined, projectImages);
          },
          getBaseScene: () => {
            // Merge current layout changes with base template
            const currentSceneJson = saveScene(store);
            const currentScene = JSON.parse(currentSceneJson) as PolotnoScene;
            const baseScene = baseSceneRef.current 
              ? JSON.parse(baseSceneRef.current) as PolotnoScene
              : currentScene;
            const merged = mergeLayoutToBase(currentScene, baseScene);
            return JSON.stringify(merged);
          },
          regenerateLayout,
          store,
        };

        handleRef.current = handle;
        setBootstrapStage('ready');
        setError(null);
        
        onReady?.(handle);
        console.log('✅ Bootstrap complete - editor ready');

        // Track changes by comparing merged layout against last saved
        changeInterval = setInterval(() => {
          if (!store || !baseSceneRef.current) return;
          
          const currentSceneJson = saveScene(store);
          const currentScene = JSON.parse(currentSceneJson) as PolotnoScene;
          const baseScene = JSON.parse(baseSceneRef.current) as PolotnoScene;
          
          // Merge layout to base and compare with last saved
          const merged = mergeLayoutToBase(currentScene, baseScene);
          const mergedJson = JSON.stringify(merged);
          
          onSceneChange?.(mergedJson !== lastSavedSceneRef.current);
        }, 1000);
        
      } catch (e) {
        console.error('❌ Polotno bootstrap error:', e);
        if (!cancelled) {
          setError(String(e instanceof Error ? e.message : e));
          setBootstrapStage('error');
        }
      } finally {
        bootstrapInFlightRef.current = false;
      }
    };

    bootstrap();

    return () => {
      cancelled = true;
      if (changeInterval) clearInterval(changeInterval);
      // Don't unmount root here - we want it to persist
    };
  }, [mountEl, labelWidth, labelHeight, bleedMm, onSave, onSceneChange, onReady, retryCount, availableFields, projectImages, regenerateLayout]);

  // Cleanup root on component unmount
  useEffect(() => {
    return () => {
      if (rootRef.current) {
        try {
          rootRef.current.unmount();
        } catch (e) {
          console.warn('Root unmount on cleanup failed:', e);
        }
        rootRef.current = null;
      }
    };
  }, []);

  // ============================================================================
  // PHASE B1: Load Initial Scene (when we have an existing template)
  // Runs after bootstrap, when initialScene is provided
  // ============================================================================
  useEffect(() => {
    const store = storeRef.current;
    if (!store || !initialScene || bootstrapStage !== 'ready') return;
    
    // Skip if we already loaded this scene
    if (baseSceneRef.current === initialScene) return;
    
    console.log('📂 Phase B1: Loading existing scene...');
    
    const loadWithPrefetch = async () => {
      try {
        baseSceneRef.current = initialScene;
        lastSavedSceneRef.current = initialScene;
        
        // AWAIT prefetch images before VDP resolution (fixes caching timing)
        if (projectImages.length > 0 && allSampleData.length > 0) {
          console.log('📥 Prefetching project images for VDP...');
          await prefetchImagesForRecords(allSampleData, projectImages);
          console.log('✅ Image prefetch complete');
        }
        
        // If we have sample data, apply VDP resolution for first record
        if (allSampleData.length > 0 && allSampleData[0]) {
          const parsed = JSON.parse(initialScene) as PolotnoScene;
          const resolved = resolveVdpVariables(parsed, {
            record: allSampleData[0],
            recordIndex: 0,
            projectImages,
            useCachedImages: true,
          });
          store.loadJSON(resolved);
          console.log('✅ Loaded scene with VDP resolution for first record');
        } else {
          loadScene(store, initialScene);
          console.log('✅ Loaded scene without VDP resolution');
        }
        
        // Mark layout as "generated" so Phase B2 doesn't run
        layoutGeneratedRef.current = true;
      } catch (err) {
        console.error('❌ Failed to load initial scene:', err);
      }
    };
    
    loadWithPrefetch();
  }, [initialScene, allSampleData, bootstrapStage, projectImages]);

  // ============================================================================
  // PHASE B2: Generate AI Layout (for new templates without initialScene)
  // Runs after bootstrap when we have fields + data but no initial scene
  // ============================================================================
  useEffect(() => {
    const store = storeRef.current;
    
    // Guards: need store and ready state
    if (!store || bootstrapStage !== 'ready') return;
    if (initialScene) return; // Phase B1 handles this
    if (layoutGeneratedRef.current) return;
    if (layoutInFlightRef.current) return;
    if (availableFields.length === 0 || allSampleData.length === 0) return;
    
    const generateLayout = async () => {
      layoutInFlightRef.current = true;
      setLayoutStatus('Generating smart layout...');
      console.log('🎨 Phase B2: Generating AI-assisted layout...');
      
      try {
        const firstRecord = allSampleData[0] || {};
        
        const generatedScene = await generateInitialLayoutPolotno(
          store,
          availableFields,
          firstRecord,
          allSampleData,
          labelWidth,
          labelHeight,
          projectType,
          projectImages
        );
        
        if (generatedScene) {
          baseSceneRef.current = generatedScene;
          lastSavedSceneRef.current = generatedScene;
          
          // Prefetch images if we have project images
          if (projectImages.length > 0) {
            console.log('📥 Prefetching project images for AI layout...');
            await prefetchImagesForRecords(allSampleData, projectImages);
          }
          
          // Apply VDP resolution to show first record's actual values
          try {
            console.log('🔄 Applying VDP resolution to first record...');
            const parsed = JSON.parse(generatedScene) as PolotnoScene;
            const elementCount = parsed.pages?.[0]?.children?.length || 0;
            console.log('📄 Base scene structure:', {
              width: parsed.width,
              height: parsed.height,
              pages: parsed.pages?.length,
              elements: elementCount,
            });
            
            if (elementCount === 0) {
              console.warn('⚠️ Base scene has 0 elements');
              return;
            }
            
            const resolved = resolveVdpVariables(parsed, {
              record: firstRecord,
              recordIndex: 0,
              projectImages,
              useCachedImages: true,
            });
            
            console.log('📄 Resolved scene elements:', resolved.pages?.[0]?.children?.length);
            
            await store.loadJSON(resolved);
            console.log('✅ AI layout applied and VDP resolved for first record');
          } catch (vdpError) {
            console.error('❌ VDP resolution error:', vdpError);
          }
        }
        
        layoutGeneratedRef.current = true;
      } catch (err) {
        console.error('❌ Layout generation failed:', err);
      } finally {
        setLayoutStatus(null);
        layoutInFlightRef.current = false;
      }
    };
    
    generateLayout();
  }, [initialScene, availableFields, allSampleData, labelWidth, labelHeight, projectType, projectImages, bootstrapStage]);

  // ============================================================================
  // Record Navigation
  // ============================================================================
  const goToNext = useCallback(() => {
    if (currentRecordIndex < allSampleData.length - 1) {
      setCurrentRecordIndex((i) => i + 1);
    }
  }, [currentRecordIndex, allSampleData.length]);

  const goToPrev = useCallback(() => {
    if (currentRecordIndex > 0) {
      setCurrentRecordIndex((i) => i - 1);
    }
  }, [currentRecordIndex]);

  // Track previous record index to detect actual changes
  const prevRecordIndexRef = useRef(currentRecordIndex);

  // Apply VDP resolution when record index changes
  // CRITICAL: Merge layout changes BEFORE switching to new record
  useEffect(() => {
    if (!storeRef.current || !baseSceneRef.current || allSampleData.length === 0) return;
    
    const currentRecord = allSampleData[currentRecordIndex];
    if (!currentRecord) return;

    const applyVdpWithLayoutMerge = async () => {
      const store = storeRef.current;
      
      // PHASE 4 FIX: Before loading a new record, merge any layout changes from current view
      // This ensures user edits (including z-order) are captured in the base template before switching
      if (prevRecordIndexRef.current !== currentRecordIndex) {
        try {
          const currentSceneJson = saveScene(store);
          const currentScene = JSON.parse(currentSceneJson) as PolotnoScene;
          const baseScene = JSON.parse(baseSceneRef.current) as PolotnoScene;
          
          // Merge layout changes back to base template (preserves z-order!)
          const mergedTemplate = mergeLayoutToBase(currentScene, baseScene);
          baseSceneRef.current = JSON.stringify(mergedTemplate);
          
          console.log('📐 Layout merged to base template before record switch (z-order preserved)');
        } catch (mergeErr) {
          console.warn('Layout merge error:', mergeErr);
        }
        prevRecordIndexRef.current = currentRecordIndex;
      }

      // AWAIT cache warming for adjacent records (fixes caching timing)
      if (projectImages.length > 0) {
        await warmCacheForAdjacentRecords(currentRecordIndex, allSampleData, projectImages);
      }

      try {
        // Now resolve VDP using the updated base template (with merged layout)
        const baseScene = JSON.parse(baseSceneRef.current) as PolotnoScene;
        const resolved = resolveVdpVariables(baseScene, {
          record: currentRecord,
          recordIndex: currentRecordIndex,
          projectImages,
          useCachedImages: true,
        });
        store.loadJSON(resolved);
        console.log(`✅ VDP resolved for record ${currentRecordIndex + 1}:`, Object.keys(currentRecord).slice(0, 3).join(', '));
      } catch (err) {
        console.warn('VDP resolution error:', err);
      }
    };
    
    applyVdpWithLayoutMerge();
  }, [currentRecordIndex, allSampleData, projectImages]);

  useEffect(() => {
    if (onRecordNavigationChange && allSampleData.length > 0) {
      onRecordNavigationChange({
        currentIndex: currentRecordIndex,
        totalRecords: allSampleData.length,
        goToNext,
        goToPrevious: goToPrev,
      });
    }
  }, [currentRecordIndex, allSampleData.length, goToNext, goToPrev, onRecordNavigationChange]);

  // ============================================================================
  // Retry handler
  // ============================================================================
  const handleRetry = useCallback(() => {
    // Reset state for retry
    setError(null);
    setBootstrapStage('waiting_for_mount');
    bootstrapInFlightRef.current = false;
    
    // Cleanup old root
    if (rootRef.current) {
      try {
        rootRef.current.unmount();
      } catch (e) {
        console.warn('Retry cleanup failed:', e);
      }
      rootRef.current = null;
    }
    storeRef.current = null;
    handleRef.current = null;
    
    // Increment retry count to trigger useEffect
    setRetryCount(c => c + 1);
  }, []);

  // ============================================================================
  // Render - ALWAYS render mount div, with overlays on top
  // ============================================================================
  const isLoading = bootstrapStage !== 'ready' && bootstrapStage !== 'error';
  
  return (
    <div className="relative h-full w-full">
      {/* ALWAYS PRESENT: The mount point for Polotno UI */}
      <div 
        ref={setMountEl} 
        className="h-full w-full"
        style={{ visibility: isLoading || error ? 'hidden' : 'visible' }}
      />
      
      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">
            {STAGE_LABELS[bootstrapStage]}
          </p>
          <p className="text-xs text-muted-foreground/60">Stage: {bootstrapStage}</p>
        </div>
      )}
      
      {/* Error overlay */}
      {error && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background">
          <p className="text-sm font-medium text-destructive">Editor Error</p>
          <p className="text-sm text-muted-foreground max-w-md text-center">{error}</p>
          <p className="text-xs text-muted-foreground/60">Stage: {bootstrapStage}</p>
          <Button variant="outline" size="sm" onClick={handleRetry} className="mt-2">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      )}
      
      {/* Layout generation overlay (non-blocking, shown after bootstrap) */}
      {bootstrapStage === 'ready' && layoutStatus && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex items-center gap-2 bg-card rounded-lg border shadow-lg px-4 py-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">{layoutStatus}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default PolotnoEditorWrapper;
