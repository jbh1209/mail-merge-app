/**
 * usePolotnoBootstrap Hook
 * 
 * Handles the Polotno editor bootstrap lifecycle:
 * - API key fetching via Supabase edge function
 * - Module loading
 * - Store creation with DPI/unit configuration
 * - UI rendering with custom sections
 * - Change detection interval
 */

import { useEffect, useRef, useState, useCallback, createElement } from 'react';
import { createRoot, Root } from 'react-dom/client';

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

import { VdpFieldsPanel } from '../panels/VdpFieldsPanel';
import { BarcodePanel } from '../panels/BarcodePanel';
import { ProjectImagesPanel } from '../panels/ProjectImagesPanel';
import { SequencePanel } from '../panels/SequencePanel';

import { supabase } from '@/integrations/supabase/client';
import { 
  resolveVdpVariables, 
  batchResolveVdp, 
  mergeLayoutToBase,
} from '@/lib/polotno/vdpResolver';
import type { PolotnoScene } from '@/lib/polotno/types';

const mmToPixels = (mm: number, dpi = 300) => runtimeMmToPixels(mm, dpi);

// Bootstrap stages for state management
export type BootstrapStage = 
  | 'waiting_for_mount' 
  | 'fetch_key' 
  | 'load_modules' 
  | 'create_store' 
  | 'render_ui' 
  | 'ready' 
  | 'error';

export interface PolotnoEditorHandle {
  saveScene: () => Promise<string>;
  exportPdf: (options?: PrintExportOptions) => Promise<Blob>;
  exportResolvedPdf: (scene: PolotnoScene, options?: PrintExportOptions) => Promise<Blob>;
  getResolvedScene: (record: Record<string, string>, recordIndex: number) => PolotnoScene;
  batchResolve: (records: Record<string, string>[]) => PolotnoScene[];
  store: any;
  getBaseScene: () => string;
  regenerateLayout: () => Promise<void>;
}

export interface PrintExportOptions {
  includeBleed?: boolean;
  includeCropMarks?: boolean;
  cropMarkSizeMm?: number;
  pixelRatio?: number;
  fileName?: string;
}

export interface UsePolotnoBootstrapOptions {
  mountEl: HTMLDivElement | null;
  labelWidth: number;
  labelHeight: number;
  bleedMm: number;
  projectType: string;
  projectImages: { name: string; url: string }[];
  availableFieldsRef: React.RefObject<string[]>;
  allSampleDataRef: React.RefObject<Record<string, string>[]>;
  baseSceneRef: React.MutableRefObject<string>;
  lastSavedSceneRef: React.MutableRefObject<string>;
  initialVdpAppliedRef: React.MutableRefObject<boolean>;
  onSaveRef: React.RefObject<((scene: string) => void) | undefined>;
  onReadyRef: React.RefObject<((handle: PolotnoEditorHandle) => void) | undefined>;
  onSceneChangeRef: React.RefObject<((hasChanges: boolean) => void) | undefined>;
  regenerateLayout: () => Promise<void>;
  commitToBase: (reason?: string) => void;
}

export interface UsePolotnoBootstrapResult {
  storeRef: React.MutableRefObject<any>;
  rootRef: React.MutableRefObject<Root | null>;
  handleRef: React.MutableRefObject<PolotnoEditorHandle | null>;
  bootstrapStage: BootstrapStage;
  error: string | null;
  retry: () => void;
}

