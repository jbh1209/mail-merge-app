// =============================================================================
// DESIGN EDITOR V2 - Fabric.js v6 Engine Implementation
// =============================================================================
// Fabric-based canvas rendering engine compatible with Fabric.js v6 API.
// Manages rendering, selection, and element synchronization.
// =============================================================================

import { Canvas, Rect, Ellipse, Textbox, Line, Group, ActiveSelection, FabricObject, FabricImage, Shadow } from 'fabric';
import type { CanvasEngine, CanvasEngineEvents, CanvasEngineOptions } from './engine';
import type { DesignElement, DesignPage, ImageElement } from './types';

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
  private pageBackground: FabricObject | null = null;

  mount(container: HTMLDivElement, options?: CanvasEngineOptions, events?: CanvasEngineEvents) {
    this.container = container;
    this.events = events;
    this.showGrid = Boolean(options?.enableGrid);

    const canvasEl = document.createElement('canvas');
    container.innerHTML = '';
    container.appendChild(canvasEl);

    // Default size - will be updated when page loads
    this.canvas = new Canvas(canvasEl, {
      width: 800,
      height: 600,
      preserveObjectStacking: true,
      selection: true,
      backgroundColor: '#e5e7eb' // Workspace background (grey)
    });

    this.bindSelectionEvents();
    this.bindModificationEvents();

    if (this.currentPage) {
      this.renderPage();
    }
  }

  unmount() {
    this.canvas?.dispose();
    this.canvas = null;
    this.container = null;
    this.gridObjects = [];
    this.pageBackground = null;
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
    this.renderPage();
  }

  addElement(element: DesignElement) {
    if (!this.currentPage) return;
    this.currentPage.elements = [...this.currentPage.elements, element];
    this.renderPage();
    this.events?.onElementsChange?.(this.currentPage.elements);
  }

  updateElement(elementId: string, updates: Partial<DesignElement>) {
    if (!this.currentPage) return;

    this.currentPage.elements = this.currentPage.elements.map(element =>
      element.id === elementId ? { ...element, ...updates } as DesignElement : element
    );

    this.renderPage();
    this.events?.onElementsChange?.(this.currentPage.elements);
  }

  removeElement(elementId: string) {
    if (!this.currentPage) return;

    this.currentPage.elements = this.currentPage.elements.filter(el => el.id !== elementId);
    this.renderPage();
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
    this.zoom = Math.max(0.25, Math.min(4, zoom));
    if (!this.canvas) return;
    
    // Set zoom on canvas (Fabric handles the transform)
    this.canvas.setZoom(this.zoom);
    
    // Update canvas dimensions to fit zoomed content
    if (this.currentPage) {
      const widthPx = this.mmToPx(this.currentPage.widthMm);
      const heightPx = this.mmToPx(this.currentPage.heightMm);
      this.canvas.setDimensions({
        width: widthPx * this.zoom,
        height: heightPx * this.zoom
      });
    }
    
    this.canvas.requestRenderAll();
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

    // Set canvas size (accounting for zoom)
    this.canvas.setDimensions({
      width: widthPx * this.zoom,
      height: heightPx * this.zoom
    });
    this.canvas.setZoom(this.zoom);

    this.renderElements();
  }

  private renderElements() {
    if (!this.canvas || !this.currentPage) return;

    // Store current selection
    const selectedIds = this.getSelection();
    
    this.canvas.clear();
    this.gridObjects = [];
    this.pageBackground = null;

    const widthPx = this.mmToPx(this.currentPage.widthMm);
    const heightPx = this.mmToPx(this.currentPage.heightMm);

    // Draw page background (white page on grey workspace)
    const { background } = this.currentPage;
    const pageShadow = new Shadow({
      color: 'rgba(0,0,0,0.15)',
      blur: 20,
      offsetX: 0,
      offsetY: 4
    });
    
    this.pageBackground = new Rect({
      left: 0,
      top: 0,
      width: widthPx,
      height: heightPx,
      fill: background?.color ?? '#ffffff',
      selectable: false,
      evented: false,
      shadow: pageShadow
    });
    this.canvas.add(this.pageBackground);

    // Draw grid on top of background, but before elements
    if (this.showGrid) {
      this.drawGrid();
    }

    // Render elements on top
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
    for (let x = spacingPx; x < widthPx; x += spacingPx) {
      const line = new Line([x, 0, x, heightPx], {
        stroke: 'rgba(0, 0, 0, 0.08)',
        strokeWidth: 1,
        selectable: false,
        evented: false,
        excludeFromExport: true
      });
      this.canvas.add(line);
      this.gridObjects.push(line);
    }

    // Horizontal lines
    for (let y = spacingPx; y < heightPx; y += spacingPx) {
      const line = new Line([0, y, widthPx, y], {
        stroke: 'rgba(0, 0, 0, 0.08)',
        strokeWidth: 1,
        selectable: false,
        evented: false,
        excludeFromExport: true
      });
      this.canvas.add(line);
      this.gridObjects.push(line);
    }
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
      // Create placeholder rect for images (actual image loading handled separately)
      const imageElement = element as ImageElement;
      if (imageElement.src) {
        // For now, create a placeholder - async image loading would need different handling
        const placeholder = new Rect({
          left,
          top,
          width,
          height,
          angle,
          selectable,
          opacity,
          fill: '#f0f0f0',
          stroke: '#cccccc',
          strokeWidth: 1
        });
        // Load actual image asynchronously
        this.loadImageAsync(imageElement, placeholder);
        return placeholder;
      }
      // No src - show placeholder
      const placeholder = new Rect({
        left,
        top,
        width,
        height,
        angle,
        selectable,
        opacity,
        fill: '#dbeafe',
        stroke: '#3b82f6',
        strokeWidth: 2,
        strokeDashArray: [5, 5]
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

      if (element.shape === 'line') {
        return new Line([left, top, left + width, top + height], {
          stroke,
          strokeWidth: strokeWidth || 2,
          selectable,
          opacity
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

  private async loadImageAsync(element: ImageElement, placeholder: FabricObject) {
    if (!this.canvas || !element.src) return;
    
    try {
      const img = await FabricImage.fromURL(element.src, {
        crossOrigin: 'anonymous'
      });
      
      const width = this.mmToPx(element.width);
      const height = this.mmToPx(element.height);
      
      img.set({
        left: placeholder.left,
        top: placeholder.top,
        angle: placeholder.angle,
        scaleX: width / (img.width || 1),
        scaleY: height / (img.height || 1),
        selectable: !element.locked,
        opacity: element.hidden ? 0.4 : 1
      });
      
      // Replace placeholder with actual image
      this.canvas.remove(placeholder);
      objectIdMap.set(img, element.id);
      this.canvas.add(img);
      this.canvas.requestRenderAll();
    } catch (error) {
      console.warn('Failed to load image:', element.src, error);
    }
  }

  // ---------------------------------------------------------------------------
  // Unit Conversion (no zoom applied - zoom is handled by canvas.setZoom)
  // ---------------------------------------------------------------------------
  private mmToPx(value: number): number {
    return value * MM_TO_PX;
  }

  private pxToMm(value: number): number {
    return value / MM_TO_PX;
  }
}
