/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState, useCallback, createElement } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { Loader2, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
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

// VDP variable resolution with image matching and caching
import { 
  resolveVdpVariables, 
  batchResolveVdp, 
  prefetchImagesForRecords,
  warmCacheForAdjacentRecords,
  findImageUrl,
  normalizeForMatch,
} from '@/lib/polotno/vdpResolver';
import type { PolotnoScene } from '@/lib/polotno/types';

// Supabase client for edge function calls
import { supabase } from '@/integrations/supabase/client';

// Layout engine
import { executeLayout, DEFAULT_LAYOUT_CONFIG } from '@/lib/layout-engine';

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
 * AI-assisted layout generation for Polotno
 * Calls the generate-layout edge function and executes the layout engine
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

  console.log('🎨 AUTO-TRIGGERING HYBRID AI LAYOUT FOR NEW POLOTNO DESIGN');

  // Detect image fields using value-based detection
  const sampleRows = allSampleData.length > 0 ? allSampleData : [sampleData];
  const imageFieldsDetected = detectImageColumnsFromValues(fields, sampleRows);
  console.log('🖼️ Detected image fields:', imageFieldsDetected);
  
  // Filter out image fields from layout generation - they will be handled separately
  const textFields = fields.filter(f => !imageFieldsDetected.includes(f));

  try {
    // Step 1: Call hybrid layout generator
    const { data: hybridData, error: hybridError } = await supabase.functions.invoke('generate-layout', {
      body: {
        fieldNames: textFields.length > 0 ? textFields : fields,
        sampleData: [sampleData],
        templateSize: { width: widthMm, height: heightMm },
        templateType: templateType || 'address_label',
      },
    });

    if (hybridError) {
      console.warn('⚠️ Hybrid layout API error:', hybridError);
      return null;
    }

    if (!hybridData?.designStrategy) {
      console.warn('⚠️ No design strategy returned from hybrid layout');
      return null;
    }

    console.log('📐 Hybrid design strategy received:', hybridData.designStrategy.strategy);

    // Step 2: Execute layout using the deterministic layout engine
    // Use CE.SDK-style positioning: 80% width centered with 10% margins, 94% height
    const layoutConfig = {
      ...DEFAULT_LAYOUT_CONFIG,
      templateSize: { width: widthMm, height: heightMm },
      // CE.SDK-style margins: 10% horizontal, 3% top
      margins: { 
        top: heightMm * 0.03, 
        bottom: heightMm * 0.03, 
        left: widthMm * 0.10, 
        right: widthMm * 0.10 
      },
    };

    const layoutResult = executeLayout(hybridData.designStrategy, layoutConfig, sampleData);
    console.log('📏 Layout engine result:', layoutResult.fields.length, 'fields');

    // Get the active page
    const page = store.activePage;
    if (!page) {
      console.warn('⚠️ No active page available for layout');
      return null;
    }

    // Step 3: Create text elements from layout result with CE.SDK-style positioning
    // Calculate text area (reserve space for images at bottom if we have image fields)
    const hasImages = imageFieldsDetected.length > 0;
    const textAreaHeight = hasImages ? heightMm * 0.65 : heightMm * 0.94;
    const textStartY = heightMm * 0.03;
    const textWidth = widthMm * 0.80;
    const textStartX = widthMm * 0.10;
    
    for (const field of layoutResult.fields) {
      try {
        // Handle combined address blocks (fieldType: 'address_block')
        let textContent: string;

        if (field.fieldType === 'address_block' && field.combinedFields && field.combinedFields.length > 0) {
          // Combined address block: use {{field}} syntax joined by actual newlines
          textContent = field.combinedFields.map(f => `{{${f}}}`).join('\n');
          console.log('📦 Creating combined address block with fields:', field.combinedFields);
        } else {
          // Individual field - use {{fieldName}} placeholder syntax
          textContent = `{{${field.templateField}}}`;
        }

        // CE.SDK-style: Use proportional positioning within text area
        // Scale field position relative to available text area
        const fieldXRatio = (field.x - (DEFAULT_LAYOUT_CONFIG.margins?.left || 0)) / 
          (widthMm - (DEFAULT_LAYOUT_CONFIG.margins?.left || 0) - (DEFAULT_LAYOUT_CONFIG.margins?.right || 0));
        const fieldYRatio = (field.y - (DEFAULT_LAYOUT_CONFIG.margins?.top || 0)) / 
          (heightMm - (DEFAULT_LAYOUT_CONFIG.margins?.top || 0) - (DEFAULT_LAYOUT_CONFIG.margins?.bottom || 0));
        
        const adjustedX = textStartX + (fieldXRatio * textWidth);
        const adjustedY = textStartY + (fieldYRatio * textAreaHeight);
        const adjustedWidth = Math.min(field.width, textWidth);
        const adjustedHeight = Math.min(field.height, textAreaHeight * 0.3);

        // Convert pt to px for fontSize (layout engine returns pt)
        // CE.SDK-style: Scale font to fill allocated space
        const baseFontSizePx = ptToPx(field.fontSize || 12);
        // Calculate scale factor based on allocated vs original height
        const heightScaleFactor = adjustedHeight / field.height;
        const scaledFontSizePx = Math.min(Math.max(baseFontSizePx * heightScaleFactor, 8), 72);

        // Add text element to the page
        page.addElement({
          type: 'text',
          x: mmToPixels(adjustedX),
          y: mmToPixels(adjustedY),
          width: mmToPixels(adjustedWidth),
          height: mmToPixels(adjustedHeight),
          text: textContent,
          fontSize: scaledFontSizePx,
          fontFamily: 'Roboto',
          fontWeight: field.fontWeight === 'bold' ? 'bold' : 'normal',
          align: field.textAlign || 'left',
          verticalAlign: 'middle', // CE.SDK-style vertical centering
          custom: {
            variable: field.templateField,
            combinedFields: field.combinedFields,
            fieldType: field.fieldType,
            autoFit: field.autoFit,
          },
        });

        console.log(`✅ Created Polotno text element: ${field.templateField} (fontSize: ${scaledFontSizePx.toFixed(1)}px)`);
      } catch (blockError) {
        console.error(`❌ Failed to create element for ${field.templateField}:`, blockError);
      }
    }

    // Verify element creation
    console.log(`📊 Page now has ${page.children?.length || 0} elements after text layout`);

    // Step 4: Create VDP image elements for detected image fields
    // CE.SDK-style: Position images at bottom center with proper sizing
    if (imageFieldsDetected.length > 0) {
      console.log('🖼️ Creating VDP image elements for:', imageFieldsDetected);
      
      // CE.SDK-style image sizing: Math.min(widthMm * 0.3, heightMm * 0.35, 25)
      const imageSize = Math.min(widthMm * 0.3, heightMm * 0.35, 25);
      const imageMargin = 3; // mm margin from edges
      const imageY = heightMm - imageSize - imageMargin;
      
      // Center images horizontally (if multiple, distribute them)
      const totalImageWidth = imageFieldsDetected.length * imageSize + 
        (imageFieldsDetected.length - 1) * imageMargin;
      const startX = (widthMm - totalImageWidth) / 2;
      
      imageFieldsDetected.forEach((imageField, index) => {
        // Find matching project image using improved matching
        const sampleValue = sampleData[imageField];
        let imageSrc = '';
        
        if (sampleValue) {
          // Use the same matching logic as VDP resolver
          const matchedUrl = findImageUrl(sampleValue, projectImages);
          if (matchedUrl) {
            imageSrc = matchedUrl;
            console.log(`✅ Smart layout image matched: "${sampleValue}" -> ${matchedUrl.substring(0, 50)}...`);
          } else if (sampleValue.startsWith('http') || sampleValue.startsWith('data:')) {
            imageSrc = sampleValue;
          } else {
            console.warn(`⚠️ Smart layout image not matched: "${sampleValue}" (will use placeholder)`);
            imageSrc = '';
          }
        }
        
        const imageX = startX + index * (imageSize + imageMargin);
        
        page.addElement({
          type: 'image',
          x: mmToPixels(imageX),
          y: mmToPixels(imageY),
          width: mmToPixels(imageSize),
          height: mmToPixels(imageSize),
          src: imageSrc,
          custom: {
            variable: imageField,
          },
        });
        
        console.log(`✅ Created Polotno VDP image element: ${imageField} at (${imageX.toFixed(1)}, ${imageY.toFixed(1)})`);
      });
    }
    
    // Wait for MobX to propagate element additions before serializing
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Verify elements exist before saving
    const childCount = page.children?.length || 0;
    console.log(`📊 Page has ${childCount} elements after MobX sync`);
    
    if (childCount === 0) {
      console.warn('⚠️ No elements in page after layout - something went wrong');
      return null;
    }
    
    // Save the base scene (with placeholders) and return it
    const baseScene = saveScene(store);
    
    // Verify the scene contains elements
    try {
      const parsed = JSON.parse(baseScene);
      const sceneChildCount = parsed.pages?.[0]?.children?.length || 0;
      console.log(`💾 Saved scene has ${sceneChildCount} elements (expected ${childCount})`);
      
      if (sceneChildCount === 0) {
        console.error('❌ Scene serialized with 0 elements despite page having elements!');
        return null;
      }
    } catch (parseError) {
      console.error('❌ Failed to parse saved scene:', parseError);
      return null;
    }
    
    return baseScene;
  } catch (error) {
    console.error('❌ Layout generation error:', error);
    return null;
  }
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
            const json = saveScene(store);
            baseSceneRef.current = json;
            onSave?.(json);
            lastSavedSceneRef.current = json;
            return json;
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
            return baseSceneRef.current || saveScene(store);
          },
          store,
        };

        handleRef.current = handle;
        setBootstrapStage('ready');
        setError(null);
        
        onReady?.(handle);
        console.log('✅ Bootstrap complete - editor ready');

        // Track changes
        changeInterval = setInterval(() => {
          if (!store) return;
          const current = saveScene(store);
          onSceneChange?.(current !== lastSavedSceneRef.current);
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
  }, [mountEl, labelWidth, labelHeight, bleedMm, onSave, onSceneChange, onReady, retryCount, availableFields, projectImages]);

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
              console.warn('⚠️ Base scene has 0 elements - elements should already be in the store from addElement calls');
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
            console.log('ℹ️ Keeping elements as-is without VDP resolution');
          }
        } else {
          console.log('⚠️ No layout generated (empty or failed) - elements may already be visible from addElement calls');
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

  // Apply VDP resolution when record index changes
  useEffect(() => {
    if (!storeRef.current || !baseSceneRef.current || allSampleData.length === 0) return;
    
    const currentRecord = allSampleData[currentRecordIndex];
    if (!currentRecord) return;

    const applyVdpWithCache = async () => {
      // AWAIT cache warming for adjacent records (fixes caching timing)
      if (projectImages.length > 0) {
        await warmCacheForAdjacentRecords(currentRecordIndex, allSampleData, projectImages);
      }

      try {
        const baseScene = JSON.parse(baseSceneRef.current) as PolotnoScene;
        const resolved = resolveVdpVariables(baseScene, {
          record: currentRecord,
          recordIndex: currentRecordIndex,
          projectImages,
          useCachedImages: true,
        });
        storeRef.current.loadJSON(resolved);
      } catch (err) {
        console.warn('VDP resolution error:', err);
      }
    };
    
    applyVdpWithCache();
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
      
      {/* Record navigation (shown after bootstrap with multiple records) */}
      {bootstrapStage === 'ready' && allSampleData.length > 1 && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-card/95 backdrop-blur-sm rounded-lg border shadow-sm px-3 py-1.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={goToPrev}
            disabled={currentRecordIndex === 0}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs font-medium tabular-nums">
            Record {currentRecordIndex + 1} / {allSampleData.length}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={goToNext}
            disabled={currentRecordIndex === allSampleData.length - 1}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

export default PolotnoEditorWrapper;