export function usePolotnoBootstrap(options: UsePolotnoBootstrapOptions): UsePolotnoBootstrapResult {
  const {
    mountEl,
    labelWidth,
    labelHeight,
    bleedMm,
    projectType,
    projectImages,
    availableFieldsRef,
    allSampleDataRef,
    baseSceneRef,
    lastSavedSceneRef,
    initialVdpAppliedRef,
    onSaveRef,
    onReadyRef,
    onSceneChangeRef,
    regenerateLayout,
    commitToBase,
  } = options;

  const storeRef = useRef<any>(null);
  const rootRef = useRef<Root | null>(null);
  const handleRef = useRef<PolotnoEditorHandle | null>(null);
  const bootstrapInFlightRef = useRef(false);

  const [bootstrapStage, setBootstrapStage] = useState<BootstrapStage>('waiting_for_mount');
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Retry handler
  const retry = useCallback(() => {
    setError(null);
    setBootstrapStage('waiting_for_mount');
    bootstrapInFlightRef.current = false;

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

    setRetryCount(c => c + 1);
  }, []);

  // Main bootstrap effect
  useEffect(() => {
    if (!mountEl) {
      console.log('⏳ Waiting for mount element...');
      return;
    }

    if (bootstrapInFlightRef.current) {
      console.log('⏳ Bootstrap already in flight, skipping');
      return;
    }

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

        const { data: keyData, error: keyFetchError } = await supabase.functions.invoke('get-polotno-key');

        if (cancelled) return;

        if (keyFetchError) {
          throw new Error(`Failed to fetch API key: ${keyFetchError.message}`);
        }

        const apiKey = keyData?.apiKey;
        if (!apiKey) {
          throw new Error('Editor API key not configured');
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
        try {
          if (projectType === 'label') {
            configureBleed(store, 0, false);
            console.log('📐 Bleed disabled for label project');
          } else if (bleedMm > 0) {
            configureBleed(store, mmToPixels(bleedMm), true);
            console.log(`📐 Bleed enabled: ${bleedMm}mm`);
          } else {
            configureBleed(store, 0, false);
          }
        } catch (bleedError) {
          console.warn('Bleed configuration failed, continuing:', bleedError);
        }
        storeRef.current = store;
        console.log('✅ Polotno store created');

        // ---- RENDER UI ----
        setBootstrapStage('render_ui');

        if (!mountEl) {
          throw new Error('Mount element disappeared before UI render');
        }

        const {
          PolotnoContainer,
          SidePanelWrap,
          SidePanel,
          WorkspaceWrap,
          Toolbar,
          Workspace,
          ZoomButtons,
          PagesTimeline,
        } = getPolotnoComponents();

        // Build custom sections
        const vdpFieldsSection = createVdpFieldsSection(
          VdpFieldsPanel,
          availableFieldsRef,
          allSampleDataRef,
          () => commitToBase('vdp-insert')
        );

        const barcodesSection = createBarcodesSection(
          BarcodePanel,
          availableFieldsRef,
          () => commitToBase('barcode-insert')
        );

        const imagesSection = createProjectImagesSection(
          ProjectImagesPanel,
          { current: projectImages },
          () => commitToBase('image-insert')
        );

        const sequenceSection = createSequenceSection(
          SequencePanel,
          () => commitToBase('sequence-insert')
        );

        const sections = buildCustomSections(
          vdpFieldsSection,
          barcodesSection,
          imagesSection,
          sequenceSection
        );

        // Clean up previous root if exists
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
            const currentSceneJson = saveScene(store);
            const currentScene = JSON.parse(currentSceneJson) as PolotnoScene;

            const baseScene = baseSceneRef.current
              ? JSON.parse(baseSceneRef.current) as PolotnoScene
              : currentScene;

            const mergedTemplate = mergeLayoutToBase(currentScene, baseScene);
            const mergedJson = JSON.stringify(mergedTemplate);

            baseSceneRef.current = mergedJson;
            lastSavedSceneRef.current = mergedJson;

            onSaveRef.current?.(mergedJson);
            return mergedJson;
          },
          exportPdf: async (opts?: PrintExportOptions) => {
            const {
              includeBleed = true,
              includeCropMarks = false,
              cropMarkSizeMm = 3,
              pixelRatio = 2,
              fileName = 'output.pdf',
            } = opts || {};

            return exportToPdf(store, {
              includeBleed,
              cropMarkSize: includeCropMarks ? cropMarkMmToPixels(cropMarkSizeMm) : 0,
              pixelRatio,
              fileName,
            });
          },
          exportResolvedPdf: async (scene: PolotnoScene, opts?: PrintExportOptions) => {
            const currentScene = saveScene(store);
            await store.loadJSON(scene);

            const {
              includeBleed = true,
              includeCropMarks = false,
              cropMarkSizeMm = 3,
              pixelRatio = 2,
              fileName = 'output.pdf',
            } = opts || {};

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
            const currentSceneJson = saveScene(store);
            const currentScene = JSON.parse(currentSceneJson) as PolotnoScene;
            const baseScene = baseSceneRef.current
              ? JSON.parse(baseSceneRef.current) as PolotnoScene
              : currentScene;
            const merged = mergeLayoutToBase(currentScene, baseScene);
            return JSON.stringify(merged);
          },
          regenerateLayout: () => regenerateLayout(),
          store,
        };

        handleRef.current = handle;
        setBootstrapStage('ready');
        setError(null);

        onReadyRef.current?.(handle);
        console.log('✅ Bootstrap complete - editor ready');

        // Track changes interval
        changeInterval = setInterval(() => {
          if (!store || !baseSceneRef.current || !initialVdpAppliedRef.current) {
            return;
          }

          const currentSceneJson = saveScene(store);
          const currentScene = JSON.parse(currentSceneJson) as PolotnoScene;
          const baseScene = JSON.parse(baseSceneRef.current) as PolotnoScene;

          const merged = mergeLayoutToBase(currentScene, baseScene);
          const mergedJson = JSON.stringify(merged);

          baseSceneRef.current = mergedJson;
          onSceneChangeRef.current?.(mergedJson !== lastSavedSceneRef.current);
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
      console.log('🧹 Bootstrap cleanup - cancelled flag set');
      cancelled = true;
      if (changeInterval) clearInterval(changeInterval);
    };
  }, [mountEl, labelWidth, labelHeight, bleedMm, retryCount, projectType, projectImages, commitToBase, regenerateLayout]);

  // Cleanup root on unmount
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

  return {
    storeRef,
    rootRef,
    handleRef,
    bootstrapStage,
    error,
    retry,
  };
}
