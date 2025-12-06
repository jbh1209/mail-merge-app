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

### Phase 3: Print-Grade PDF Export Pipeline ✅ COMPLETE
- `supabase/functions/generate-pdf/index.ts` - Main handler (refactored)
- `supabase/functions/generate-pdf/element-renderer.ts` - Element → PDF logic
- `supabase/functions/generate-pdf/print-features.ts` - Bleed, crop marks, TrimBox/BleedBox
- `supabase/functions/generate-pdf/font-utils.ts` - Google Fonts server-side TTF embedding

### Phase 4: Migration ✅ COMPLETE
- `src/components/editor/EditorCanvasWithFabric.tsx` - Bridge FabricLabelCanvas to DesignElement types
- `src/components/editor/DesignEditorWithFabric.tsx` - Full editor with Fabric.js integration
- `src/components/TemplateDesignEditor.tsx` - Updated to use new editor by default
- Legacy editor available via `useLegacyEditor` prop

### Phase 5: Advanced VDP Features ✅ COMPLETE
- `src/components/editor/ImageUploadDialog.tsx` - Image upload with DPI calculation and warnings
- `src/components/editor/BackgroundSettingsPanel.tsx` - Page background color and image settings
- `src/components/editor/PageManagerPanel.tsx` - Add, remove, reorder, duplicate pages
- Updated `EditorLeftSidebar.tsx` with PageManagerPanel integration
- Updated `EditorTopBar.tsx` with BackgroundSettingsPanel integration
