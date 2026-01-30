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
          initialVdpAppliedRef.current = true;
          console.log('✅ Loaded scene with VDP resolution for first record');
        } else {
          console.log('[B1] Loading scene without VDP');
          store.loadJSON(JSON.parse(initialScene));
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
  useEffect(() => {
    if (!storeRef.current || !baseSceneRef.current) return;

    const sampleData = allSampleDataRef.current || [];
    const images = projectImagesRef.current || [];

    if (sampleData.length === 0) return;

    const currentRecord = sampleData[currentRecordIndex];
    if (!currentRecord) return;

    // Skip if data changed but not record index
    if (initialVdpAppliedRef.current && prevRecordIndexRef.current === currentRecordIndex) {
      console.log('⏭️ Skipping VDP re-resolution (data changed, not record index)');
      return;
    }

    const applyVdpWithLayoutMerge = async () => {
      const store = storeRef.current;

      console.log(`🔄 VDP Effect: currentRecord=${currentRecordIndex}, prevRecord=${prevRecordIndexRef.current}`);

      // Merge layout changes before switching records
      if (prevRecordIndexRef.current !== currentRecordIndex && initialVdpAppliedRef.current) {
        try {
          const currentSceneJson = saveScene(store);
          const currentScene = JSON.parse(currentSceneJson) as PolotnoScene;
          const baseScene = JSON.parse(baseSceneRef.current) as PolotnoScene;

          const elementCountBefore = baseScene.pages[0]?.children?.length || 0;
          const capturedCount = currentScene.pages[0]?.children?.length || 0;
          console.log(`📸 Captured ${capturedCount} elements from store before merge`);

          const mergedTemplate = mergeLayoutToBase(currentScene, baseScene);
          baseSceneRef.current = JSON.stringify(mergedTemplate);

          const elementCountAfter = mergedTemplate.pages[0]?.children?.length || 0;
          console.log(`📐 Merge: ${elementCountBefore} base → ${elementCountAfter} merged`);
        } catch (mergeErr) {
          console.warn('Layout merge error:', mergeErr);
        }
      }

      prevRecordIndexRef.current = currentRecordIndex;

      // Warm cache for adjacent records
      if (images.length > 0) {
        await warmCacheForAdjacentRecords(currentRecordIndex, sampleData, images);
      }

      try {
        // Re-capture record data to avoid stale closure
        const freshSampleData = allSampleDataRef.current || [];
        const freshRecord = freshSampleData[currentRecordIndex];

        if (!freshRecord) {
          console.warn(`❌ No record found at index ${currentRecordIndex}`);
          return;
        }

        const recordPreview = freshRecord['Name'] || freshRecord['Full Name'] || freshRecord[Object.keys(freshRecord)[0]];
        console.log(`🔄 VDP resolving for record ${currentRecordIndex + 1}:`, {
          recordPreview,
          totalRecords: freshSampleData.length,
          baseHasPlaceholders: baseSceneRef.current?.includes('{{'),
        });

        const baseScene = JSON.parse(baseSceneRef.current) as PolotnoScene;
        const resolved = resolveVdpVariables(baseScene, {
          record: freshRecord,
          recordIndex: currentRecordIndex,
          projectImages: images,
          useCachedImages: true,
        });

        // CRITICAL: Await store.loadJSON
        await store.loadJSON(resolved);
        initialVdpAppliedRef.current = true;
        console.log(`✅ VDP resolved for record ${currentRecordIndex + 1}`);
      } catch (err) {
        console.warn('VDP resolution error:', err);
      }
    };

    applyVdpWithLayoutMerge();
  }, [currentRecordIndex, storeRef, baseSceneRef, initialVdpAppliedRef, allSampleDataRef, projectImagesRef]);

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
