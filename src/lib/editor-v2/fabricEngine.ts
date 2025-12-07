// =============================================================================
// DESIGN EDITOR V2 - Fabric.js Engine Implementation
// =============================================================================
// Minimal Fabric-based rendering for the V2 editor. This focuses on keeping
// state in sync with the document model rather than providing a full-featured
// editing surface. It can be expanded incrementally as the V2 experience grows.
// =============================================================================

import { Canvas as FabricCanvas, Rect, Ellipse, Textbox, Line, Group, ActiveSelection, Text, FabricObject } from 'fabric';
import type { CanvasEngine, CanvasEngineEvents, CanvasEngineOptions } from './engine';
import type { DesignElement, DesignPage } from './types';

const MM_TO_PX = 3.78; // Approximate conversion for screen preview

export class FabricCanvasEngine implements CanvasEngine {
  private canvas: FabricCanvas | null = null;
  private container: HTMLDivElement | null = null;
  private currentPage: DesignPage | null = null;
  private events?: CanvasEngineEvents;
  private zoom = 1;
  private showGrid = false;
  private gridGroup: Group | null = null;

  mount(container: HTMLDivElement, options?: CanvasEngineOptions, events?: CanvasEngineEvents) {
    this.container = container;
    this.events = events;
    this.showGrid = Boolean(options?.enableGrid);

    const canvasEl = document.createElement('canvas');
    canvasEl.className = 'h-full w-full';
    container.innerHTML = '';
    container.appendChild(canvasEl);

    this.canvas = new FabricCanvas(canvasEl, {
      preserveObjectStacking: true,
      selection: true
    });

    this.bindSelectionEvents();
    this.setZoom(options?.devicePixelRatio ?? 1);

    if (this.currentPage) {
      this.renderPage();
    }
  }

  unmount() {
    this.canvas?.dispose();
    this.canvas = null;
    this.container = null;
    this.gridGroup = null;
  }

  isMounted(): boolean {
    return Boolean(this.canvas);
  }

  loadPage(page: DesignPage) {
    this.currentPage = structuredClone(page);
    this.renderPage();
  }

  getPageSnapshot(): DesignPage | null {
    return this.currentPage ? structuredClone(this.currentPage) : null;
  }

  setGrid(enabled: boolean) {
    this.showGrid = enabled;
    this.renderElements();
  }

  addElement(element: DesignElement) {
    if (!this.currentPage) return;
    this.currentPage.elements = [...this.currentPage.elements, element] as DesignElement[];
    this.renderElements();
    this.events?.onElementsChange?.(this.currentPage.elements);
  }

  updateElement(elementId: string, updates: Partial<DesignElement>) {
    if (!this.currentPage) return;

    this.currentPage.elements = this.currentPage.elements.map(element =>
      element.id === elementId ? { ...element, ...updates } : element
    ) as DesignElement[];

    this.renderElements();
    this.events?.onElementsChange?.(this.currentPage.elements);
  }

  removeElement(elementId: string) {
    if (!this.currentPage) return;

    this.currentPage.elements = this.currentPage.elements.filter(el => el.id !== elementId);
    this.renderElements();
    this.events?.onElementsChange?.(this.currentPage.elements);
  }

  getSelection(): string[] {
    if (!this.canvas) return [];
    return this.canvas.getActiveObjects()
      .map(obj => (obj as FabricObject & { data?: Record<string, unknown> }).data?.id as string)
      .filter(Boolean);
  }

  setSelection(elementIds: string[]) {
    if (!this.canvas) return;

    const targets = this.canvas.getObjects().filter(obj => {
      const id = (obj as FabricObject & { data?: Record<string, unknown> }).data?.id;
      return Boolean(id && elementIds.includes(String(id)));
    });

    this.canvas.discardActiveObject();

    if (targets.length === 1) {
      this.canvas.setActiveObject(targets[0]);
    } else if (targets.length > 1) {
      const selection = new ActiveSelection(targets, { canvas: this.canvas });
      this.canvas.setActiveObject(selection);
    }

    this.canvas.requestRenderAll();
    this.events?.onSelectionChange?.(elementIds);
  }

  getZoom(): number {
    return this.zoom;
  }

