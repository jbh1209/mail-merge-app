import { useMemo } from "react";

export type TemplateRegion = 'US' | 'EU' | null | undefined;

export function useRegionPreference(templateRegion?: TemplateRegion) {
  const isUS = useMemo(() => {
    // Template region takes priority over browser locale
    if (templateRegion === 'US') return true;
    if (templateRegion === 'EU') return false;
    // Fallback to browser locale
    const lang = navigator.language || '';
    return lang.includes('US') || lang === 'en';
  }, [templateRegion]);

  const formatDimension = (mm: number) => {
    if (isUS) {
      return `${(mm / 25.4).toFixed(2)}"`;
    }
    return `${mm.toFixed(1)}mm`;
  };

  const formatDimensions = (widthMm: number, heightMm: number) => {
    if (isUS) {
      return `${(widthMm / 25.4).toFixed(2)}" × ${(heightMm / 25.4).toFixed(2)}"`;
    }
    return `${widthMm.toFixed(1)} × ${heightMm.toFixed(1)}mm`;
  };

  return { isUS, formatDimension, formatDimensions };
}
