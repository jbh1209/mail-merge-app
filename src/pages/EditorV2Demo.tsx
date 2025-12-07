 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/src/pages/EditorV2Demo.tsx b/src/pages/EditorV2Demo.tsx
new file mode 100644
index 0000000000000000000000000000000000000000..c5011444f314bf847c0dd2f855d9d30a040ed044
--- /dev/null
+++ b/src/pages/EditorV2Demo.tsx
@@ -0,0 +1,59 @@
+import React, { useMemo, useState } from 'react';
+import { FabricCanvasEngine } from '@/lib/editor-v2/fabricEngine';
+import type { DesignDocument } from '@/lib/editor-v2/types';
+import { DesignEditorV2Shell } from '@/components/editor-v2/DesignEditorV2Shell';
+
+export function EditorV2Demo() {
+  const [document, setDocument] = useState<DesignDocument>({
+    id: 'v2-demo',
+    name: 'Mail Merge Designer v2',
+    metadata: {
+      version: 'v2',
+      createdAt: new Date().toISOString()
+    },
+    pages: [
+      {
+        id: 'page-1',
+        name: 'Front',
+        widthMm: 210,
+        heightMm: 297,
+        background: { color: '#ffffff' },
+        elements: [
+          {
+            id: 'title-1',
+            kind: 'text',
+            x: 20,
+            y: 30,
+            width: 120,
+            height: 20,
+            content: 'Welcome to Editor V2',
+            fontFamily: 'Inter',
+            fontSize: 24,
+            fontWeight: '700'
+          },
+          {
+            id: 'shape-1',
+            kind: 'shape',
+            shape: 'rectangle',
+            x: 40,
+            y: 70,
+            width: 80,
+            height: 40,
+            fill: '#e0f2fe',
+            stroke: '#0ea5e9'
+          }
+        ]
+      }
+    ]
+  });
+
+  const engine = useMemo(() => new FabricCanvasEngine(), []);
+
+  return (
+    <div className="h-full w-full">
+      <DesignEditorV2Shell document={document} engine={engine} onDocumentChange={setDocument} />
+    </div>
+  );
+}
+
+export default EditorV2Demo;
 
EOF
)
