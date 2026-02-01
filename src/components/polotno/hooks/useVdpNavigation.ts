/**
 * useVdpNavigation Hook
 * 
 * Handles VDP (Variable Data Printing) navigation:
 * - Record index state management
 * - Layout merging before record switching
 * - VDP resolution for current record
 * - Image cache warming for adjacent records
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { saveScene } from '@/vendor/polotno-runtime.js';
import { 
  resolveVdpVariables, 
  prefetchImagesForRecords,
  warmCacheForAdjacentRecords,
  mergeLayoutToBase,
} from '@/lib/polotno/vdpResolver';
import type { PolotnoScene } from '@/lib/polotno/types';

export interface RecordNavigationState {
  currentIndex: number;
  totalRecords: number;
  goToNext: () => void;
  goToPrevious: () => void;
}

export interface UseVdpNavigationOptions {
  storeRef: React.MutableRefObject<any>;
  baseSceneRef: React.MutableRefObject<string>;
  lastSavedSceneRef: React.MutableRefObject<string>;
  initialVdpAppliedRef: React.MutableRefObject<boolean>;
  loadedInitialSceneRef: React.MutableRefObject<string | null>;
  allSampleDataRef: React.RefObject<Record<string, string>[]>;
  projectImagesRef: React.RefObject<{ name: string; url: string }[]>;
  bootstrapStage: string;
  initialScene?: string;
  onRecordNavigationChange?: (state: RecordNavigationState) => void;
  // Current page dimensions in pixels - used to restore after loadJSON
  currentWidthPx?: number;
  currentHeightPx?: number;
}

export interface UseVdpNavigationResult {
  currentRecordIndex: number;
  goToNext: () => void;
  goToPrevious: () => void;
}

export function useVdpNavigation(options: UseVdpNavigationOptions): UseVdpNavigationResult {
  const {
    storeRef,
    baseSceneRef,
    lastSavedSceneRef,
    initialVdpAppliedRef,
    loadedInitialSceneRef,
    allSampleDataRef,
    projectImagesRef,
    bootstrapStage,
    initialScene,
    onRecordNavigationChange,
    currentWidthPx,
    currentHeightPx,
  } = options;

  const [currentRecordIndex, setCurrentRecordIndex] = useState(0);
  
  // Track previous record index to detect actual changes
  // CRITICAL: Initialize to -1 so first record (index 0) triggers proper initialization
  const prevRecordIndexRef = useRef(-1);

  // Navigation callbacks
  const goToNext = useCallback(() => {
    const allSampleData = allSampleDataRef.current || [];
    if (currentRecordIndex < allSampleData.length - 1) {
      setCurrentRecordIndex(i => i + 1);
    }
  }, [currentRecordIndex, allSampleDataRef]);

  const goToPrevious = useCallback(() => {
    if (currentRecordIndex > 0) {
      setCurrentRecordIndex(i => i - 1);
    }
  }, [currentRecordIndex]);

  // Phase B1: Load Initial Scene (when we have an existing template)
  useEffect(() => {
    const store = storeRef.current;
    if (!store || !initialScene || bootstrapStage !== 'ready') return;

    // CRITICAL: Use loadedInitialSceneRef to prevent re-running
    if (loadedInitialSceneRef.current === initialScene) {
      console.log('⏭️ Phase B1: Already loaded this initialScene, skipping');
      return;
    }

    console.log('[B1] Running - loading existing scene...');

    const loadWithPrefetch = async () => {
      try {
        loadedInitialSceneRef.current = initialScene;
        baseSceneRef.current = initialScene;
        lastSavedSceneRef.current = initialScene;

        const images = projectImagesRef.current || [];
        const sampleData = allSampleDataRef.current || [];

        // Prefetch images before VDP resolution
        if (images.length > 0 && sampleData.length > 0) {
          console.log('📥 Prefetching project images for VDP...');
          await prefetchImagesForRecords(sampleData, images);
          console.log('✅ Image prefetch complete');
        }

        // Apply VDP resolution for first record
        if (sampleData.length > 0 && sampleData[0]) {
          const parsed = JSON.parse(initialScene) as PolotnoScene;
          const resolved = resolveVdpVariables(parsed, {
            record: sampleData[0],
            recordIndex: 0,
            projectImages: images,
            useCachedImages: true,
          });
          console.log('[B1] Calling store.loadJSON with resolved scene');
          await store.loadJSON(resolved);
          
          // Restore current page dimensions after loading (loadJSON resets to scene's original size)
          if (currentWidthPx && currentHeightPx) {
            store.setSize(currentWidthPx, currentHeightPx);
            console.log(`[B1] Restored dimensions: ${currentWidthPx}x${currentHeightPx}px`);
          }
          
          initialVdpAppliedRef.current = true;
          console.log('✅ Loaded scene with VDP resolution for first record');
        } else {
          console.log('[B1] Loading scene without VDP');
          store.loadJSON(JSON.parse(initialScene));
          
          // Restore current page dimensions
          if (currentWidthPx && currentHeightPx) {
            store.setSize(currentWidthPx, currentHeightPx);
          }
          
          console.log('✅ Loaded scene without VDP resolution');
        }
      } catch (err) {
        console.error('❌ Failed to load initial scene:', err);
        loadedInitialSceneRef.current = null;
      }
    };

    loadWithPrefetch();
  }, [initialScene, bootstrapStage, storeRef, baseSceneRef, lastSavedSceneRef, initialVdpAppliedRef, loadedInitialSceneRef, allSampleDataRef, projectImagesRef]);

  // VDP Resolution on record navigation
  // CRITICAL: This effect must run whenever record index changes AND when bootstrap becomes ready
  useEffect(() => {
    const store = storeRef.current;
    
    // Guard: Need store and base scene
    if (!store || !baseSceneRef.current) {
      console.log('[VDP-Nav] Skipping: no store or base scene');
      return;
    }

    const sampleData = allSampleDataRef.current || [];
    const images = projectImagesRef.current || [];

    if (sampleData.length === 0) {
      console.log('[VDP-Nav] Skipping: no sample data');
      return;
    }

    const currentRecord = sampleData[currentRecordIndex];
    if (!currentRecord) {
      console.log(`[VDP-Nav] Skipping: no record at index ${currentRecordIndex}`);
      return;
    }

    // Only skip if record index truly hasn't changed AND we've already applied VDP
    const isFirstRun = !initialVdpAppliedRef.current;
    const indexChanged = prevRecordIndexRef.current !== currentRecordIndex;
    
    if (!isFirstRun && !indexChanged) {
      console.log('[VDP-Nav] Skipping: index unchanged and VDP already applied');
      return;
    }

    const applyVdpWithLayoutMerge = async () => {
      console.log(`[VDP-Nav] Resolving: index=${currentRecordIndex}, prev=${prevRecordIndexRef.current}, firstRun=${isFirstRun}`);

      // Merge layout changes before switching records (only if we're switching, not on first load)
      if (indexChanged && initialVdpAppliedRef.current) {
        try {
          const currentSceneJson = saveScene(store);
          const currentScene = JSON.parse(currentSceneJson) as PolotnoScene;
          const baseScene = JSON.parse(baseSceneRef.current) as PolotnoScene;

          const elementCountBefore = baseScene.pages[0]?.children?.length || 0;
          const capturedCount = currentScene.pages[0]?.children?.length || 0;
          console.log(`[VDP-Nav] Captured ${capturedCount} elements before merge`);

          const mergedTemplate = mergeLayoutToBase(currentScene, baseScene);
          baseSceneRef.current = JSON.stringify(mergedTemplate);

          const elementCountAfter = mergedTemplate.pages[0]?.children?.length || 0;
          console.log(`[VDP-Nav] Merged: ${elementCountBefore} base → ${elementCountAfter}`);
        } catch (mergeErr) {
          console.warn('[VDP-Nav] Layout merge error:', mergeErr);
        }
      }

      // Update prev index BEFORE async work to prevent double-runs
      prevRecordIndexRef.current = currentRecordIndex;

      // Warm cache for adjacent records
      if (images.length > 0) {
        await warmCacheForAdjacentRecords(currentRecordIndex, sampleData, images);
      }

      try {
        // Re-read record from ref to avoid stale closure
        const freshSampleData = allSampleDataRef.current || [];
        const freshRecord = freshSampleData[currentRecordIndex];

        if (!freshRecord) {
          console.warn(`[VDP-Nav] No record found at index ${currentRecordIndex}`);
          return;
        }

        // Log the record data for debugging
        const firstKey = Object.keys(freshRecord)[0] || '';
        const recordPreview = freshRecord['Name'] || freshRecord['Full Name'] || freshRecord[firstKey] || '(empty)';
        console.log(`[VDP-Nav] Record ${currentRecordIndex + 1}/${freshSampleData.length}: "${recordPreview}"`);
        console.log(`[VDP-Nav] Base has placeholders: ${baseSceneRef.current?.includes('{{')}`, 'Record keys:', Object.keys(freshRecord).slice(0, 5));

        const baseScene = JSON.parse(baseSceneRef.current) as PolotnoScene;
        const freshImages = projectImagesRef.current || [];
        
        const resolved = resolveVdpVariables(baseScene, {
          record: freshRecord,
          recordIndex: currentRecordIndex,
          projectImages: freshImages,
          useCachedImages: true,
        });

        // CRITICAL: Await store.loadJSON to ensure it completes before returning
        await store.loadJSON(resolved);
        
        // Restore current page dimensions after loading (loadJSON resets to scene's original size)
        if (currentWidthPx && currentHeightPx) {
          store.setSize(currentWidthPx, currentHeightPx);
          console.log(`[VDP-Nav] Restored dimensions: ${currentWidthPx}x${currentHeightPx}px`);
        }
        
        initialVdpAppliedRef.current = true;
        console.log(`[VDP-Nav] ✅ VDP resolved for record ${currentRecordIndex + 1}`);
      } catch (err) {
        console.error('[VDP-Nav] Resolution error:', err);
      }
    };

    applyVdpWithLayoutMerge();
  }, [currentRecordIndex, bootstrapStage, storeRef, baseSceneRef, initialVdpAppliedRef, allSampleDataRef, projectImagesRef]);

  // Notify parent of navigation state
  useEffect(() => {
    const allSampleData = allSampleDataRef.current || [];
    if (onRecordNavigationChange && allSampleData.length > 0) {
      onRecordNavigationChange({
        currentIndex: currentRecordIndex,
        totalRecords: allSampleData.length,
        goToNext,
        goToPrevious,
      });
    }
  }, [currentRecordIndex, goToNext, goToPrevious, onRecordNavigationChange, allSampleDataRef]);

  return {
    currentRecordIndex,
    goToNext,
    goToPrevious,
  };
}
