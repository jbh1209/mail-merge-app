 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/src/lib/editor-v2/fabricEngine.ts b/src/lib/editor-v2/fabricEngine.ts
new file mode 100644
index 0000000000000000000000000000000000000000..f253f4ab1c1647635400cc239ec70914fe6de561
--- /dev/null
+++ b/src/lib/editor-v2/fabricEngine.ts
@@ -0,0 +1,345 @@
+// =============================================================================
+// DESIGN EDITOR V2 - Fabric.js Engine Implementation
+// =============================================================================
+// Minimal Fabric-based rendering for the V2 editor. This focuses on keeping
+// state in sync with the document model rather than providing a full-featured
+// editing surface. It can be expanded incrementally as the V2 experience grows.
+// =============================================================================
+
+import { fabric } from 'fabric';
+import type { CanvasEngine, CanvasEngineEvents, CanvasEngineOptions } from './engine';
+import type { DesignElement, DesignPage } from './types';
+
+const MM_TO_PX = 3.78; // Approximate conversion for screen preview
+
+export class FabricCanvasEngine implements CanvasEngine {
+  private canvas: fabric.Canvas | null = null;
+  private container: HTMLDivElement | null = null;
+  private currentPage: DesignPage | null = null;
+  private events?: CanvasEngineEvents;
+  private zoom = 1;
+  private showGrid = false;
+  private gridGroup: fabric.Group | null = null;
+
+  mount(container: HTMLDivElement, options?: CanvasEngineOptions, events?: CanvasEngineEvents) {
+    this.container = container;
+    this.events = events;
+    this.showGrid = Boolean(options?.enableGrid);
+
+    const canvasEl = document.createElement('canvas');
+    canvasEl.className = 'h-full w-full';
+    container.innerHTML = '';
+    container.appendChild(canvasEl);
+
+    this.canvas = new fabric.Canvas(canvasEl, {
+      preserveObjectStacking: true,
+      selection: true
+    });
+
+    this.bindSelectionEvents();
+    this.setZoom(options?.devicePixelRatio ?? 1);
+
+    if (this.currentPage) {
+      this.renderPage();
+    }
+  }
+
+  unmount() {
+    this.canvas?.dispose();
+    this.canvas = null;
+    this.container = null;
+    this.gridGroup = null;
+  }
+
+  isMounted(): boolean {
+    return Boolean(this.canvas);
+  }
+
+  loadPage(page: DesignPage) {
+    this.currentPage = structuredClone(page);
+    this.renderPage();
+  }
+
+  getPageSnapshot(): DesignPage | null {
+    return this.currentPage ? structuredClone(this.currentPage) : null;
+  }
+
+  setGrid(enabled: boolean) {
+    this.showGrid = enabled;
+    this.renderElements();
+  }
+
+  addElement(element: DesignElement) {
+    if (!this.currentPage) return;
+    this.currentPage.elements = [...this.currentPage.elements, element];
+    this.renderElements();
+    this.events?.onElementsChange?.(this.currentPage.elements);
+  }
+
+  updateElement(elementId: string, updates: Partial<DesignElement>) {
+    if (!this.currentPage) return;
+
+    this.currentPage.elements = this.currentPage.elements.map(element =>
+      element.id === elementId ? { ...element, ...updates } : element
+    );
+
+    this.renderElements();
+    this.events?.onElementsChange?.(this.currentPage.elements);
+  }
+
+  removeElement(elementId: string) {
+    if (!this.currentPage) return;
+
+    this.currentPage.elements = this.currentPage.elements.filter(el => el.id !== elementId);
+    this.renderElements();
+    this.events?.onElementsChange?.(this.currentPage.elements);
+  }
+
+  getSelection(): string[] {
+    if (!this.canvas) return [];
+    return this.canvas.getActiveObjects().map(obj => (obj as fabric.Object & { data?: Record<string, unknown> }).data?.id as string).filter(Boolean);
+  }
+
+  setSelection(elementIds: string[]) {
+    if (!this.canvas) return;
+
+    const targets = this.canvas.getObjects().filter(obj => {
+      const id = (obj as fabric.Object & { data?: Record<string, unknown> }).data?.id;
+      return Boolean(id && elementIds.includes(String(id)));
+    });
+
+    this.canvas.discardActiveObject();
+
+    if (targets.length === 1) {
+      this.canvas.setActiveObject(targets[0]);
+    } else if (targets.length > 1) {
+      const selection = new fabric.ActiveSelection(targets, { canvas: this.canvas });
+      this.canvas.setActiveObject(selection);
+    }
+
+    this.canvas.requestRenderAll();
+    this.events?.onSelectionChange?.(elementIds);
+  }
+
+  getZoom(): number {
+    return this.zoom;
+  }
+
+  setZoom(zoom: number) {
+    this.zoom = zoom;
+    if (!this.canvas) return;
+    this.canvas.setZoom(zoom);
+  }
+
+  // ---------------------------------------------------------------------------
+  // Helpers
+  // ---------------------------------------------------------------------------
+  private bindSelectionEvents() {
+    if (!this.canvas) return;
+
+    const notifySelection = () => {
+      const selectedIds = this.getSelection();
+      this.events?.onSelectionChange?.(selectedIds);
+    };
+
+    this.canvas.on('selection:created', notifySelection);
+    this.canvas.on('selection:updated', notifySelection);
+    this.canvas.on('selection:cleared', () => this.events?.onSelectionChange?.([]));
+  }
+
+  private renderPage() {
+    if (!this.canvas || !this.currentPage) return;
+
+    const widthPx = this.currentPage.widthMm * MM_TO_PX * this.zoom;
+    const heightPx = this.currentPage.heightMm * MM_TO_PX * this.zoom;
+
+    this.canvas.setDimensions({ width: widthPx, height: heightPx });
+    this.renderElements();
+  }
+
+  private renderElements() {
+    if (!this.canvas || !this.currentPage) return;
+
+    this.canvas.off('object:modified');
+    this.canvas.clear();
+    this.gridGroup = null;
+
+    const { background } = this.currentPage;
+    if (background?.color) {
+      const bg = new fabric.Rect({
+        left: 0,
+        top: 0,
+        width: this.currentPage.widthMm * MM_TO_PX,
+        height: this.currentPage.heightMm * MM_TO_PX,
+        fill: background.color,
+        selectable: false,
+        evented: false
+      });
+      this.canvas.add(bg);
+      bg.moveTo(0);
+    }
+
+    this.drawGrid();
+
+    this.currentPage.elements.forEach(element => {
+      const fabricObject = this.createFabricObject(element);
+      if (fabricObject) {
+        this.canvas?.add(fabricObject);
+      }
+    });
+
+    this.canvas.on('object:modified', () => {
+      if (!this.canvas || !this.currentPage) return;
+
+      this.canvas.getObjects().forEach(obj => {
+        const id = (obj as fabric.Object & { data?: Record<string, unknown> }).data?.id;
+        if (!id) return;
+
+        const matching = this.currentPage?.elements.find(el => el.id === id);
+        if (!matching) return;
+
+        matching.x = this.pxToMm(obj.left ?? 0);
+        matching.y = this.pxToMm(obj.top ?? 0);
+        matching.width = this.pxToMm(obj.width ?? 0) * (obj.scaleX ?? 1);
+        matching.height = this.pxToMm(obj.height ?? 0) * (obj.scaleY ?? 1);
+        matching.rotation = obj.angle;
+      });
+
+      this.events?.onElementsChange?.(this.currentPage?.elements ?? []);
+    });
+
+    this.canvas.requestRenderAll();
+  }
+
+  private drawGrid() {
+    if (!this.canvas || !this.currentPage || !this.showGrid) return;
+
+    const spacingPx = this.mmToPx(10);
+    const widthPx = this.currentPage.widthMm * MM_TO_PX * this.zoom;
+    const heightPx = this.currentPage.heightMm * MM_TO_PX * this.zoom;
+
+    const lines: fabric.Line[] = [];
+
+    for (let x = 0; x <= widthPx; x += spacingPx) {
+      lines.push(
+        new fabric.Line([x, 0, x, heightPx], {
+          stroke: '#e5e7eb',
+          strokeWidth: 1,
+          selectable: false,
+          evented: false,
+          excludeFromExport: true
+        })
+      );
+    }
+
+    for (let y = 0; y <= heightPx; y += spacingPx) {
+      lines.push(
+        new fabric.Line([0, y, widthPx, y], {
+          stroke: '#e5e7eb',
+          strokeWidth: 1,
+          selectable: false,
+          evented: false,
+          excludeFromExport: true
+        })
+      );
+    }
+
+    this.gridGroup = new fabric.Group(lines, {
+      selectable: false,
+      evented: false,
+      excludeFromExport: true,
+      data: { id: 'grid' }
+    });
+
+    this.canvas.add(this.gridGroup);
+    this.gridGroup.moveTo(0);
+  }
+
+  private createFabricObject(element: DesignElement): fabric.Object | null {
+    const baseConfig: fabric.IObjectOptions & { data?: Record<string, unknown> } = {
+      left: this.mmToPx(element.x),
+      top: this.mmToPx(element.y),
+      width: this.mmToPx(element.width),
+      height: this.mmToPx(element.height),
+      angle: element.rotation,
+      data: { id: element.id },
+      selectable: !element.locked,
+      opacity: element.hidden ? 0.4 : 1
+    };
+
+    if (element.kind === 'text') {
+      return new fabric.Textbox(element.content || 'Text', {
+        ...baseConfig,
+        fontFamily: element.fontFamily,
+        fontSize: element.fontSize,
+        fontWeight: element.fontWeight,
+        fill: element.color ?? '#111827',
+        textAlign: element.align ?? 'left'
+      });
+    }
+
+    if (element.kind === 'image') {
+      const placeholder = new fabric.Rect({
+        ...baseConfig,
+        fill: '#dbeafe',
+        stroke: '#1d4ed8'
+      });
+      return placeholder;
+    }
+
+    if (element.kind === 'shape') {
+      const fill = element.fill ?? '#e5e7eb';
+      const stroke = element.stroke ?? '#9ca3af';
+
+      if (element.shape === 'ellipse') {
+        return new fabric.Ellipse({
+          ...baseConfig,
+          rx: this.mmToPx(element.width) / 2,
+          ry: this.mmToPx(element.height) / 2,
+          fill,
+          stroke,
+          strokeWidth: element.strokeWidth ?? 1
+        });
+      }
+
+      return new fabric.Rect({
+        ...baseConfig,
+        fill,
+        stroke,
+        strokeWidth: element.strokeWidth ?? 1
+      });
+    }
+
+    // Groups and frames render as outlined placeholders for now
+    const outline = new fabric.Rect({
+      ...baseConfig,
+      fill: 'transparent',
+      stroke: '#22c55e',
+      strokeDashArray: [6, 4]
+    });
+
+    const label = new fabric.Text(element.kind.toUpperCase(), {
+      left: baseConfig.left && baseConfig.left + 8,
+      top: baseConfig.top && baseConfig.top + 8,
+      fontSize: 12,
+      fill: '#22c55e',
+      selectable: false,
+      evented: false
+    });
+
+    const group = new fabric.Group([outline, label], {
+      ...baseConfig,
+      subTargetCheck: false
+    });
+
+    return group;
+  }
+
+  private mmToPx(value: number): number {
+    return value * MM_TO_PX * this.zoom;
+  }
+
+  private pxToMm(value: number): number {
+    return value / (MM_TO_PX * this.zoom);
+  }
+}
 
EOF
)
