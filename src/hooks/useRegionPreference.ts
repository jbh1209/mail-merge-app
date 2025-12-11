import { useMemo } from "react";

export function useRegionPreference() {
  const isUS = useMemo(() => {
    const lang = navigator.language || '';
    return lang.includes('US') || lang === 'en';
  }, []);

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
    return `${widthMm.toFixed(1)}mm × ${heightMm.toFixed(1)}mm`;
  };

  return { isUS, formatDimension, formatDimensions };
}
