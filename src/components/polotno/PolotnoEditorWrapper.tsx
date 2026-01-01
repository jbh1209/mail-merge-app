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
  toggleBleedVisibility,
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
import { applyVdpToStore, resolveVdpVariables, batchResolveVdp } from '@/lib/polotno/vdpResolver';
import type { PolotnoScene } from '@/lib/polotno/types';

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
  showBleed?: boolean;
  projectType?: string;
  projectImages?: { name: string; url: string }[];
  trimGuideMm?: { width: number; height: number; bleedMm: number };
}

// Use runtime's mmToPixels for consistency
const mmToPixels = (mm: number, dpi = 300) => runtimeMmToPixels(mm, dpi);

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
  showBleed = true,
  projectImages = [],
}: PolotnoEditorWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const storeRef = useRef<any>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<Root | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentRecordIndex, setCurrentRecordIndex] = useState(0);
  const lastSavedSceneRef = useRef<string>('');
  // Base template scene (without VDP resolution) - used for preview switching
  const baseSceneRef = useRef<string>('');
  // Track if editor is initialized
  const isInitializedRef = useRef(false);
  
  // Stable references for dynamic data (prevents re-init on prop changes)
  const availableFieldsRef = useRef(availableFields);
  const projectImagesRef = useRef(projectImages);
  const allSampleDataRef = useRef(allSampleData);
  
  // Stable references for callbacks (prevents re-init on parent re-renders)
  const onSaveRef = useRef(onSave);
  const onSceneChangeRef = useRef(onSceneChange);
  const onReadyRef = useRef(onReady);
  
  // Update refs when props change
  useEffect(() => {
    availableFieldsRef.current = availableFields;
  }, [availableFields]);
  
  useEffect(() => {
    projectImagesRef.current = projectImages;
  }, [projectImages]);
  
  useEffect(() => {
    allSampleDataRef.current = allSampleData;
  }, [allSampleData]);
  
  // Keep callback refs up to date
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);
  
  useEffect(() => {
    onSceneChangeRef.current = onSceneChange;
  }, [onSceneChange]);
  
  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  // Toggle bleed visibility when showBleed prop changes
  useEffect(() => {
    if (storeRef.current && isInitializedRef.current) {
      toggleBleedVisibility(storeRef.current, showBleed);
    }
  }, [showBleed]);

  // Refs for initial config (captured at mount time)
  const initialConfigRef = useRef({
    labelWidth,
    labelHeight,
    bleedMm,
    initialScene,
    showBleed,
  });

  // Main initialization effect - runs ONCE on mount only
  useEffect(() => {
    let mounted = true;
    let changeInterval: ReturnType<typeof setInterval> | null = null;

    const init = async () => {
      try {
        console.log('[Polotno] INIT start');
        
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

        // Use initial config from ref (stable values from mount time)
        const config = initialConfigRef.current;

        // Create store via bridge
        const store = await createPolotnoStore({
          apiKey,
          unit: 'mm',
          dpi: 300,
          width: mmToPixels(config.labelWidth),
          height: mmToPixels(config.labelHeight),
        });

        if (!mounted) return;

        // Configure bleed
        configureBleed(store, mmToPixels(config.bleedMm), config.showBleed);
        
        // Close all side panels on start
        store.openSidePanel(null);

        // Load initial scene and store as base template
        if (config.initialScene) {
          baseSceneRef.current = config.initialScene;
          
          // If we have sample data, apply VDP resolution for first record
          if (allSampleDataRef.current.length > 0 && allSampleDataRef.current[0]) {
            const parsed = JSON.parse(config.initialScene) as PolotnoScene;
            const resolved = resolveVdpVariables(parsed, {
              record: allSampleDataRef.current[0],
              recordIndex: 0,
            });
            store.loadJSON(resolved);
          } else {
            loadScene(store, config.initialScene);
          }
          lastSavedSceneRef.current = config.initialScene;
        }

        storeRef.current = store;
        isInitializedRef.current = true;

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

          // Get current sample data for the panel
          const currentSampleData = allSampleDataRef.current[0] || {};

          // Build custom sections with our VDP panels - pass sample data for immediate resolution
          const customSections = [
            createVdpFieldsSection(VdpFieldsPanel, { 
              store, 
              availableFields: availableFieldsRef.current, 
              projectImages: projectImagesRef.current,
              sampleData: currentSampleData,
            }),
            createBarcodesSection(BarcodePanel, { store, availableFields: availableFieldsRef.current }),
            createProjectImagesSection(ProjectImagesPanel, { store, projectImages: projectImagesRef.current }),
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
                createElement(SidePanel, { store, sections, defaultSection: null })
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
        }

        // Create handle for parent
        const handle: PolotnoEditorHandle = {
          saveScene: async () => {
            // Before saving, we need to get the base template (with placeholders, not resolved values)
            // Store the current resolved scene, then restore placeholders
            const currentScene = saveScene(store);
            
            // If we have a base scene, use that. Otherwise, the current scene is the base.
            const sceneToSave = baseSceneRef.current || currentScene;
            
            // Update baseScene from current state if needed
            // We need to extract the layout/design changes but keep VDP placeholders
            // For now, save the current scene as base (user is designing with resolved values visible)
            baseSceneRef.current = currentScene;
            
            onSaveRef.current?.(currentScene);
            lastSavedSceneRef.current = currentScene;
            return currentScene;
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
            // Use current store state as base for VDP resolution
            const currentScene = saveScene(store);
            const parsed = JSON.parse(currentScene) as PolotnoScene;
            return resolveVdpVariables(parsed, { record, recordIndex });
          },
          batchResolve: (records: Record<string, string>[]) => {
            const currentScene = saveScene(store);
            return batchResolveVdp(currentScene, records);
          },
          getBaseScene: () => {
            return baseSceneRef.current || saveScene(store);
          },
          store,
        };

        onReadyRef.current?.(handle);
        setIsLoading(false);
        console.log('[Polotno] INIT complete');

        // Track changes - use stable interval
        let lastCheckedScene = lastSavedSceneRef.current;
        changeInterval = setInterval(() => {
          if (!store) return;
          const current = saveScene(store);
          const hasChanges = current !== lastSavedSceneRef.current;
          if (current !== lastCheckedScene) {
            lastCheckedScene = current;
            onSceneChangeRef.current?.(hasChanges);
          }
        }, 2000);
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
      console.log('[Polotno] CLEANUP (component unmount)');
      mounted = false;
      if (changeInterval) clearInterval(changeInterval);
      if (rootRef.current) {
        rootRef.current.unmount();
        rootRef.current = null;
      }
    };
  // Empty deps - init runs ONCE on mount, cleanup runs ONCE on unmount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (!storeRef.current || allSampleData.length === 0) return;
    
    const currentRecord = allSampleData[currentRecordIndex];
    if (!currentRecord) return;

    try {
      // Use current store state for VDP resolution (not stale baseSceneRef)
      const currentScene = saveScene(storeRef.current);
      const parsed = JSON.parse(currentScene) as PolotnoScene;
      const resolved = resolveVdpVariables(parsed, {
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

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2 text-sm text-muted-foreground">Loading editor...</p>
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
