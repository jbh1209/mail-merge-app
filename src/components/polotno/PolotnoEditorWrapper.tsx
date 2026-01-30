/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * PolotnoEditorWrapper
 * 
 * Main wrapper component for the Polotno design editor.
 * Refactored to use extracted hooks for better maintainability:
 * - usePolotnoBootstrap: Bootstrap state machine and store creation
 * - useVdpNavigation: VDP record navigation and resolution
 * - useLayoutGenerator: AI-assisted layout generation
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { saveScene } from '@/vendor/polotno-runtime.js';
import { mergeLayoutToBase } from '@/lib/polotno/vdpResolver';
import type { PolotnoScene } from '@/lib/polotno/types';

import {
  usePolotnoBootstrap,
  useVdpNavigation,
  useLayoutGenerator,
  type PolotnoEditorHandle,
  type PrintExportOptions,
  type RecordNavigationState,
} from './hooks';

// Re-export types for consumers
export type { PolotnoEditorHandle, PrintExportOptions, RecordNavigationState };

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
  // Mount element state - use callback ref to detect when DOM is ready
  // ============================================================================
  const [mountEl, setMountEl] = useState<HTMLDivElement | null>(null);

  // ============================================================================
  // Shared refs between hooks
  // ============================================================================
  const storeRef = useRef<any>(null);
  const baseSceneRef = useRef<string>('');
  const lastSavedSceneRef = useRef<string>('');
  const initialVdpAppliedRef = useRef(false);
  const loadedInitialSceneRef = useRef<string | null>(null);
  const layoutGeneratedRef = useRef(false);

  // Stable refs for callbacks (prevents hook re-runs on parent re-renders)
  const onSaveRef = useRef(onSave);
  const onReadyRef = useRef(onReady);
  const onSceneChangeRef = useRef(onSceneChange);
  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);
  useEffect(() => { onReadyRef.current = onReady; }, [onReady]);
  useEffect(() => { onSceneChangeRef.current = onSceneChange; }, [onSceneChange]);

  // Stable refs for data arrays (prevents effects from re-running on new references)
  const availableFieldsRef = useRef(availableFields);
  const projectImagesRef = useRef(projectImages);
  const allSampleDataRef = useRef(allSampleData);
  useEffect(() => { availableFieldsRef.current = availableFields; }, [availableFields]);
  useEffect(() => { projectImagesRef.current = projectImages; }, [projectImages]);
  useEffect(() => { allSampleDataRef.current = allSampleData; }, [allSampleData]);

  // ============================================================================
  // Commit to Base - merge current store state into baseSceneRef
  // Uses storeRef directly to avoid circular dependency
  // ============================================================================
  const commitToBase = useCallback((reason: string = 'manual') => {
    const store = storeRef.current;
    if (!store || !baseSceneRef.current || !initialVdpAppliedRef.current) {
      console.log(`⏭️ commitToBase(${reason}) skipped - not ready`);
      return;
    }

    try {
      const currentSceneJson = saveScene(store);
      const currentScene = JSON.parse(currentSceneJson) as PolotnoScene;
      const baseScene = JSON.parse(baseSceneRef.current) as PolotnoScene;

      const currentElements = currentScene.pages[0]?.children?.length || 0;
      const baseElements = baseScene.pages[0]?.children?.length || 0;

      const merged = mergeLayoutToBase(currentScene, baseScene);
      baseSceneRef.current = JSON.stringify(merged);

      const mergedElements = merged.pages[0]?.children?.length || 0;
      console.log(`✅ commitToBase(${reason}): ${baseElements} base + ${currentElements} current → ${mergedElements} merged`);
    } catch (err) {
      console.error(`❌ commitToBase(${reason}) error:`, err);
    }
  }, []);

  // ============================================================================
  // Layout Generator Hook
  // ============================================================================
  const layoutGenerator = useLayoutGenerator({
    storeRef,
    baseSceneRef,
    lastSavedSceneRef,
    initialVdpAppliedRef,
    layoutGeneratedRef,
    availableFields,
    allSampleData,
    projectImages,
    labelWidth,
    labelHeight,
    projectType,
    initialScene,
    bootstrapStage: 'ready', // Will be controlled by effect
    onSave,
  });

  // ============================================================================
  // Bootstrap Hook - uses shared storeRef
  // ============================================================================
  const bootstrapResult = usePolotnoBootstrap({
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
    regenerateLayout: layoutGenerator.regenerateLayout,
    commitToBase,
  });

  // Sync storeRef from bootstrap result
  useEffect(() => {
    storeRef.current = bootstrapResult.storeRef.current;
  }, [bootstrapResult.storeRef.current]);

  // ============================================================================
  // VDP Navigation Hook
  // ============================================================================
  useVdpNavigation({
    storeRef: bootstrapResult.storeRef,
    baseSceneRef,
    lastSavedSceneRef,
    initialVdpAppliedRef,
    loadedInitialSceneRef,
    allSampleDataRef,
    projectImagesRef,
    bootstrapStage: bootstrapResult.bootstrapStage,
    initialScene,
    onRecordNavigationChange,
  });

  // ============================================================================
  // Phase B2: Trigger layout generation when bootstrap is ready
  // ============================================================================
  const layoutGeneratorActive = useLayoutGenerator({
    storeRef: bootstrapResult.storeRef,
    baseSceneRef,
    lastSavedSceneRef,
    initialVdpAppliedRef,
    layoutGeneratedRef,
    availableFields,
    allSampleData,
    projectImages,
    labelWidth,
    labelHeight,
    projectType,
    initialScene,
    bootstrapStage: bootstrapResult.bootstrapStage,
    onSave,
  });

  // ============================================================================
  // Render
  // ============================================================================
  const isLoading = bootstrapResult.bootstrapStage !== 'ready' && bootstrapResult.bootstrapStage !== 'error';
  const layoutStatus = layoutGeneratorActive.layoutStatus;

  return (
    <div className="relative h-full w-full">
      {/* ALWAYS PRESENT: The mount point for Polotno UI */}
      <div
        ref={setMountEl}
        className="h-full w-full"
        style={{ visibility: isLoading || bootstrapResult.error ? 'hidden' : 'visible' }}
      />

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading editor...</p>
        </div>
      )}

      {/* Error overlay */}
      {bootstrapResult.error && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background">
          <p className="text-sm font-medium text-destructive">Failed to load editor</p>
          <p className="text-sm text-muted-foreground max-w-md text-center">
            There was a problem loading the design editor. Please try again.
          </p>
          <Button variant="outline" size="sm" onClick={bootstrapResult.retry} className="mt-2">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      )}

      {/* Layout generation overlay */}
      {bootstrapResult.bootstrapStage === 'ready' && layoutStatus && (
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
