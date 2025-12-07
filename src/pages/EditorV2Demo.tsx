import React, { useMemo, useState, Suspense } from 'react';
import { FabricCanvasEngine } from '@/lib/editor-v2/fabricEngine';
import type { DesignDocument } from '@/lib/editor-v2/types';
import { DesignEditorV2Shell } from '@/components/editor-v2/DesignEditorV2Shell';

function EditorV2DemoContent() {
  const [document, setDocument] = useState<DesignDocument>({
    id: 'v2-demo',
    name: 'Mail Merge Designer v2',
    metadata: {
      version: 'v2',
      createdAt: new Date().toISOString()
    },
    pages: [
      {
        id: 'page-1',
        name: 'Front',
        widthMm: 210,
        heightMm: 297,
        background: { color: '#ffffff' },
        elements: [
          {
            id: 'title-1',
            kind: 'text',
            x: 20,
            y: 30,
            width: 120,
            height: 20,
            content: 'Welcome to Editor V2',
            fontFamily: 'Inter',
            fontSize: 24,
            fontWeight: '700'
          },
          {
            id: 'shape-1',
            kind: 'shape',
            shape: 'rectangle',
            x: 40,
            y: 70,
            width: 80,
            height: 40,
            fill: '#e0f2fe',
            stroke: '#0ea5e9'
          }
        ]
      }
    ]
  });

  const engine = useMemo(() => new FabricCanvasEngine(), []);

  return (
    <DesignEditorV2Shell document={document} engine={engine} onDocumentChange={setDocument} />
  );
}

export function EditorV2Demo() {
  return (
    <div className="h-screen w-full p-4 bg-background">
      <Suspense fallback={<div className="flex h-full items-center justify-center">Loading editor...</div>}>
        <EditorV2DemoContent />
      </Suspense>
    </div>
  );
}

export default EditorV2Demo;
