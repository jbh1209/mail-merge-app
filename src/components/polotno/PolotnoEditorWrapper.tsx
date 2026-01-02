/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState, useCallback, createElement } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
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

// VDP variable resolution
import { resolveVdpVariables, batchResolveVdp } from '@/lib/polotno/vdpResolver';
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
    const layoutConfig = {
      ...DEFAULT_LAYOUT_CONFIG,
      templateSize: { width: widthMm, height: heightMm },
    };

    const layoutResult = executeLayout(hybridData.designStrategy, layoutConfig, sampleData);
    console.log('📏 Layout engine result:', layoutResult.fields.length, 'fields');

    // Get the active page
    const page = store.activePage;
    if (!page) {
      console.warn('⚠️ No active page available for layout');
      return null;
    }

    // Step 3: Create text elements from layout result
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

        // Convert pt to px for fontSize (layout engine returns pt)
        const fontSizePx = ptToPx(field.fontSize || 12);

        // Add text element to the page
        page.addElement({
          type: 'text',
          x: mmToPixels(field.x),
          y: mmToPixels(field.y),
          width: mmToPixels(field.width),
          height: mmToPixels(field.height),
          text: textContent,
          fontSize: fontSizePx,
          fontFamily: 'Roboto',
          fontWeight: field.fontWeight === 'bold' ? 'bold' : 'normal',
          align: field.textAlign || 'left',
          custom: {
            variable: field.templateField,
            combinedFields: field.combinedFields,
            fieldType: field.fieldType,
            autoFit: field.autoFit,
          },
        });

        console.log(`✅ Created Polotno text element: ${field.templateField} (fontSize: ${fontSizePx}px)`);
      } catch (blockError) {
        console.error(`❌ Failed to create element for ${field.templateField}:`, blockError);
      }
    }

    // Verify element creation
    console.log(`📊 Page now has ${page.children?.length || 0} elements after text layout`);

    // Step 4: Create VDP image elements for detected image fields
    if (imageFieldsDetected.length > 0) {
      console.log('🖼️ Creating VDP image elements for:', imageFieldsDetected);
      
      // Position images in remaining space (e.g., right side or bottom)
      const imageAreaX = widthMm * 0.7; // 70% from left
      const imageAreaWidth = widthMm * 0.25;
      const imageHeight = heightMm * 0.4;
      
      imageFieldsDetected.forEach((imageField, index) => {
        // Find matching project image or use record value
        const sampleValue = sampleData[imageField];
        const matchedImage = projectImages.find(img => 
          img.name === sampleValue || 
          img.url.includes(sampleValue) ||
          sampleValue?.includes(img.name)
        );
        
        // Use matched image URL, or if the sample value is a URL, use it directly
        let imageSrc = matchedImage?.url || '';
        if (!imageSrc && sampleValue && (sampleValue.startsWith('http') || sampleValue.startsWith('/'))) {
          imageSrc = sampleValue;
        }
        
        page.addElement({
          type: 'image',
          x: mmToPixels(imageAreaX),
          y: mmToPixels(heightMm * 0.1 + index * (imageHeight + 2)),
          width: mmToPixels(imageAreaWidth),
          height: mmToPixels(imageHeight),
          src: imageSrc,
          custom: {
            variable: imageField,
          },
        });
        
        console.log(`✅ Created Polotno image element: ${imageField}`);
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
  const containerRef = useRef<HTMLDivElement>(null);
  const storeRef = useRef<any>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<Root | null>(null);
  
  // Phase control refs
  const editorBootstrappedRef = useRef(false);
  const layoutGeneratedRef = useRef(false);
  const layoutInFlightRef = useRef(false);
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentRecordIndex, setCurrentRecordIndex] = useState(0);
  const [layoutStatus, setLayoutStatus] = useState<string | null>(null);
  
  // Bootstrap stage for debugging - shows where we are in the initialization process
  const [bootstrapStage, setBootstrapStage] = useState<string>('init');
  const lastSavedSceneRef = useRef<string>('');
  // Base template scene (without VDP resolution) - used for preview switching
  const baseSceneRef = useRef<string>('');

  // ============================================================================
  // PHASE A: Editor Bootstrap (runs once per mount)
  // Creates store, renders UI, sets isLoading=false
  // Does NOT depend on data props (availableFields, allSampleData, projectImages)
  // ============================================================================
  useEffect(() => {
    let mounted = true;
    let changeInterval: ReturnType<typeof setInterval> | null = null;

    // Skip if already bootstrapped
    if (editorBootstrappedRef.current) {
      console.log('⚠️ Editor already bootstrapped, skipping');
      return;
    }

    const bootstrap = async () => {
      console.log('🚀 Phase A: Bootstrapping Polotno editor...');
      setBootstrapStage('fetch_key');
      
      try {
        // HARD GUARD: Check mount point exists before anything else
        if (!editorRef.current) {
          console.error('❌ Editor mount point (editorRef) is null at bootstrap start');
          setError('Editor mount point not available. Please refresh the page.');
          setBootstrapStage('error');
          setIsLoading(false);
          return;
        }
        
        // Fetch API key from edge function
        const keyResponse = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-polotno-key`
        );
        
        if (!mounted) return;
        
        if (!keyResponse.ok) {
          throw new Error('Failed to fetch Polotno API key');
        }
        
        const { apiKey, error: keyError } = await keyResponse.json();
        
        if (keyError || !apiKey) {
          setError(keyError || 'Polotno API key not configured');
          setBootstrapStage('error');
          setIsLoading(false);
          return;
        }

        if (!mounted) return;
        setBootstrapStage('load_modules');

        // Load Polotno modules via JS bridge
        await loadPolotnoModules();

        if (!mounted) return;
        setBootstrapStage('create_store');

        // Create store via bridge
        const store = await createPolotnoStore({
          apiKey,
          unit: 'mm',
          dpi: 300,
          width: mmToPixels(labelWidth),
          height: mmToPixels(labelHeight),
        });

        if (!mounted) return;

        // Configure bleed
        configureBleed(store, mmToPixels(bleedMm));
        
        storeRef.current = store;
        console.log('✅ Polotno store created');
        
        // HARD GUARD: Re-check mount point before rendering UI
        if (!editorRef.current) {
          console.error('❌ Editor mount point became null before UI render');
          setError('Editor mount point lost. Please refresh the page.');
          setBootstrapStage('error');
          setIsLoading(false);
          return;
        }
        
        setBootstrapStage('render_ui');

        // Render Polotno UI inside try/catch
        try {
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
            rootRef.current.unmount();
          }

          rootRef.current = createRoot(editorRef.current);
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
          
          // Verify DOM was actually populated after React commits
          await new Promise<void>((resolve) => {
            requestAnimationFrame(() => {
              setTimeout(() => {
                if (!mounted) {
                  resolve();
                  return;
                }
                
                const childCount = editorRef.current?.childElementCount || 0;
                console.log(`🔍 DOM verification: editorRef has ${childCount} child elements`);
                
                if (childCount === 0) {
                  console.error('❌ Polotno rendered 0 DOM nodes - React render may have failed silently');
                  setError('Editor rendered empty. This may be a Polotno module issue. Please refresh.');
                  setBootstrapStage('error');
                  setIsLoading(false);
                  resolve();
                  return;
                }
                
                // Close the sidebar after UI mounts
                store.openSidePanel('');
                console.log('✅ Polotno UI verified with', childCount, 'DOM nodes');
                resolve();
              }, 100);
            });
          });
          
          // Check if we had an error during verification
          if (!mounted) return;
          
        } catch (renderError) {
          console.error('❌ Polotno UI render error:', renderError);
          if (mounted) {
            setError('Failed to render editor UI: ' + String(renderError));
            setBootstrapStage('error');
            setIsLoading(false);
          }
          return;
        }

        // Create handle for parent
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
            store.loadJSON(scene);
            
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
            
            loadScene(store, currentScene);
            return blob;
          },
          getResolvedScene: (record: Record<string, string>, recordIndex: number) => {
            const baseScene = baseSceneRef.current || saveScene(store);
            const parsed = JSON.parse(baseScene) as PolotnoScene;
            return resolveVdpVariables(parsed, { record, recordIndex });
          },
          batchResolve: (records: Record<string, string>[]) => {
            const baseScene = baseSceneRef.current || saveScene(store);
            return batchResolveVdp(baseScene, records);
          },
          getBaseScene: () => {
            return baseSceneRef.current || saveScene(store);
          },
          store,
        };

        // Mark bootstrap as complete ONLY after UI is verified
        editorBootstrappedRef.current = true;
        setBootstrapStage('ready');
        
        onReady?.(handle);
        setIsLoading(false);
        console.log('✅ Phase A complete - editor ready');

        // Track changes
        changeInterval = setInterval(() => {
          if (!store) return;
          const current = saveScene(store);
          onSceneChange?.(current !== lastSavedSceneRef.current);
        }, 1000);
      } catch (e) {
        console.error('❌ Polotno bootstrap error:', e);
        if (mounted) {
          setError('Failed to initialize editor: ' + String(e));
          setBootstrapStage('error');
          setIsLoading(false);
        }
      }
    };

    bootstrap();

    return () => {
      mounted = false;
      if (changeInterval) clearInterval(changeInterval);
      if (rootRef.current) {
        rootRef.current.unmount();
        rootRef.current = null;
      }
    };
  }, [labelWidth, labelHeight, bleedMm, onSave, onSceneChange, onReady]);

  // ============================================================================
  // PHASE B1: Load Initial Scene (when we have an existing template)
  // Runs after bootstrap, when initialScene is provided
  // ============================================================================
  useEffect(() => {
    const store = storeRef.current;
    if (!store || !initialScene || !editorBootstrappedRef.current) return;
    
    // Skip if we already loaded this scene
    if (baseSceneRef.current === initialScene) return;
    
    console.log('📂 Phase B1: Loading existing scene...');
    
    try {
      baseSceneRef.current = initialScene;
      lastSavedSceneRef.current = initialScene;
      
      // If we have sample data, apply VDP resolution for first record
      if (allSampleData.length > 0 && allSampleData[0]) {
        const parsed = JSON.parse(initialScene) as PolotnoScene;
        const resolved = resolveVdpVariables(parsed, {
          record: allSampleData[0],
          recordIndex: 0,
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
  }, [initialScene, allSampleData]);

  // ============================================================================
  // PHASE B2: Generate AI Layout (for new templates without initialScene)
  // Runs after bootstrap when we have fields + data but no initial scene
  // ============================================================================
  useEffect(() => {
    const store = storeRef.current;
    
    // Guards: need store, no initial scene, have data, not already generated
    if (!store || !editorBootstrappedRef.current) return;
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
              // Don't call loadJSON with empty scene - keep what's already rendered
              return;
            }
            
            const resolved = resolveVdpVariables(parsed, {
              record: firstRecord,
              recordIndex: 0,
            });
            
            console.log('📄 Resolved scene elements:', resolved.pages?.[0]?.children?.length);
            
            await store.loadJSON(resolved);
            console.log('✅ AI layout applied and VDP resolved for first record');
          } catch (vdpError) {
            console.error('❌ VDP resolution error:', vdpError);
            // Don't reload with fallback - elements are already in the store from addElement
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
  }, [initialScene, availableFields, allSampleData, labelWidth, labelHeight, projectType, projectImages]);

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

    try {
      const baseScene = JSON.parse(baseSceneRef.current) as PolotnoScene;
      const resolved = resolveVdpVariables(baseScene, {
        record: currentRecord,
        recordIndex: currentRecordIndex,
      });
      storeRef.current.loadJSON(resolved);
    } catch (err) {
      console.warn('VDP resolution error:', err);
    }
  }, [currentRecordIndex, allSampleData]);

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
  // Render
  // ============================================================================
  
  // Only show loading spinner during initial bootstrap
  if (isLoading) {
    // Human-readable stage names
    const stageLabels: Record<string, string> = {
      init: 'Initializing...',
      fetch_key: 'Fetching API key...',
      load_modules: 'Loading editor modules...',
      create_store: 'Creating editor store...',
      render_ui: 'Rendering editor UI...',
      ready: 'Ready',
      error: 'Error',
    };
    
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">
          {stageLabels[bootstrapStage] || 'Loading editor...'}
        </p>
        <p className="text-xs text-muted-foreground/60">Stage: {bootstrapStage}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-background">
        <p className="text-sm font-medium text-destructive">Editor Error</p>
        <p className="text-sm text-muted-foreground max-w-md text-center">{error}</p>
        <p className="text-xs text-muted-foreground/60">Stage: {bootstrapStage}</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative h-full w-full">
      {/* Layout generation overlay (non-blocking) */}
      {layoutStatus && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex items-center gap-2 bg-card rounded-lg border shadow-lg px-4 py-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">{layoutStatus}</p>
          </div>
        </div>
      )}
      
      {allSampleData.length > 1 && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-card/95 backdrop-blur-sm rounded-lg border shadow-sm px-3 py-1.5">
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
      <div ref={editorRef} className="h-full w-full" />
    </div>
  );
}

export default PolotnoEditorWrapper;
