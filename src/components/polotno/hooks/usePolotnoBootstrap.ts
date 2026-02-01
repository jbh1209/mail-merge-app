/**
 * usePolotnoBootstrap Hook
 * 
 * Handles the Polotno editor bootstrap lifecycle:
 * - API key fetching via Supabase edge function
 * - Module loading
 * - Store creation with DPI/unit configuration
 * - UI rendering with custom sections
 * - Change detection interval
 * 
 * STABILITY: This hook uses a runId pattern to prevent race conditions.
 * All dynamic data (projectImages, regenerateLayout, etc.) is accessed via refs
 * to avoid effect dependency churn that would cancel bootstrap mid-flight.
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
  // All dynamic data passed via refs to prevent effect re-runs
  projectImagesRef: React.RefObject<{ name: string; url: string }[]>;
  availableFieldsRef: React.RefObject<string[]>;
  allSampleDataRef: React.RefObject<Record<string, string>[]>;
  baseSceneRef: React.MutableRefObject<string>;
  lastSavedSceneRef: React.MutableRefObject<string>;
  initialVdpAppliedRef: React.MutableRefObject<boolean>;
  onSaveRef: React.RefObject<((scene: string) => void) | undefined>;
  onReadyRef: React.RefObject<((handle: PolotnoEditorHandle) => void) | undefined>;
  onSceneChangeRef: React.RefObject<((hasChanges: boolean) => void) | undefined>;
  regenerateLayoutRef: React.RefObject<() => Promise<void>>;
  commitToBaseRef: React.RefObject<(reason?: string) => void>;
}

export interface UsePolotnoBootstrapResult {
  storeRef: React.MutableRefObject<any>;
  rootRef: React.MutableRefObject<Root | null>;
  handleRef: React.MutableRefObject<PolotnoEditorHandle | null>;
  bootstrapStage: BootstrapStage;
  error: string | null;
  retry: () => void;
}

// Timeout for bootstrap watchdog (20 seconds)
const BOOTSTRAP_TIMEOUT_MS = 20000;

export function usePolotnoBootstrap(options: UsePolotnoBootstrapOptions): UsePolotnoBootstrapResult {
  const {
    mountEl,
    labelWidth,
    labelHeight,
    bleedMm,
    projectType,
    // All refs - these do NOT trigger effect re-runs
    projectImagesRef,
    availableFieldsRef,
    allSampleDataRef,
    baseSceneRef,
    lastSavedSceneRef,
    initialVdpAppliedRef,
    onSaveRef,
    onReadyRef,
    onSceneChangeRef,
    regenerateLayoutRef,
    commitToBaseRef,
  } = options;

  const storeRef = useRef<any>(null);
  const rootRef = useRef<Root | null>(null);
  const handleRef = useRef<PolotnoEditorHandle | null>(null);
  
  // Run ID pattern: each bootstrap attempt gets a unique ID
  // If runId changes mid-flight, the async chain aborts gracefully
  const bootstrapRunIdRef = useRef(0);
  
  // Store initial dimensions for first bootstrap - dimension changes after
  // bootstrap is complete are handled by a separate effect (no re-init)
  const initialDimensionsRef = useRef({ width: labelWidth, height: labelHeight });

  const [bootstrapStage, setBootstrapStage] = useState<BootstrapStage>('waiting_for_mount');
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Retry handler - increments runId to abort any in-flight bootstrap
  const retry = useCallback(() => {
    console.log(`[polotno-bootstrap] Retry requested, incrementing runId`);
    bootstrapRunIdRef.current += 1;
    setError(null);
    setBootstrapStage('waiting_for_mount');

    if (rootRef.current) {
      try {
        rootRef.current.unmount();
      } catch (e) {
        console.warn('[polotno-bootstrap] Retry cleanup failed:', e);
      }
      rootRef.current = null;
    }
    storeRef.current = null;
    handleRef.current = null;

    setRetryCount(c => c + 1);
  }, []);

  // Main bootstrap effect
  // CRITICAL: Only depends on stable primitives, NOT on arrays/functions
  useEffect(() => {
    if (!mountEl) {
      console.log('[polotno-bootstrap] Waiting for mount element...');
      return;
    }

    // If already ready, skip
    if (bootstrapStage === 'ready' && handleRef.current) {
      console.log('[polotno-bootstrap] Already ready, skipping');
      return;
    }

    // Increment runId for this bootstrap attempt
    const runId = ++bootstrapRunIdRef.current;
    let changeInterval: ReturnType<typeof setInterval> | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    // Helper to check if this run is still valid
    const isStale = () => runId !== bootstrapRunIdRef.current;

    const bootstrap = async () => {
      console.log(`[polotno-bootstrap run=${runId}] Starting bootstrap`);

      try {
        // ---- TIMEOUT WATCHDOG ----
        timeoutId = setTimeout(() => {
          if (!isStale() && bootstrapStage !== 'ready') {
            console.error(`[polotno-bootstrap run=${runId}] Timeout after ${BOOTSTRAP_TIMEOUT_MS}ms at stage: ${bootstrapStage}`);
            setError(`Bootstrap timed out at stage: ${bootstrapStage}`);
            setBootstrapStage('error');
          }
        }, BOOTSTRAP_TIMEOUT_MS);

        // ---- FETCH KEY ----
        setBootstrapStage('fetch_key');
        console.log(`[polotno-bootstrap run=${runId} stage=fetch_key]`);

        const { data: keyData, error: keyFetchError } = await supabase.functions.invoke('get-polotno-key');

        if (isStale()) {
          console.log(`[polotno-bootstrap run=${runId}] Aborted: runId superseded during key fetch`);
          return;
        }

        if (keyFetchError) {
          throw new Error(`Failed to fetch API key: ${keyFetchError.message}`);
        }

        const apiKey = keyData?.apiKey;
        if (!apiKey) {
          throw new Error('Editor API key not configured');
        }

        // ---- LOAD MODULES ----
        setBootstrapStage('load_modules');
        console.log(`[polotno-bootstrap run=${runId} stage=load_modules]`);
        await loadPolotnoModules();

        if (isStale()) {
          console.log(`[polotno-bootstrap run=${runId}] Aborted: runId superseded during module load`);
          return;
        }

        // ---- CREATE STORE ----
        setBootstrapStage('create_store');
        console.log(`[polotno-bootstrap run=${runId} stage=create_store]`);

        // Use initial dimensions from ref (not current props) to avoid re-init on resize
        const store = await createPolotnoStore({
          apiKey,
          unit: 'mm',
          dpi: 300,
          width: mmToPixels(initialDimensionsRef.current.width),
          height: mmToPixels(initialDimensionsRef.current.height),
        });

        if (isStale()) {
          console.log(`[polotno-bootstrap run=${runId}] Aborted: runId superseded during store creation`);
          return;
        }

        // Configure bleed
        try {
          if (projectType === 'label') {
            configureBleed(store, 0, false);
          } else if (bleedMm > 0) {
            configureBleed(store, mmToPixels(bleedMm), true);
          } else {
            configureBleed(store, 0, false);
          }
        } catch (bleedError) {
          console.warn('[polotno-bootstrap] Bleed configuration failed, continuing:', bleedError);
        }
        storeRef.current = store;
        console.log(`[polotno-bootstrap run=${runId}] Store created`);

        // ---- RENDER UI ----
        setBootstrapStage('render_ui');
        console.log(`[polotno-bootstrap run=${runId} stage=render_ui]`);

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

        // Build custom sections - use factory functions that read from refs
        // This ensures panels always get fresh data without triggering effect re-runs
        const vdpFieldsSection = createVdpFieldsSection(VdpFieldsPanel, () => ({
          availableFields: availableFieldsRef.current || [],
          projectImages: projectImagesRef.current || [],
          onInserted: () => commitToBaseRef.current?.('vdp-insert'),
        }));

        const barcodesSection = createBarcodesSection(BarcodePanel, () => ({
          availableFields: availableFieldsRef.current || [],
          onInserted: () => commitToBaseRef.current?.('barcode-insert'),
        }));

        const imagesSection = createProjectImagesSection(ProjectImagesPanel, () => ({
          projectImages: projectImagesRef.current || [],
          onInserted: () => commitToBaseRef.current?.('image-insert'),
        }));

        const sequenceSection = createSequenceSection(SequencePanel, () => ({
          onInserted: () => commitToBaseRef.current?.('sequence-insert'),
        }));

        const sections = buildCustomSections([
          vdpFieldsSection,
          barcodesSection,
          imagesSection,
          sequenceSection
        ]);

        // Clean up previous root if exists
        if (rootRef.current) {
          try {
            rootRef.current.unmount();
          } catch (e) {
            console.warn('[polotno-bootstrap] Previous root unmount failed:', e);
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

        console.log(`[polotno-bootstrap run=${runId}] UI render() called`);

        // ---- VERIFY UI MOUNTED ----
        await new Promise<void>((resolve, reject) => {
          requestAnimationFrame(() => {
            setTimeout(() => {
              if (isStale()) {
                console.log(`[polotno-bootstrap run=${runId}] Aborted during UI verification`);
                resolve();
                return;
              }

              const childCount = mountEl?.childElementCount || 0;
              console.log(`[polotno-bootstrap run=${runId}] DOM verification: ${childCount} children`);

              if (childCount === 0) {
                reject(new Error('Polotno rendered 0 DOM nodes - render failed silently'));
                return;
              }

              store.openSidePanel('');
              resolve();
            }, 150);
          });
        });

        if (isStale()) {
          console.log(`[polotno-bootstrap run=${runId}] Aborted after UI verification`);
          return;
        }

        // ---- CREATE HANDLE ----
        // Read projectImages from ref for handle methods
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
            const images = projectImagesRef.current || [];
            return resolveVdpVariables(parsed, { record, recordIndex, projectImages: images });
          },
          batchResolve: (records: Record<string, string>[]) => {
            const baseScene = baseSceneRef.current || saveScene(store);
            const images = projectImagesRef.current || [];
            return batchResolveVdp(baseScene, records, undefined, images);
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
          regenerateLayout: () => regenerateLayoutRef.current?.() || Promise.resolve(),
          store,
        };

        handleRef.current = handle;
        
        // Clear timeout since we succeeded
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }

        setBootstrapStage('ready');
        setError(null);

        onReadyRef.current?.(handle);
        console.log(`[polotno-bootstrap run=${runId}] Bootstrap complete - editor ready`);

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
        console.error(`[polotno-bootstrap run=${runId}] Error:`, e);
        if (!isStale()) {
          setError(String(e instanceof Error ? e.message : e));
          setBootstrapStage('error');
        }
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    };

    bootstrap();

    // Cleanup: increment runId to abort in-flight async chain
    return () => {
      console.log(`[polotno-bootstrap run=${runId}] Cleanup - incrementing runId to abort`);
      bootstrapRunIdRef.current += 1;
      if (changeInterval) clearInterval(changeInterval);
      if (timeoutId) clearTimeout(timeoutId);
    };
  // CRITICAL: Removed labelWidth/labelHeight from deps - dimension changes
  // are handled by a separate effect below to avoid full re-bootstrap
  }, [mountEl, bleedMm, projectType, retryCount]);

  // Handle dimension changes without re-bootstrapping
  // This effect only runs when already "ready" and dimensions change
  useEffect(() => {
    // Only run if already bootstrapped and store exists
    if (bootstrapStage !== 'ready' || !storeRef.current) return;
    
    const store = storeRef.current;
    const newWidthPx = mmToPixels(labelWidth);
    const newHeightPx = mmToPixels(labelHeight);
    
    // Update store size directly (preserves all elements)
    store.setSize(newWidthPx, newHeightPx);
    console.log(`[polotno-bootstrap] Dimensions updated: ${labelWidth}mm x ${labelHeight}mm`);
  }, [bootstrapStage, labelWidth, labelHeight]);

  // Cleanup root on unmount
  useEffect(() => {
    return () => {
      if (rootRef.current) {
        try {
          rootRef.current.unmount();
        } catch (e) {
          console.warn('[polotno-bootstrap] Root unmount on cleanup failed:', e);
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
