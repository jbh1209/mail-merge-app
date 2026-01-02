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
  setLayoutStatus: (status: string | null) => void,
  projectImages: { name: string; url: string }[] = []
): Promise<string | null> {
  if (fields.length === 0 || Object.keys(sampleData).length === 0) {
    console.log('⏭️ Skipping auto-layout: no fields or sample data');
    return null;
  }

  setLayoutStatus('Generating smart layout...');
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
      setLayoutStatus(null);
      return null;
    }

    if (!hybridData?.designStrategy) {
      console.warn('⚠️ No design strategy returned from hybrid layout');
      setLayoutStatus(null);
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
      setLayoutStatus(null);
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

        // Add text element to the page
        page.addElement({
          type: 'text',
          x: mmToPixels(field.x),
          y: mmToPixels(field.y),
          width: mmToPixels(field.width),
          height: mmToPixels(field.height),
          text: textContent,
          fontSize: field.fontSize || 12,
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

        console.log(`✅ Created Polotno text element: ${field.templateField}`);
      } catch (blockError) {
        console.error(`❌ Failed to create element for ${field.templateField}:`, blockError);
      }
    }

    // Verify element creation
    console.log(`📊 Page now has ${page.children?.length || 0} elements after text layout`);
    if (!page.children || page.children.length === 0) {
      console.warn('⚠️ No elements were added to the page!');
    }

    // Step 4: Create VDP image elements for detected image fields
    if (imageFieldsDetected.length > 0 && projectImages.length > 0) {
      console.log('🖼️ Creating VDP image elements for:', imageFieldsDetected);
      
      // Position images in remaining space (e.g., right side or bottom)
      const imageAreaX = widthMm * 0.7; // 70% from left
      const imageAreaWidth = widthMm * 0.25;
      const imageHeight = heightMm * 0.4;
      
      imageFieldsDetected.forEach((imageField, index) => {
        // Find matching project image
        const sampleValue = sampleData[imageField];
        const matchedImage = projectImages.find(img => 
          img.name === sampleValue || 
          img.url.includes(sampleValue) ||
          sampleValue?.includes(img.name)
        );
        
        page.addElement({
          type: 'image',
          x: mmToPixels(imageAreaX),
          y: mmToPixels(heightMm * 0.1 + index * (imageHeight + 2)),
          width: mmToPixels(imageAreaWidth),
          height: mmToPixels(imageHeight),
          src: matchedImage?.url || '',
          custom: {
            variable: imageField,
          },
        });
        
        console.log(`✅ Created Polotno image element: ${imageField}`);
      });
    }

    setLayoutStatus(null);
    
    // Save the base scene (with placeholders) and return it
    const baseScene = saveScene(store);
    console.log('💾 Base scene saved with', layoutResult.fields.length, 'text elements');
    
    return baseScene;
  } catch (error) {
    console.error('❌ Layout generation error:', error);
    setLayoutStatus(null);
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
  const hasInitializedRef = useRef(false); // Prevent multiple re-initializations
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentRecordIndex, setCurrentRecordIndex] = useState(0);
  const [layoutStatus, setLayoutStatus] = useState<string | null>(null);
  const lastSavedSceneRef = useRef<string>('');
  // Base template scene (without VDP resolution) - used for preview switching
  const baseSceneRef = useRef<string>('');

  useEffect(() => {
    let mounted = true;
    let changeInterval: ReturnType<typeof setInterval> | null = null;

    const init = async () => {
      // Prevent multiple re-initializations
      if (hasInitializedRef.current) {
        console.log('⚠️ Polotno already initialized, skipping re-init');
        return;
      }
      hasInitializedRef.current = true;

      try {
        // Fetch API key from edge function
        const keyResponse = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-polotno-key`
        );
        
        if (!keyResponse.ok) {
          throw new Error('Failed to fetch Polotno API key');
        }
        
        const { apiKey, error: keyError } = await keyResponse.json();
        
        if (keyError || !apiKey) {
          setError(keyError || 'Polotno API key not configured');
          setIsLoading(false);
          return;
        }

        // Load Polotno modules via JS bridge
        await loadPolotnoModules();

        if (!mounted) return;

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

        // Load initial scene OR generate AI layout
        if (initialScene) {
          // Existing scene - load it
          baseSceneRef.current = initialScene;
          
          // If we have sample data, apply VDP resolution for first record
          if (allSampleData.length > 0 && allSampleData[0]) {
            const parsed = JSON.parse(initialScene) as PolotnoScene;
            const resolved = resolveVdpVariables(parsed, {
              record: allSampleData[0],
              recordIndex: 0,
            });
            store.loadJSON(resolved);
          } else {
            loadScene(store, initialScene);
          }
          lastSavedSceneRef.current = initialScene;
        } else if (availableFields.length > 0 && allSampleData.length > 0) {
          // NEW TEMPLATE with data - generate AI-assisted layout
          console.log('🚀 New template with data detected - triggering AI layout generation');
          
          const firstRecord = allSampleData[0] || {};
          const generatedScene = await generateInitialLayoutPolotno(
            store,
            availableFields,
            firstRecord,
            allSampleData,
            labelWidth,
            labelHeight,
            projectType,
            setLayoutStatus,
            projectImages
          );
          
          if (generatedScene) {
            baseSceneRef.current = generatedScene;
            
            // Apply VDP resolution to show first record's actual values
            try {
              console.log('🔄 Applying VDP resolution to first record...');
              const parsed = JSON.parse(generatedScene) as PolotnoScene;
              console.log('📄 Parsed scene:', parsed.pages?.[0]?.children?.length, 'elements');
              
              const resolved = resolveVdpVariables(parsed, {
                record: firstRecord,
                recordIndex: 0,
              });
              console.log('✅ VDP resolved, loading into store...');
              
              store.loadJSON(resolved);
              lastSavedSceneRef.current = generatedScene;
              console.log('✅ AI layout applied and VDP resolved for first record');
            } catch (vdpError) {
              console.error('❌ VDP resolution error:', vdpError);
              // Fallback: just load the base scene without resolution
              try {
                store.loadJSON(JSON.parse(generatedScene));
                lastSavedSceneRef.current = generatedScene;
                console.log('⚠️ Loaded base scene without VDP resolution as fallback');
              } catch (loadError) {
                console.error('❌ Scene load error:', loadError);
              }
            }
          }
          
          // Always clear layout status after layout generation attempt
          setLayoutStatus(null);
        }

        storeRef.current = store;

        // Render Polotno UI
        if (editorRef.current) {
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
          
          // Close the sidebar after a short delay to ensure Polotno UI has mounted
          requestAnimationFrame(() => {
            setTimeout(() => {
              store.openSidePanel('');
            }, 200);
          });
        }

        // Create handle for parent
        const handle: PolotnoEditorHandle = {
          saveScene: async () => {
            // Save the current scene as the base template
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
            // Load the resolved scene into store temporarily
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
            
            // Restore original scene
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

        onReady?.(handle);
        setIsLoading(false);

        // Track changes
        changeInterval = setInterval(() => {
          if (!store) return;
          const current = saveScene(store);
          onSceneChange?.(current !== lastSavedSceneRef.current);
        }, 1000);
      } catch (e) {
        console.error('Polotno init error:', e);
        if (mounted) {
          setError('Failed to initialize editor');
          setIsLoading(false);
        }
      }
    };

    init();

    return () => {
      mounted = false;
      if (changeInterval) clearInterval(changeInterval);
      if (rootRef.current) {
        rootRef.current.unmount();
        rootRef.current = null;
      }
    };
  }, [labelWidth, labelHeight, bleedMm, initialScene, onSave, onSceneChange, onReady, availableFields, projectImages, allSampleData, projectType]);

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

  if (isLoading || layoutStatus) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2 text-sm text-muted-foreground">
          {layoutStatus || 'Loading editor...'}
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative h-full w-full">
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
