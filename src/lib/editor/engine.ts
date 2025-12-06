// ============================================================================
// DESIGN EDITOR FOUNDATION - Canvas Engine Interface
// ============================================================================
// This interface defines the contract that any canvas rendering engine must
// implement. Currently we use Fabric.js, but this abstraction allows for
// potential future engine swaps without changing the rest of the application.
// ============================================================================

import type { DesignPage, DesignElement, PrintConfig } from './types';

/**
 * Selection change event data
 */
export interface SelectionChangeEvent {
  selectedIds: string[];
  elements: DesignElement[];
}

/**
 * Element change event data
 */
export interface ElementChangeEvent {
  type: 'add' | 'update' | 'remove' | 'reorder';
  elementIds: string[];
  elements: DesignElement[];
}

/**
 * Export options for canvas output
 */
export interface ExportOptions {
  format: 'svg' | 'png' | 'jpeg';
  multiplier?: number;       // For raster formats, e.g., 3 for 300 DPI
  quality?: number;          // For JPEG, 0-1
  backgroundColor?: string;  // Override background color
}

/**
 * SVG export result with metadata
 */
export interface SVGExportResult {
  svg: string;               // SVG string content
  width: number;             // Width in mm
  height: number;            // Height in mm
  fonts: string[];           // Font families used
}

/**
 * Raster export result
 */
export interface RasterExportResult {
  dataUrl: string;           // Base64 data URL
  width: number;             // Width in pixels
  height: number;            // Height in pixels
  format: 'png' | 'jpeg';
}

/**
 * Zoom preset values
 */
export type ZoomPreset = 'fit' | 'fill' | 'actual' | 50 | 75 | 100 | 150 | 200 | 300 | 400;

/**
 * Canvas engine interface
 * 
 * Any rendering engine (Fabric.js, Konva, custom WebGL, etc.) must implement
 * this interface to be usable with the design editor.
 */
export interface CanvasEngine {
  // ===========================================================================
  // LIFECYCLE
  // ===========================================================================
  
  /**
   * Mount the canvas engine to a DOM container
   * @param container - The HTML element to mount to
   * @param options - Optional initialization options
   */
  mount(container: HTMLDivElement, options?: CanvasEngineOptions): void;
  
  /**
   * Unmount and cleanup the canvas engine
   */
  unmount(): void;
  
  /**
   * Check if engine is currently mounted
   */
  isMounted(): boolean;

  // ===========================================================================
  // PAGE OPERATIONS
  // ===========================================================================
  
  /**
   * Load a design page into the canvas
   * @param page - The page to load
   * @param data - Optional sample data for VDP preview
   * @param recordIndex - Which data record to display (for sequence numbering)
   */
  loadPage(page: DesignPage, data?: Record<string, unknown>, recordIndex?: number): void;
  
  /**
   * Get the current page state (with all element positions/sizes)
   */
  getPageSnapshot(): DesignPage;
  
  /**
   * Update sample data for VDP preview
   * @param data - New sample data
   * @param recordIndex - Which data record to display
   */
  updateData(data: Record<string, unknown>, recordIndex?: number): void;

  // ===========================================================================
  // ELEMENT OPERATIONS
  // ===========================================================================
  
  /**
   * Add an element to the canvas
   * @param element - Element to add
   */
  addElement(element: DesignElement): void;
  
  /**
   * Update an existing element
   * @param elementId - ID of element to update
   * @param updates - Partial element updates
   */
  updateElement(elementId: string, updates: Partial<DesignElement>): void;
  
  /**
   * Remove an element from the canvas
   * @param elementId - ID of element to remove
   */
  removeElement(elementId: string): void;
  
  /**
   * Get an element by ID
   * @param elementId - ID of element to get
   */
  getElement(elementId: string): DesignElement | null;
  
  /**
   * Get all elements on the canvas
   */
  getAllElements(): DesignElement[];
  
  /**
   * Reorder elements (change z-index)
   * @param elementIds - Element IDs in new order (first = back, last = front)
   */
  reorderElements(elementIds: string[]): void;

  // ===========================================================================
  // SELECTION
  // ===========================================================================
  
  /**
   * Get currently selected element IDs
   */
  getSelection(): string[];
  
  /**
   * Set selection to specific elements
   * @param elementIds - IDs of elements to select
   */
  setSelection(elementIds: string[]): void;
  
  /**
   * Clear all selection
   */
  clearSelection(): void;
  
  /**
   * Select all elements
   */
  selectAll(): void;
  
  /**
   * Subscribe to selection changes
   * @param callback - Called when selection changes
   * @returns Unsubscribe function
   */
  onSelectionChange(callback: (event: SelectionChangeEvent) => void): () => void;