  setZoom(zoom: number) {
    this.zoom = zoom;
    if (!this.canvas) return;
    this.canvas.setZoom(zoom);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  private bindSelectionEvents() {
    if (!this.canvas) return;

    const notifySelection = () => {
      const selectedIds = this.getSelection();
      this.events?.onSelectionChange?.(selectedIds);
    };

    this.canvas.on('selection:created', notifySelection);
    this.canvas.on('selection:updated', notifySelection);
    this.canvas.on('selection:cleared', () => this.events?.onSelectionChange?.([]));
  }

  private renderPage() {
    if (!this.canvas || !this.currentPage) return;

    const widthPx = this.currentPage.widthMm * MM_TO_PX * this.zoom;
    const heightPx = this.currentPage.heightMm * MM_TO_PX * this.zoom;

    this.canvas.setDimensions({ width: widthPx, height: heightPx });
    this.renderElements();
  }

  private renderElements() {
    if (!this.canvas || !this.currentPage) return;

    this.canvas.off('object:modified');
    this.canvas.clear();
    this.gridGroup = null;

    const { background } = this.currentPage;
    if (background?.color) {
      const bg = new Rect({
        left: 0,
        top: 0,
        width: this.currentPage.widthMm * MM_TO_PX,
        height: this.currentPage.heightMm * MM_TO_PX,
        fill: background.color,
        selectable: false,
        evented: false
      });
      this.canvas.add(bg);
      this.canvas.sendObjectToBack(bg);
    }

    this.drawGrid();

    this.currentPage.elements.forEach(element => {
      const fabricObject = this.createFabricObject(element);
      if (fabricObject) {
        this.canvas?.add(fabricObject);
      }
    });

    this.canvas.on('object:modified', () => {
      if (!this.canvas || !this.currentPage) return;

      this.canvas.getObjects().forEach(obj => {
        const id = (obj as FabricObject & { data?: Record<string, unknown> }).data?.id;
        if (!id) return;

        const matching = this.currentPage?.elements.find(el => el.id === id);
        if (!matching) return;

        matching.x = this.pxToMm(obj.left ?? 0);
        matching.y = this.pxToMm(obj.top ?? 0);
        matching.width = this.pxToMm(obj.width ?? 0) * (obj.scaleX ?? 1);
        matching.height = this.pxToMm(obj.height ?? 0) * (obj.scaleY ?? 1);
        matching.rotation = obj.angle;
      });

      this.events?.onElementsChange?.(this.currentPage?.elements ?? []);
    });

    this.canvas.requestRenderAll();
  }

  private drawGrid() {
    if (!this.canvas || !this.currentPage || !this.showGrid) return;

    const spacingPx = this.mmToPx(10);
    const widthPx = this.currentPage.widthMm * MM_TO_PX * this.zoom;
    const heightPx = this.currentPage.heightMm * MM_TO_PX * this.zoom;

    const lines: Line[] = [];

    for (let x = 0; x <= widthPx; x += spacingPx) {
      lines.push(
        new Line([x, 0, x, heightPx], {
          stroke: '#e5e7eb',
          strokeWidth: 1,
          selectable: false,
          evented: false,
          excludeFromExport: true
        })
      );
    }

    for (let y = 0; y <= heightPx; y += spacingPx) {
      lines.push(
        new Line([0, y, widthPx, y], {
          stroke: '#e5e7eb',
          strokeWidth: 1,
          selectable: false,
          evented: false,
          excludeFromExport: true
        })
      );
    }

    this.gridGroup = new Group(lines, {
      selectable: false,
      evented: false,
      excludeFromExport: true
    });
    (this.gridGroup as FabricObject & { data?: Record<string, unknown> }).data = { id: 'grid' };

    this.canvas.add(this.gridGroup);
    this.canvas.sendObjectToBack(this.gridGroup);
  }

  private createFabricObject(element: DesignElement): FabricObject | null {
    const baseConfig = {
      left: this.mmToPx(element.x),
      top: this.mmToPx(element.y),
      width: this.mmToPx(element.width),
      height: this.mmToPx(element.height),
      angle: element.rotation,
      selectable: !element.locked,
      opacity: element.hidden ? 0.4 : 1
    };

    let fabricObj: FabricObject | null = null;

    if (element.kind === 'text') {
      fabricObj = new Textbox(element.content || 'Text', {
        ...baseConfig,
        fontFamily: element.fontFamily,
        fontSize: element.fontSize,
        fontWeight: element.fontWeight as string,
        fill: element.color ?? '#111827',
        textAlign: element.align ?? 'left'
      });
    } else if (element.kind === 'image') {
      fabricObj = new Rect({
        ...baseConfig,
        fill: '#dbeafe',
        stroke: '#1d4ed8'
      });
    } else if (element.kind === 'shape') {
      const fill = element.fill ?? '#e5e7eb';
      const stroke = element.stroke ?? '#9ca3af';

      if (element.shape === 'ellipse') {
        fabricObj = new Ellipse({
          ...baseConfig,
          rx: this.mmToPx(element.width) / 2,
          ry: this.mmToPx(element.height) / 2,
          fill,
          stroke,
          strokeWidth: element.strokeWidth ?? 1
        });
      } else {
        fabricObj = new Rect({
          ...baseConfig,
          fill,
          stroke,
          strokeWidth: element.strokeWidth ?? 1
        });
      }
    } else {
      // Groups and frames render as outlined placeholders for now
      const outline = new Rect({
        ...baseConfig,
        fill: 'transparent',
        stroke: '#22c55e',
        strokeDashArray: [6, 4]
      });

      const label = new Text(element.kind.toUpperCase(), {
        left: (baseConfig.left ?? 0) + 8,
        top: (baseConfig.top ?? 0) + 8,
        fontSize: 12,
        fill: '#22c55e',
        selectable: false,
        evented: false
      });

      fabricObj = new Group([outline, label], {
        ...baseConfig,
        subTargetCheck: false
      });
    }

    if (fabricObj) {
      (fabricObj as FabricObject & { data?: Record<string, unknown> }).data = { id: element.id };
    }

    return fabricObj;
  }

  private mmToPx(value: number): number {
    return value * MM_TO_PX * this.zoom;
  }

  private pxToMm(value: number): number {
    return value / (MM_TO_PX * this.zoom);
  }
}
