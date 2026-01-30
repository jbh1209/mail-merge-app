/**
 * useLayoutGenerator Hook
 * 
 * Handles AI-assisted layout generation for Polotno:
 * - Calls generate-layout edge function
 * - Applies layout with font scaling
 * - Manages fallback layouts
 * - Supports layout regeneration
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { saveScene } from '@/vendor/polotno-runtime.js';
import { supabase } from '@/integrations/supabase/client';
import { 
  resolveVdpVariables, 
  prefetchImagesForRecords,
  findImageUrl,
} from '@/lib/polotno/vdpResolver';
import type { PolotnoScene } from '@/lib/polotno/types';
import { mmToPixels as runtimeMmToPixels } from '@/vendor/polotno-runtime.js';

const mmToPixels = (mm: number, dpi = 300) => runtimeMmToPixels(mm, dpi);
const POLOTNO_DPI = 300;
const ptToPx = (pt: number): number => pt * (POLOTNO_DPI / 72);

// Layout spec from AI
interface LayoutSpec {
  layoutType: 'split_text_left_image_right' | 'text_only_combined' | 'text_only_stacked' | 'split_image_left_text_right' | 'hero_image_top';
  useCombinedTextBlock?: boolean;
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
  } | null;
  images?: Array<{
    fieldName: string;
    aspectRatio: { width: number; height: number };
  }>;
  textFields?: string[];
  typography?: {
    baseFontScale: 'fill' | 'large' | 'medium' | 'small';
    primaryFieldIndex?: number;
    alignment?: 'left' | 'center';
  };
  gap?: number;
}

export interface UseLayoutGeneratorOptions {
  storeRef: React.MutableRefObject<any>;
  baseSceneRef: React.MutableRefObject<string>;
  lastSavedSceneRef: React.MutableRefObject<string>;
  initialVdpAppliedRef: React.MutableRefObject<boolean>;
  layoutGeneratedRef: React.MutableRefObject<boolean>;
  availableFields: string[];
  allSampleData: Record<string, string>[];
  projectImages: { name: string; url: string }[];
  labelWidth: number;
  labelHeight: number;
  projectType: string;
  initialScene?: string;
  bootstrapStage: string;
  onSave?: (scene: string) => void;
}

export interface UseLayoutGeneratorResult {
  layoutStatus: string | null;
  regenerateLayout: () => Promise<void>;
}

/**
 * Detect image columns from field values
 */
