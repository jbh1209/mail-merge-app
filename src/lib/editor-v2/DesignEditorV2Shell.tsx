 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/src/components/editor-v2/DesignEditorV2Shell.tsx b/src/components/editor-v2/DesignEditorV2Shell.tsx
new file mode 100644
index 0000000000000000000000000000000000000000..8927a63cad0925b90301e17531cb43cadff9a858
--- /dev/null
+++ b/src/components/editor-v2/DesignEditorV2Shell.tsx
@@ -0,0 +1,205 @@
+// =============================================================================
+// DESIGN EDITOR V2 - UI SHELL
+// =============================================================================
+// Lightweight Polotno-style shell that wires the Fabric engine to a simple
+// layout. This is intentionally minimal while we experiment with the new data
+// model and canvas engine abstraction.
+// =============================================================================
+
+import React, { useEffect, useMemo, useRef } from 'react';
+import { Button } from '@/components/ui/button';
+import { Separator } from '@/components/ui/separator';
+import { ScrollArea } from '@/components/ui/scroll-area';
+import { Card } from '@/components/ui/card';
+import { useEditorV2Store } from '@/state/editorV2Store';
+import type { DesignDocument, DesignElement, DesignPage } from '@/lib/editor-v2/types';
+import type { CanvasEngine } from '@/lib/editor-v2/engine';
+
+export interface DesignEditorV2ShellProps {
+  document: DesignDocument;
+  engine: CanvasEngine;
+  onDocumentChange?: (doc: DesignDocument) => void;
+}
+
+export function DesignEditorV2Shell({ document, engine, onDocumentChange }: DesignEditorV2ShellProps) {
+  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
+
+  const {
+    document: storeDocument,
+    activePageId,
+    selectedElementIds,
+    zoom,
+    showGrid,
+    setDocument,
+    setActivePage,
+    setSelection,
+    setZoom,
+    toggleGrid,
+    addPage,
+    addElement,
+    updatePage
+  } = useEditorV2Store();
+
+  const activePageRef = useRef<DesignPage | null>(null);
+
+  // Keep store in sync with prop document
+  useEffect(() => {
+    setDocument(document);
+  }, [document, setDocument]);
+
+  useEffect(() => {
+    activePageRef.current = activePage ?? null;
+  }, [activePage]);
+
+  const activePage: DesignPage | undefined = useMemo(() => {
+    if (!storeDocument) return undefined;
+    return storeDocument.pages.find(page => page.id === activePageId) ?? storeDocument.pages[0];
+  }, [storeDocument, activePageId]);
+
+  // Mount the canvas engine once
+  useEffect(() => {
+    if (!canvasContainerRef.current) return;
+    engine.mount(canvasContainerRef.current, { enableGrid: showGrid }, {
+      onSelectionChange: ids => setSelection(ids),
+      onElementsChange: elements => {
+        const page = activePageRef.current;
+        if (!page) return;
+        updatePage(page.id, { elements });
+      }
+    });
+
+    return () => engine.unmount();
+  }, [engine, setSelection, updatePage]);
+
+  useEffect(() => {
+    engine.setGrid(showGrid);
+  }, [engine, showGrid]);
+
+  // Load the active page into the engine
+  useEffect(() => {
+    if (!activePage) return;
+    engine.loadPage(activePage);
+  }, [activePage, engine]);
+
+  // Keep zoom state and engine synchronized
+  useEffect(() => {
+    engine.setZoom(zoom);
+  }, [engine, zoom]);
+
+  // Propagate document changes upward
+  useEffect(() => {
+    if (storeDocument) {
+      onDocumentChange?.(storeDocument);
+    }
+  }, [storeDocument, onDocumentChange]);
+
+  const handleAddText = () => {
+    if (!activePage) return;
+    const element: DesignElement = {
+      id: crypto.randomUUID(),
+      kind: 'text',
+      x: 10,
+      y: 10,
+      width: 50,
+      height: 12,
+      content: 'New text',
+      fontFamily: 'Inter',
+      fontSize: 14
+    };
+    addElement(activePage.id, element);
+    engine.addElement(element);
+  };
+
+  const handleAddPage = () => {
+    const newPage: DesignPage = {
+      id: crypto.randomUUID(),
+      name: `Page ${storeDocument ? storeDocument.pages.length + 1 : 1}`,
+      widthMm: 210,
+      heightMm: 297,
+      elements: []
+    };
+    addPage(newPage);
+  };
+
+  if (!storeDocument || !activePage) {
+    return (
+      <div className="flex h-full items-center justify-center rounded-lg border bg-muted/50">
+        <p className="text-sm text-muted-foreground">Loading V2 document...</p>
+      </div>
+    );
+  }
+
+  return (
+    <div className="flex h-full flex-col gap-2">
+      <Card className="flex items-center justify-between px-4 py-2">
+        <div className="flex items-center gap-3">
+          <div>
+            <p className="text-sm font-medium text-muted-foreground">Design Editor V2</p>
+            <p className="text-lg font-semibold leading-none">{storeDocument.name}</p>
+          </div>
+          <Separator orientation="vertical" className="h-10" />
+          <div className="flex items-center gap-2 text-sm text-muted-foreground">
+            <span>Zoom</span>
+            <Button size="sm" variant="outline" onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}>-</Button>
+            <span className="w-12 text-center">{Math.round(zoom * 100)}%</span>
+            <Button size="sm" variant="outline" onClick={() => setZoom(zoom + 0.25)}>+</Button>
+            <Separator orientation="vertical" className="h-8" />
+            <Button size="sm" variant={showGrid ? 'default' : 'outline'} onClick={toggleGrid}>
+              {showGrid ? 'Grid On' : 'Grid Off'}
+            </Button>
+          </div>
+        </div>
+        <div className="flex items-center gap-2">
+          <Button variant="outline" size="sm" onClick={handleAddPage}>Add Page</Button>
+          <Button variant="outline" size="sm" onClick={handleAddText}>Add Text</Button>
+          <Button size="sm">Save</Button>
+        </div>
+      </Card>
+
+      <div className="flex min-h-0 flex-1 gap-3">
+        <Card className="flex w-64 flex-col">
+          <div className="px-3 py-2 text-sm font-semibold">Pages</div>
+          <Separator />
+          <ScrollArea className="flex-1">
+            <div className="space-y-1 p-2">
+              {storeDocument.pages.map(page => (
+                <button
+                  key={page.id}
+                  type="button"
+                  onClick={() => setActivePage(page.id)}
+                  className={`w-full rounded border px-3 py-2 text-left text-sm transition ${
+                    activePage.id === page.id ? 'border-primary bg-primary/10' : 'border-transparent hover:border-muted'
+                  }`}
+                >
+                  <div className="font-medium">{page.name}</div>
+                  <div className="text-xs text-muted-foreground">
+                    {page.widthMm}mm × {page.heightMm}mm
+                  </div>
+                </button>
+              ))}
+            </div>
+          </ScrollArea>
+        </Card>
+
+        <div className="flex min-w-0 flex-1 flex-col gap-2">
+          <Card className="flex flex-1 items-center justify-center bg-muted/30">
+            <div ref={canvasContainerRef} className="h-full w-full" />
+          </Card>
+          <Card className="flex items-center justify-between px-4 py-2 text-sm text-muted-foreground">
+            <div>Selected elements: {selectedElementIds.length}</div>
+            <div>Active page: {activePage.name}</div>
+          </Card>
+        </div>
+
+        <Card className="w-80">
+          <div className="px-3 py-2 text-sm font-semibold">Inspector</div>
+          <Separator />
+          <div className="space-y-4 p-4 text-sm text-muted-foreground">
+            <p>Selection will show editable properties here.</p>
+            <p>Current selection: {selectedElementIds.join(', ') || 'none'}</p>
+          </div>
+        </Card>
+      </div>
+    </div>
+  );
+}
 
EOF
)
