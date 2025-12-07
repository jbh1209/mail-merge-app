// =============================================================================
// DESIGN EDITOR V2 - Demo Page
// =============================================================================

import React, { useMemo, useState } from 'react';
import { FabricCanvasEngine } from '@/lib/editor-v2/fabricEngine';
import type { DesignDocument } from '@/lib/editor-v2/types';
import { DesignEditorV2Shell } from '@/components/editor-v2/DesignEditorV2Shell';

export function EditorV2Demo() {
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
        heightMm: 148, // A5 landscape
        background: { color: '#ffffff' },
        elements: [
          {
            id: 'title-1',
            kind: 'text',
            x: 20,
            y: 20,
            width: 170,
            height: 20,
            content: 'Welcome to Editor V2',
            fontFamily: 'Inter',
            fontSize: 28,
            fontWeight: '700',
            color: '#1e293b'
          },
          {
            id: 'subtitle-1',
            kind: 'text',
            x: 20,
            y: 45,
            width: 170,
            height: 12,
            content: 'A Polotno-inspired design editor built on Fabric.js',
            fontFamily: 'Inter',
            fontSize: 14,
            fontWeight: 'normal',
            color: '#64748b'
          },
          {
            id: 'shape-1',
            kind: 'shape',
            shape: 'rectangle',
            x: 20,
            y: 70,
            width: 80,
            height: 50,
            fill: '#dbeafe',
            stroke: '#3b82f6',
            strokeWidth: 2
          },
          {
            id: 'shape-2',
            kind: 'shape',
            shape: 'ellipse',
            x: 110,
            y: 70,
            width: 50,
            height: 50,
            fill: '#dcfce7',
            stroke: '#22c55e',
            strokeWidth: 2
          }
        ]
      },
      {
        id: 'page-2',
        name: 'Back',
        widthMm: 210,
        heightMm: 148,
        background: { color: '#f8fafc' },
        elements: [
          {
            id: 'back-title',
            kind: 'text',
            x: 20,
            y: 20,
            width: 170,
            height: 16,
            content: 'Back Side',
            fontFamily: 'Inter',
            fontSize: 24,
            fontWeight: '600',
            color: '#334155'
          }
        ]
      }
    ]
  });

  const engine = useMemo(() => new FabricCanvasEngine(), []);

  return (
    <div className="h-screen w-screen overflow-hidden">
      <DesignEditorV2Shell
        document={document}
        engine={engine}
        onDocumentChange={setDocument}
      />
    </div>
  );
}

export default EditorV2Demo;