  // ===========================================================================
  // ZOOM & PAN
  // ===========================================================================
  
  /**
   * Get current zoom level (1 = 100%)
   */
  getZoom(): number;
  
  /**
   * Set zoom level
   * @param factor - Zoom factor (1 = 100%, 2 = 200%, etc.)
   */
  setZoom(factor: number): void;
  
  /**
   * Set zoom to a preset value
   * @param preset - Preset zoom value
   */
  setZoomPreset(preset: ZoomPreset): void;
  
  /**
   * Zoom in by one step
   */
  zoomIn(): void;
  
  /**
   * Zoom out by one step
   */
  zoomOut(): void;
  
  /**
   * Zoom to fit the page in the viewport
   */
  zoomToFit(): void;
  
  /**
   * Zoom to show actual size (100%)
   */
  zoomToActual(): void;
  
  /**
   * Pan the canvas
   * @param deltaX - Horizontal pan in pixels
   * @param deltaY - Vertical pan in pixels
   */
  pan(deltaX: number, deltaY: number): void;
  
  /**
   * Reset pan to center the page
   */
  resetPan(): void;

  // ===========================================================================
  // GRID & SNAPPING
  // ===========================================================================
  
  /**
   * Enable/disable grid display
   * @param enabled - Whether to show grid
   */
  setGridEnabled(enabled: boolean): void;
  
  /**
   * Set grid size
   * @param sizeMm - Grid spacing in millimeters
   */
  setGridSize(sizeMm: number): void;
  
  /**
   * Enable/disable snap to grid
   * @param enabled - Whether to snap to grid
   */
  setSnapToGrid(enabled: boolean): void;
  
  /**
   * Enable/disable snap to other elements
   * @param enabled - Whether to snap to elements
   */
  setSnapToElements(enabled: boolean): void;

  // ===========================================================================
  // EXPORT
  // ===========================================================================
  
  /**
   * Export canvas as SVG (for PDF generation)
   * This is the primary export method for print output.
   */
  toSVG(): SVGExportResult;
  
  /**
   * Export canvas as raster image
   * @param options - Export options
   */
  toRaster(options: ExportOptions): RasterExportResult;
  
  /**
   * Export canvas as data URL (convenience method)
   * @param format - Image format
   * @param multiplier - Resolution multiplier
   */
  toDataURL(format?: 'png' | 'jpeg', multiplier?: number): string;

  // ===========================================================================
  // HISTORY (UNDO/REDO)
  // ===========================================================================
  
  /**
   * Undo last action
   */
  undo(): void;
  
  /**
   * Redo last undone action
   */
  redo(): void;
  
  /**
   * Check if undo is available
   */
  canUndo(): boolean;
  
  /**
   * Check if redo is available
   */
  canRedo(): boolean;
  
  /**
   * Clear history
   */
  clearHistory(): void;

  // ===========================================================================
  // EVENTS
  // ===========================================================================
  
  /**
   * Subscribe to page/element changes
   * @param callback - Called when page content changes
   * @returns Unsubscribe function
   */
  onPageChange(callback: (page: DesignPage) => void): () => void;
  
  /**
   * Subscribe to element changes
   * @param callback - Called when elements are added/updated/removed
   * @returns Unsubscribe function
   */
  onElementChange(callback: (event: ElementChangeEvent) => void): () => void;
  
  /**
   * Subscribe to zoom changes
   * @param callback - Called when zoom changes
   * @returns Unsubscribe function
   */
  onZoomChange(callback: (zoom: number) => void): () => void;
}

/**
 * Options for canvas engine initialization
 */
export interface CanvasEngineOptions {
  // Initial page to load
  page?: DesignPage;
  
  // Initial zoom level
  zoom?: number;
  
  // Grid settings
  showGrid?: boolean;
  gridSizeMm?: number;
  
  // Snapping
  snapToGrid?: boolean;
  snapToElements?: boolean;
  
  // Initial sample data for VDP preview
  sampleData?: Record<string, unknown>;
  recordIndex?: number;
  
  // Background color for canvas area (outside page)
  canvasBackground?: string;
  
  // Page shadow/border styling
  showPageShadow?: boolean;
  showPageBorder?: boolean;
}

/**
 * Default engine options
 */
export const DEFAULT_ENGINE_OPTIONS: CanvasEngineOptions = {
  zoom: 1,
  showGrid: true,
  gridSizeMm: 1,
  snapToGrid: true,
  snapToElements: true,
  canvasBackground: '#e5e5e5',  // Gray background like Polotno
  showPageShadow: true,
  showPageBorder: true
};
