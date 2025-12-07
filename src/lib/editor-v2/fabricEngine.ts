// =============================================================================
// DESIGN EDITOR V2 - Fabric.js v6 Engine Implementation
// =============================================================================
// Fabric-based canvas rendering engine compatible with Fabric.js v6 API.
// Manages rendering, selection, and element synchronization.
// =============================================================================

import { Canvas, Rect, Ellipse, Textbox, Line, Group, ActiveSelection, FabricObject } from 'fabric';
import type { CanvasEngine, CanvasEngineEvents, CanvasEngineOptions } from './engine';
import type { DesignElement, DesignPage } from './types';

const MM_TO_PX = 3.78; // Approximate conversion for screen preview

// WeakMap to track element IDs since Fabric v6 doesn't support arbitrary data properties
const objectIdMap = new WeakMap<FabricObject, string>();

export class FabricCanvasEngine implements CanvasEngine {
  private canvas: Canvas | null = null;
  private container: HTMLDivElement | null = null;
  private currentPage: DesignPage | null = null;
  private events?: CanvasEngineEvents;
  private zoom = 1;
  private showGrid = false;
  private gridObjects: FabricObject[] = [];

  mount(container: HTMLDivElement, options?: CanvasEngineOptions, events?: CanvasEngineEvents) {
    this.container = container;
    this.events = events;
    this.showGrid = Boolean(options?.enableGrid);

    const canvasEl = document.createElement('canvas');
    container.innerHTML = '';
    container.appendChild(canvasEl);

    // Set initial size based on container
    const rect = container.getBoundingClientRect();
    
    this.canvas = new Canvas(canvasEl, {
      width: rect.width || 800,
      height: rect.height || 600,
      preserveObjectStacking: true,
      selection: true,
      backgroundColor: '#f8fafc'
    });

    this.bindSelectionEvents();
    this.bindModificationEvents();
    this.setZoom(options?.devicePixelRatio ?? 1);

    if (this.currentPage) {
      this.renderPage();
    }
  }

  unmount() {
    this.canvas?.dispose();
    this.canvas = null;
    this.container = null;
    this.gridObjects = [];
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
    this.currentPage.elements = [...this.currentPage.elements, element];
    this.renderElements();
    this.events?.onElementsChange?.(this.currentPage.elements);
  }

  updateElement(elementId: string, updates: Partial<DesignElement>) {
    if (!this.currentPage) return;

    this.currentPage.elements = this.currentPage.elements.map(element =>
      element.id === elementId ? { ...element, ...updates } as DesignElement : element
    );

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
      .map(obj => objectIdMap.get(obj))
      .filter((id): id is string => Boolean(id));
  }

