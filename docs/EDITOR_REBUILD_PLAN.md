# Design Editor Rebuild Plan

## Architecture Decision
- **PDF Engine**: Option B - SVG → PDF conversion for vector fidelity
- **Fonts**: Google Fonts - server-side TTF embedding via pdfDoc.embedFont()

## Phases

### Phase 1: Foundation Layer ✅ COMPLETE
- `src/lib/editor/types.ts` - DesignDocument, DesignPage, DesignElement, PrintConfig
- `src/lib/editor/engine.ts` - CanvasEngine interface
- `src/lib/editor/adapters.ts` - FieldConfig ↔ DesignElement converters
- `src/lib/editor/index.ts` - Public API exports

### Phase 2: Polotno-Style Editor Shell ✅ COMPLETE
- `src/components/editor/DesignEditorShell.tsx` - Main container
- `src/components/editor/EditorTopBar.tsx` - Tools, zoom, actions
- `src/components/editor/EditorLeftSidebar.tsx` - Pages, assets, data fields
- `src/components/editor/EditorCanvas.tsx` - Canvas viewport (simplified preview)
- `src/components/editor/EditorRightSidebar.tsx` - Inspector panel
- `src/components/editor/EditorStatusBar.tsx` - Status info
- `src/components/editor/index.ts` - Public exports

### Phase 3: Print-Grade PDF Export Pipeline 🔄 NEXT
- Refactor `supabase/functions/generate-pdf/index.ts`
- Implement SVG → PDF conversion pipeline
- Add bleed support and crop marks
- Implement Google Fonts server-side embedding
- Set proper TrimBox/BleedBox for print

### Phase 4: Migration
- Connect new editor shell to existing routes
- Create adapter layer for existing template data
- Replace TemplateDesignCanvas with DesignEditorShell

### Phase 5: Advanced VDP Features
- Image support with DPI warnings
- Backgrounds and layers
- Multi-page documents