function detectImageColumnsFromValues(
  fields: string[],
  sampleRows: Record<string, string>[]
): string[] {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'];
  const imageFields: string[] = [];

  for (const field of fields) {
    const lowerName = field.toLowerCase();
    if (lowerName.includes('image') || lowerName.includes('photo') ||
        lowerName.includes('logo') || lowerName.includes('picture') ||
        lowerName.includes('img') || lowerName.includes('avatar')) {
      imageFields.push(field);
      continue;
    }

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
  if (name.includes('logo') || name.includes('avatar') || name.includes('icon') || name.includes('qr')) {
    return { width: 1, height: 1 };
  }
  return { width: 3, height: 2 };
}

/**
 * Calculate image dimensions preserving aspect ratio
 */
function calculateImageDimensions(
  aspectRatio: { width: number; height: number },
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  const aspectW = aspectRatio.width / aspectRatio.height;

  let width = maxWidth;
  let height = width / aspectW;

  if (height > maxHeight) {
    height = maxHeight;
    width = height * aspectW;
  }

  return { width, height };
}

/**
 * Calculate font size that fills available space
 */
function calculateFillFontSize(
  text: string,
  containerWidthMm: number,
  containerHeightMm: number,
  fontFamily: string = 'Roboto',
  maxFontPt: number = 72,
  minFontPt: number = 10
): number {
  if (!text || text.trim() === '') return maxFontPt;

  const lines = text.split('\n').filter(l => l.trim() !== '');
  if (lines.length === 0) return maxFontPt;

  const DPI = 300;
  const containerWidthPx = (containerWidthMm / 25.4) * DPI;
  const containerHeightPx = (containerHeightMm / 25.4) * DPI;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    const lineCount = lines.length;
    const maxLineLength = Math.max(...lines.map(l => l.length), 1);
    const fontForWidth = (containerWidthMm / (maxLineLength * 0.55)) * 2.83;
    const fontForHeight = (containerHeightMm / (lineCount * 1.3)) * 2.83;
    return Math.max(Math.min(fontForWidth, fontForHeight, maxFontPt), minFontPt);
  }

  const lineHeightFactor = 1.3;

  let low = minFontPt;
  let high = maxFontPt;
  let bestFit = minFontPt;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const fontSizePx = mid * (DPI / 72);

    ctx.font = `${fontSizePx}px ${fontFamily}`;

    let maxLineWidth = 0;
    for (const line of lines) {
      const metrics = ctx.measureText(line);
      maxLineWidth = Math.max(maxLineWidth, metrics.width);
    }

    const totalHeight = lines.length * fontSizePx * lineHeightFactor;

    if (maxLineWidth <= containerWidthPx && totalHeight <= containerHeightPx) {
      bestFit = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return bestFit;
}

/**
 * Apply AI-generated layout
 */
function applyAILayout(
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
  if (!page) return null;

  const hasImages = imageFields.length > 0 && layoutSpec.imageArea;
  const useCombined = layoutSpec.useCombinedTextBlock ?? textFields.length >= 3;
  const alignment = layoutSpec.typography?.alignment || 'left';
  const baseFontScale = (layoutSpec.typography?.baseFontScale || 'fill') as string;

  const fontScaleLimits: Record<string, { maxPt: number; multiplier: number }> = {
    'fill': { maxPt: 60, multiplier: 1.0 },
    'large': { maxPt: 48, multiplier: 0.85 },
    'medium': { maxPt: 36, multiplier: 0.70 },
    'restrained': { maxPt: 28, multiplier: 0.55 },
    'small': { maxPt: 22, multiplier: 0.45 },
  };

  const scaleConfig = fontScaleLimits[baseFontScale] || fontScaleLimits['medium'];

  const textAreaX = widthMm * layoutSpec.textArea.xPercent;
  const textAreaY = heightMm * layoutSpec.textArea.yPercent;
  const textAreaWidth = widthMm * layoutSpec.textArea.widthPercent;
  const textAreaHeight = heightMm * layoutSpec.textArea.heightPercent;

  if (textFields.length > 0) {
    if (useCombined) {
      const combinedText = textFields.map(f => `{{${f}}}`).join('\n');
      const sampleText = textFields.map(f => sampleData[f] || f).join('\n');
      const rawFontSize = calculateFillFontSize(sampleText, textAreaWidth, textAreaHeight, 'Roboto', scaleConfig.maxPt, 14);
      const fontSize = Math.min(rawFontSize * scaleConfig.multiplier, scaleConfig.maxPt);

      page.addElement({
        type: 'text',
        x: mmToPixels(textAreaX),
        y: mmToPixels(textAreaY),
        width: mmToPixels(textAreaWidth),
        height: mmToPixels(textAreaHeight),
        text: combinedText,
        fontSize: ptToPx(fontSize),
        fontFamily: 'Roboto',
        fontWeight: 'normal',
        align: alignment,
        verticalAlign: 'middle',
        lineHeight: 1.3,
        custom: {
          variable: textFields.join(','),
          isCombinedBlock: true,
          templateElementId: crypto.randomUUID(),
        },
      });
    } else {
      const fieldCount = textFields.length;
      const isRestrained = baseFontScale === 'restrained' || baseFontScale === 'small';
      const gapMm = isRestrained
        ? Math.min(4, textAreaHeight * 0.08)
        : Math.min(2, textAreaHeight * 0.05);
      const fieldHeight = (textAreaHeight - (fieldCount - 1) * gapMm) / fieldCount;
      const stackedMaxPt = Math.min(scaleConfig.maxPt, 48);

      textFields.forEach((field, index) => {
        const fieldY = textAreaY + index * (fieldHeight + gapMm);
        const sampleText = sampleData[field] || field;
        const rawFontSize = calculateFillFontSize(sampleText, textAreaWidth, fieldHeight, 'Roboto', stackedMaxPt, 12);
        const fontSize = Math.min(rawFontSize * scaleConfig.multiplier, stackedMaxPt);

        page.addElement({
          type: 'text',
          x: mmToPixels(textAreaX),
          y: mmToPixels(fieldY),
          width: mmToPixels(textAreaWidth),
          height: mmToPixels(fieldHeight),
          text: `{{${field}}}`,
          fontSize: ptToPx(fontSize),
          fontFamily: 'Roboto',
          fontWeight: index === 0 ? 'bold' : 'normal',
          align: alignment,
          verticalAlign: 'middle',
          custom: {
            variable: field,
            templateElementId: crypto.randomUUID(),
          },
        });
      });
    }
  }

  if (hasImages && layoutSpec.imageArea) {
    const imageAreaX = widthMm * layoutSpec.imageArea.xPercent;
    const imageAreaY = heightMm * layoutSpec.imageArea.yPercent;
    const imageAreaWidth = widthMm * layoutSpec.imageArea.widthPercent;
    const imageAreaHeight = heightMm * layoutSpec.imageArea.heightPercent;

    imageFields.forEach((imageField, index) => {
      const imageConfig = layoutSpec.images?.find(i => i.fieldName === imageField);
      const aspectRatio = imageConfig?.aspectRatio || inferImageAspectRatio(imageField);

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
    });
  }

  return finalizeLayout(store, page);
}

/**
 * Smart fallback layout
 */
function applySmartFallbackLayout(
  store: any,
  textFields: string[],
  imageFields: string[],
  sampleData: Record<string, string>,
  widthMm: number,
  heightMm: number,
  projectImages: { name: string; url: string }[]
): string | null {
  const page = store.activePage;
  if (!page) return null;

  const hasImages = imageFields.length > 0;
  const useCombined = textFields.length >= 3;

  const margin = 0.04;
  const marginMm = widthMm * margin;

  const textWidthPercent = hasImages ? 0.55 : 0.92;
  const textAreaX = marginMm;
  const textAreaY = marginMm;
  const textAreaWidth = (widthMm - 2 * marginMm) * textWidthPercent;
  const textAreaHeight = heightMm - 2 * marginMm;

  if (textFields.length > 0) {
    if (useCombined) {
      const combinedText = textFields.map(f => `{{${f}}}`).join('\n');
      const sampleText = textFields.map(f => sampleData[f] || f).join('\n');
      const fontSize = calculateFillFontSize(sampleText, textAreaWidth, textAreaHeight, 'Roboto', 60, 14);

      page.addElement({
        type: 'text',
        x: mmToPixels(textAreaX),
        y: mmToPixels(textAreaY),
        width: mmToPixels(textAreaWidth),
        height: mmToPixels(textAreaHeight),
        text: combinedText,
        fontSize: ptToPx(fontSize),
        fontFamily: 'Roboto',
        align: 'left',
        verticalAlign: 'middle',
        lineHeight: 1.3,
        custom: {
          variable: textFields.join(','),
          isCombinedBlock: true,
          templateElementId: crypto.randomUUID(),
        },
      });
    } else {
      const fieldCount = textFields.length;
      const gapMm = Math.min(2, textAreaHeight * 0.05);
      const fieldHeight = (textAreaHeight - (fieldCount - 1) * gapMm) / fieldCount;

      textFields.forEach((field, index) => {
        const fieldY = textAreaY + index * (fieldHeight + gapMm);
        const sampleText = sampleData[field] || field;
        const fontSize = calculateFillFontSize(sampleText, textAreaWidth, fieldHeight, 'Roboto', 48, 14);

        page.addElement({
          type: 'text',
          x: mmToPixels(textAreaX),
          y: mmToPixels(fieldY),
          width: mmToPixels(textAreaWidth),
          height: mmToPixels(fieldHeight),
          text: `{{${field}}}`,
          fontSize: ptToPx(fontSize),
          fontFamily: 'Roboto',
          fontWeight: index === 0 ? 'bold' : 'normal',
          align: 'left',
          verticalAlign: 'middle',
          custom: {
            variable: field,
            templateElementId: crypto.randomUUID(),
          },
        });
      });
    }
  }

  if (hasImages) {
    const imageAreaX = marginMm + (widthMm - 2 * marginMm) * 0.60;
    const imageAreaWidth = (widthMm - 2 * marginMm) * 0.36;
    const imageAreaHeight = textAreaHeight * 0.85;
    const imageAreaY = marginMm + (textAreaHeight - imageAreaHeight) / 2;

    imageFields.forEach((imageField, index) => {
      const aspectRatio = inferImageAspectRatio(imageField);
      const imgDims = calculateImageDimensions(aspectRatio, imageAreaWidth, imageAreaHeight);

      const imageX = imageAreaX + (imageAreaWidth - imgDims.width) / 2;
      const imageY = imageAreaY + (imageAreaHeight - imgDims.height) / 2;

      const sampleValue = sampleData[imageField];
      let imageSrc = '';

      if (sampleValue) {
        const matchedUrl = findImageUrl(sampleValue, projectImages);
        imageSrc = matchedUrl || (sampleValue.startsWith('http') ? sampleValue : '');
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
    });
  }

  return finalizeLayout(store, page);
}

/**
 * Finalize layout by saving scene
 */
function finalizeLayout(store: any, page: any): string | null {
  const childCount = page.children?.length || 0;
  console.log(`📊 Page has ${childCount} elements after layout`);

  if (childCount === 0) {
    console.warn('⚠️ No elements in page after layout');
    return null;
  }

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

/**
 * Generate AI layout
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

  const sampleRows = allSampleData.length > 0 ? allSampleData : [sampleData];
  const imageFieldsDetected = detectImageColumnsFromValues(fields, sampleRows);
  console.log('🖼️ Detected image fields:', imageFieldsDetected);

  const textFields = fields.filter(f => !imageFieldsDetected.includes(f));

  try {
    const { data: hybridData, error: hybridError } = await supabase.functions.invoke('generate-layout', {
      body: {
        fieldNames: fields,
        sampleData: [sampleData],
        templateSize: { width: widthMm, height: heightMm },
        templateType: templateType || 'address_label',
      },
    });

    if (hybridError) {
      console.warn('⚠️ Layout API error:', hybridError);
      return applySmartFallbackLayout(store, textFields, imageFieldsDetected, sampleData, widthMm, heightMm, projectImages);
    }

    if (!hybridData?.designStrategy?.layoutSpec) {
      console.warn('⚠️ No layoutSpec returned');
      return applySmartFallbackLayout(store, textFields, imageFieldsDetected, sampleData, widthMm, heightMm, projectImages);
    }

    let layoutSpec = hybridData.designStrategy.layoutSpec as LayoutSpec;

    // Clamp AI layout outputs
    const hasImageFields = imageFieldsDetected.length > 0;
    if (!hasImageFields) {
      if (layoutSpec.textArea.widthPercent < 0.85) {
        layoutSpec = {
          ...layoutSpec,
          textArea: { ...layoutSpec.textArea, widthPercent: 0.90 }
        };
      }
      if (layoutSpec.textArea.heightPercent < 0.75) {
        layoutSpec = {
          ...layoutSpec,
          textArea: { ...layoutSpec.textArea, heightPercent: 0.85 }
        };
      }
    }

    return applyAILayout(store, textFields, imageFieldsDetected, layoutSpec, sampleData, widthMm, heightMm, projectImages);

  } catch (error) {
    console.error('❌ Layout generation error:', error);
    return applySmartFallbackLayout(store, textFields, imageFieldsDetected, sampleData, widthMm, heightMm, projectImages);
  }
}

export function useLayoutGenerator(options: UseLayoutGeneratorOptions): UseLayoutGeneratorResult {
  const {
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
    bootstrapStage,
    onSave,
  } = options;

  const [layoutStatus, setLayoutStatus] = useState<string | null>(null);
  const layoutInFlightRef = useRef(false);
  const onSaveRef = useRef(onSave);
  
  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);

  // Regenerate layout function
  const regenerateLayout = useCallback(async () => {
    const store = storeRef.current;
    if (!store || availableFields.length === 0 || allSampleData.length === 0) return;

    setLayoutStatus('Regenerating layout...');
    console.log('🔄 Regenerating AI layout...');

    try {
      const page = store.activePage;
      if (page) {
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

        const parsed = JSON.parse(generatedScene) as PolotnoScene;
        const resolved = resolveVdpVariables(parsed, {
          record: firstRecord,
          recordIndex: 0,
          projectImages,
          useCachedImages: true,
        });
        await store.loadJSON(resolved);

        console.log('✅ Layout regenerated successfully');
      }
    } catch (err) {
      console.error('❌ Layout regeneration failed:', err);
    } finally {
      setLayoutStatus(null);
    }
  }, [availableFields, allSampleData, labelWidth, labelHeight, projectType, projectImages, storeRef, baseSceneRef, lastSavedSceneRef]);

  // Phase B2: Generate AI Layout (for new templates)
  useEffect(() => {
    const store = storeRef.current;

    if (!store || bootstrapStage !== 'ready') return;
    if (initialScene) return; // Phase B1 handles existing scenes
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

          // Auto-save newly generated layout
          if (onSaveRef.current) {
            console.log('💾 Persisting AI-generated layout to database...');
            onSaveRef.current(generatedScene);
          }

          lastSavedSceneRef.current = generatedScene;

          // Prefetch images
          if (projectImages.length > 0) {
            console.log('📥 Prefetching project images for AI layout...');
            await prefetchImagesForRecords(allSampleData, projectImages);
          }

          // Apply VDP resolution for first record
          try {
            const parsed = JSON.parse(generatedScene) as PolotnoScene;
            const elementCount = parsed.pages?.[0]?.children?.length || 0;

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

            await store.loadJSON(resolved);
            initialVdpAppliedRef.current = true;
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
  }, [initialScene, availableFields, allSampleData, labelWidth, labelHeight, projectType, projectImages, bootstrapStage, storeRef, baseSceneRef, lastSavedSceneRef, initialVdpAppliedRef, layoutGeneratedRef]);

  return {
    layoutStatus,
    regenerateLayout,
  };
}
