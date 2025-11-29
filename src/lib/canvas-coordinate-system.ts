/**
 * Centralized coordinate system for canvas operations
 * Handles conversion between millimeters and pixels using Fabric.js best practices
 */

import { FieldConfig } from './canvas-utils';

export const CoordinateSystem = {
  // Standard conversion: 96 DPI = 3.7795 px/mm
  DPI: 96,
  PX_PER_MM: 3.7795,

  /**
   * Convert millimeters to pixels
   */
  mmToPx: (mm: number, scale: number = 1): number => {
    return mm * CoordinateSystem.PX_PER_MM * scale;
  },

  /**
   * Convert pixels to millimeters
   */
  pxToMm: (px: number, scale: number = 1): number => {
    return px / (CoordinateSystem.PX_PER_MM * scale);
  },

  /**
   * Convert FieldConfig position/size from mm to px
   */
  fieldConfigToPx: (
    config: FieldConfig,
    scale: number = 1
  ): {
    position: { x: number; y: number };
    size: { width: number; height: number };
  } => {
    return {
      position: {
        x: CoordinateSystem.mmToPx(config.position.x, scale),
        y: CoordinateSystem.mmToPx(config.position.y, scale),
      },
      size: {
        width: CoordinateSystem.mmToPx(config.size.width, scale),
        height: CoordinateSystem.mmToPx(config.size.height, scale),
      },
    };
  },

  /**
   * Convert template dimensions from mm to px
   */
  templateSizeToPx: (
    size: { width: number; height: number },
    scale: number = 1
  ): { width: number; height: number } => {
    return {
      width: CoordinateSystem.mmToPx(size.width, scale),
      height: CoordinateSystem.mmToPx(size.height, scale),
    };
  },
};
