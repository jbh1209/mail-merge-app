 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/src/state/editorV2Store.ts b/src/state/editorV2Store.ts
new file mode 100644
index 0000000000000000000000000000000000000000..cb3fb358946b7921296582cf84b0247ce44f0253
--- /dev/null
+++ b/src/state/editorV2Store.ts
@@ -0,0 +1,96 @@
+// =============================================================================
+// DESIGN EDITOR V2 - STATE STORE (ZUSTAND)
+// =============================================================================
+// Centralized state for the experimental V2 editor. This store purposely keeps
+// the surface area small so the UI and canvas engine can iterate quickly.
+// =============================================================================
+
+import { create } from 'zustand';
+import type { DesignDocument, DesignElement, DesignPage } from '@/lib/editor-v2/types';
+
+export interface EditorV2State {
+  document: DesignDocument | null;
+  activePageId: string | null;
+  selectedElementIds: string[];
+  zoom: number;
+  showGrid: boolean;
+
+  setDocument: (doc: DesignDocument) => void;
+  setActivePage: (pageId: string) => void;
+  setSelection: (ids: string[]) => void;
+  setZoom: (zoom: number) => void;
+  toggleGrid: () => void;
+
+  addPage: (page: DesignPage) => void;
+  updatePage: (pageId: string, updates: Partial<DesignPage>) => void;
+  addElement: (pageId: string, element: DesignElement) => void;
+  updateElement: (pageId: string, elementId: string, updates: Partial<DesignElement>) => void;
+  removeElement: (pageId: string, elementId: string) => void;
+}
+
+export const useEditorV2Store = create<EditorV2State>((set, get) => ({
+  document: null,
+  activePageId: null,
+  selectedElementIds: [],
+  zoom: 1,
+  showGrid: true,
+
+  setDocument: doc =>
+    set({
+      document: doc,
+      activePageId: doc.pages[0]?.id ?? null,
+      selectedElementIds: []
+    }),
+
+  setActivePage: pageId => set({ activePageId: pageId, selectedElementIds: [] }),
+  setSelection: ids => set({ selectedElementIds: ids }),
+  setZoom: zoom => set({ zoom }),
+  toggleGrid: () => set(state => ({ showGrid: !state.showGrid })),
+
+  addPage: page =>
+    set(state => {
+      if (!state.document) return state;
+      const pages = [...state.document.pages, page];
+      return {
+        document: { ...state.document, pages },
+        activePageId: page.id
+      };
+    }),
+
+  updatePage: (pageId, updates) =>
+    set(state => {
+      if (!state.document) return state;
+      const pages = state.document.pages.map(page => (page.id === pageId ? { ...page, ...updates } : page));
+      return { document: { ...state.document, pages } };
+    }),
+
+  addElement: (pageId, element) =>
+    set(state => {
+      if (!state.document) return state;
+      const pages = state.document.pages.map(page =>
+        page.id === pageId ? { ...page, elements: [...page.elements, element] } : page
+      );
+      return { document: { ...state.document, pages }, selectedElementIds: [element.id] };
+    }),
+
+  updateElement: (pageId, elementId, updates) =>
+    set(state => {
+      if (!state.document) return state;
+      const pages = state.document.pages.map(page => {
+        if (page.id !== pageId) return page;
+        const elements = page.elements.map(element => (element.id === elementId ? { ...element, ...updates } : element));
+        return { ...page, elements };
+      });
+      return { document: { ...state.document, pages } };
+    }),
+
+  removeElement: (pageId, elementId) =>
+    set(state => {
+      if (!state.document) return state;
+      const pages = state.document.pages.map(page => {
+        if (page.id !== pageId) return page;
+        return { ...page, elements: page.elements.filter(el => el.id !== elementId) };
+      });
+      return { document: { ...state.document, pages }, selectedElementIds: [] };
+    })
+}));
 
EOF
)