  setSelection(elementIds: string[]) {
    if (!this.canvas) return;

    const targets = this.canvas.getObjects().filter(obj => {
      const id = objectIdMap.get(obj);
      return Boolean(id && elementIds.includes(id));
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
    if (this.currentPage) {
      this.renderPage();
    }
  }

  // ---------------------------------------------------------------------------
  // Event Bindings
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

  private bindModificationEvents() {
    if (!this.canvas) return;

    this.canvas.on('object:modified', () => {
      if (!this.canvas || !this.currentPage) return;

      this.canvas.getObjects().forEach(obj => {
        const id = objectIdMap.get(obj);
        if (!id) return;

        const matching = this.currentPage?.elements.find(el => el.id === id);
        if (!matching) return;

        matching.x = this.pxToMm(obj.left ?? 0);
        matching.y = this.pxToMm(obj.top ?? 0);
        matching.width = this.pxToMm((obj.width ?? 0) * (obj.scaleX ?? 1));
        matching.height = this.pxToMm((obj.height ?? 0) * (obj.scaleY ?? 1));
        matching.rotation = obj.angle;
      });

      this.events?.onElementsChange?.(this.currentPage?.elements ?? []);
    });
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------
  private renderPage() {
    if (!this.canvas || !this.currentPage) return;

    const widthPx = this.mmToPx(this.currentPage.widthMm);
    const heightPx = this.mmToPx(this.currentPage.heightMm);

    this.canvas.setDimensions({ width: widthPx, height: heightPx });
    this.renderElements();
  }

  private renderElements() {
    if (!this.canvas || !this.currentPage) return;

    // Store current selection
    const selectedIds = this.getSelection();
    
    this.canvas.clear();
    this.gridObjects = [];

    // Draw page background
    const { background } = this.currentPage;
    const bgRect = new Rect({
      left: 0,
      top: 0,
      width: this.mmToPx(this.currentPage.widthMm),
      height: this.mmToPx(this.currentPage.heightMm),
      fill: background?.color ?? '#ffffff',
      selectable: false,
      evented: false
    });
    this.canvas.add(bgRect);
    this.canvas.sendObjectToBack(bgRect);

    // Draw grid
    if (this.showGrid) {
      this.drawGrid();
    }

    // Render elements
    this.currentPage.elements.forEach(element => {
      const fabricObject = this.createFabricObject(element);
      if (fabricObject) {
        objectIdMap.set(fabricObject, element.id);
        this.canvas?.add(fabricObject);
      }
    });

    // Restore selection
    if (selectedIds.length > 0) {
      this.setSelection(selectedIds);
    }

    this.canvas.requestRenderAll();
  }

  private drawGrid() {
    if (!this.canvas || !this.currentPage) return;

    const spacingPx = this.mmToPx(10);
    const widthPx = this.mmToPx(this.currentPage.widthMm);
    const heightPx = this.mmToPx(this.currentPage.heightMm);

    // Vertical lines
    for (let x = 0; x <= widthPx; x += spacingPx) {
      const line = new Line([x, 0, x, heightPx], {
        stroke: '#e5e7eb',
        strokeWidth: 1,
        selectable: false,
        evented: false,
        excludeFromExport: true
      });
      this.canvas.add(line);
      this.gridObjects.push(line);
    }

    // Horizontal lines
    for (let y = 0; y <= heightPx; y += spacingPx) {
      const line = new Line([0, y, widthPx, y], {
        stroke: '#e5e7eb',
        strokeWidth: 1,
        selectable: false,
        evented: false,
        excludeFromExport: true
      });
      this.canvas.add(line);
      this.gridObjects.push(line);
    }

    // Send grid to back
    this.gridObjects.forEach(line => {
      this.canvas?.sendObjectToBack(line);
    });
  }

  private createFabricObject(element: DesignElement): FabricObject | null {
    const left = this.mmToPx(element.x);
    const top = this.mmToPx(element.y);
    const width = this.mmToPx(element.width);
    const height = this.mmToPx(element.height);
    const angle = element.rotation ?? 0;
    const selectable = !element.locked;
    const opacity = element.hidden ? 0.4 : 1;

    if (element.kind === 'text') {
      const textbox = new Textbox(element.content || 'Text', {
        left,
        top,
        width,
        angle,
        selectable,
        opacity,
        fontFamily: element.fontFamily,
        fontSize: element.fontSize,
        fontWeight: element.fontWeight as string,
        fill: element.color ?? '#111827',
        textAlign: element.align ?? 'left'
      });
      return textbox;
    }

    if (element.kind === 'image') {
      // Placeholder for images
      const placeholder = new Rect({
        left,
        top,
        width,
        height,
        angle,
        selectable,
        opacity,
        fill: '#dbeafe',
        stroke: '#1d4ed8',
        strokeWidth: 1
      });
      return placeholder;
    }

    if (element.kind === 'shape') {
      const fill = element.fill ?? '#e5e7eb';
      const stroke = element.stroke ?? '#9ca3af';
      const strokeWidth = element.strokeWidth ?? 1;

      if (element.shape === 'ellipse') {
        return new Ellipse({
          left,
          top,
          rx: width / 2,
          ry: height / 2,
          angle,
          selectable,
          opacity,
          fill,
          stroke,
          strokeWidth
        });
      }

      return new Rect({
        left,
        top,
        width,
        height,
        angle,
        selectable,
        opacity,
        fill,
        stroke,
        strokeWidth
      });
    }

    // Groups and frames render as outlined placeholders
    const outline = new Rect({
      left: 0,
      top: 0,
      width,
      height,
      fill: 'transparent',
      stroke: '#22c55e',
      strokeDashArray: [6, 4]
    });

    const label = new Textbox(element.kind.toUpperCase(), {
      left: 8,
      top: 8,
      fontSize: 12,
      fill: '#22c55e',
      selectable: false,
      evented: false
    });

    const group = new Group([outline, label], {
      left,
      top,
      angle,
      selectable,
      opacity,
      subTargetCheck: false
    });

    return group;
  }

  // ---------------------------------------------------------------------------
  // Unit Conversion
  // ---------------------------------------------------------------------------
  private mmToPx(value: number): number {
    return value * MM_TO_PX * this.zoom;
  }

  private pxToMm(value: number): number {
    return value / (MM_TO_PX * this.zoom);
  }
}