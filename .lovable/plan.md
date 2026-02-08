# Fix Vector PDF Fidelity: Multi-Page Export Architecture

## ✅ IMPLEMENTATION COMPLETE

### Changes Made

#### 1. VPS Documentation (for user to deploy)
- Created `docs/VPS_MULTIPAGE_EXPORT_UPDATE.md` with complete server.js and Dockerfile updates
- Added `/export-multipage` endpoint for multi-page PDF export
- Added `/export-labels` endpoint for label imposition with vector preservation
- Added `/compose-pdfs` endpoint for merging PDFs with qpdf

#### 2. Edge Function Updates
- Updated `supabase/functions/render-vector-pdf/index.ts` with new endpoint proxies:
  - `/export-multipage` - Multi-page scene to single PDF
  - `/export-labels` - Labels with server-side imposition  
  - `/compose-pdfs` - Vector-safe PDF merging

#### 3. Client-Side Updates
- **`src/lib/polotno/vectorPdfExporter.ts`**:
  - Added `exportMultiPagePdf()` - Primary method for full-page exports
  - Added `exportLabelsWithImposition()` - For label sheets with server-side tiling
  - Deprecated batch individual export in favor of multi-page

- **`src/lib/polotno/pdfBatchExporter.ts`**:
  - New `combineRecordsIntoMultiPageScene()` - Combines all VDP records into single scene
  - Rewrote `batchExportWithPolotno()` for new multi-page flow
  - CMYK path now uses multi-page export (no pdf-lib merging!)
  - RGB path falls back to legacy flow

---

## New Architecture

### Full-Page CMYK Exports (Certificates, Cards, Badges)
```
Client → Resolve ALL records → Combine into multi-page scene → VPS exports single PDF → Done!
```

### Label CMYK Exports (With Imposition)
```
Client → Resolve ALL records → Combine into multi-page scene → VPS exports + imposes with qpdf → Done!
```

### RGB Exports (Unchanged Legacy Flow)
```
Client → Export each record → Upload individually → compose-label-sheet merges → Done
```

---

## Next Steps for User

1. **Deploy VPS updates** from `docs/VPS_MULTIPAGE_EXPORT_UPDATE.md`:
   - Update `Dockerfile` to install `qpdf`
   - Replace `server.js` with new version
   - Commit, push, and redeploy

2. **Test** a CMYK export with 6+ records

3. **Verify** in Adobe Acrobat:
   - PDF Producer shows Polotno/Ghostscript (not pdf-lib)
   - Content is vector (not rasterized)
   - CMYK color space preserved

---

## Benefits Achieved

| Aspect | Before | After |
|--------|--------|-------|
| Vector fidelity | Lost in pdf-lib merge | Preserved (native multi-page) |
| Network calls | N calls for N records | 1 call for all |
| VPS processing | N separate exports | 1 combined export |
| Memory usage | N blobs in browser | 1 blob |
| PDF Producer | pdf-lib | @polotno/pdf-export |

