// =============================================================================
// DESIGN EDITOR V2 - Canvas Engine Interface
// =============================================================================
// Lightweight abstraction for the V2 editor. Engines are responsible for
// rendering a page, managing selection, and syncing back element transforms.
// =============================================================================

import type { DesignElement, DesignPage } from './types';

export interface CanvasEngineEvents {
  onSelectionChange?: (selectedIds: string[]) => void;
  onElementsChange?: (elements: DesignElement[]) => void;
}

export interface CanvasEngineOptions {
  enableGrid?: boolean;
  devicePixelRatio?: number;
}

export interface CanvasEngine {
  mount(container: HTMLDivElement, options?: CanvasEngineOptions, events?: CanvasEngineEvents): void;
  unmount(): void;
  isMounted(): boolean;

  setGrid(enabled: boolean): void;

  loadPage(page: DesignPage): void;
  getPageSnapshot(): DesignPage | null;

  addElement(element: DesignElement): void;
  updateElement(elementId: string, updates: Partial<DesignElement>): void;
  removeElement(elementId: string): void;

  getSelection(): string[];
  setSelection(elementIds: string[]): void;

  getZoom(): number;
  setZoom(zoom: number): void;
}
