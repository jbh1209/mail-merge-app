

# Fix Vector PDF Fidelity: Multi-Page Export Architecture

## Problem Summary

The exported CMYK PDFs are flattened raster images instead of vector graphics with editable text. The root cause is an over-complicated export pipeline:

**Current (Broken) Flow:**
```text
Client → 6 records → 6 separate PDF exports → Upload 6 files → pdf-lib merges → FLATTENED OUTPUT
```

Even though the VPS uses `@polotno/pdf-export` to produce true vector PDFs, the `compose-label-sheet` edge function uses **pdf-lib** to merge them. pdf-lib cannot preserve complex PDF/X-1a structures (CMYK color spaces, outlined fonts, XObjects), causing the "flattening."

## Key Insight from Polotno Documentation

From the official `@polotno/pdf-export` docs:
> **"it will export all pages in the JSON"** - `jsonToPDFBase64(json)`

The `@polotno/pdf-export` package can export a **multi-page Polotno JSON** directly into a **single multi-page PDF**. There is no need to export records individually and merge them afterward!

## Solution Architecture

### For Full-Page Exports (Certificates, Cards, Badges)

**New Flow:**
```text
Client → Resolve ALL records → Create multi-page scene JSON → Send to VPS → VPS exports single multi-page PDF → Done (no merging!)
```

1. Client resolves VDP variables for all records
2. Combine resolved pages into a single multi-page PolotnoScene
3. Send the combined JSON to VPS
4. VPS calls `jsonToPDF(combinedScene, outputPath, { pdfx1a: true })`
5. Return the single multi-page PDF directly (no composition step)

### For Label Exports (Imposition Required)

Labels still need post-processing to tile onto sheets, but we move that to the VPS to preserve vector fidelity:

**New Flow:**
```text
Client → Resolve ALL records → Create multi-page scene JSON → VPS exports multi-page PDF → VPS imposes onto sheets with qpdf/Ghostscript → Done
```

1. Client resolves VDP for all records
2. Send combined JSON to VPS
3. VPS exports as multi-page PDF (each page = one label)
4. VPS uses `qpdf` or Ghostscript to impose labels onto sheets (vector-preserving)
5. Return final imposed PDF

## Implementation Changes

### Phase 1: New VPS Endpoint for Multi-Page Export

| File | Change |
|------|--------|
| `server.js` (VPS) | Add `/export-multipage` endpoint that accepts multi-page scene JSON |

**How it works:**
```javascript
app.post('/export-multipage', async (req, res) => {
  const { scene, options } = req.body;
  // scene.pages contains all VDP-resolved pages
  
  await jsonToPDF(scene, outputPath, { 
    pdfx1a: options.cmyk 
  });
  
  // Return single multi-page PDF
  res.sendFile(outputPath);
});
```

### Phase 2: New VPS Endpoint for Label Imposition

| File | Change |
|------|--------|
| `server.js` (VPS) | Add `/export-labels` endpoint that exports + imposes |
| `Dockerfile` (VPS) | Add `qpdf` package for vector-safe PDF manipulation |

**How it works:**
```javascript
app.post('/export-labels', async (req, res) => {
  const { scene, layout, options } = req.body;
  
  // Step 1: Export multi-page PDF (each page = one label)
  await jsonToPDF(scene, labelsPath, { pdfx1a: options.cmyk });
  
  // Step 2: Use qpdf/Ghostscript to impose onto sheets
  // qpdf preserves PDF internals without re-rendering
  await imposeLabelsOntoSheets(labelsPath, layout, outputPath);
  
  res.sendFile(outputPath);
});
```

### Phase 3: Update Client Export Logic

| File | Change |
|------|--------|
| `pdfBatchExporter.ts` | Create combined multi-page scene instead of exporting per-record |
| `vectorPdfExporter.ts` | Add `exportMultiPagePdf()` function that calls new VPS endpoint |

**Key change - combine all pages into one scene:**
```typescript
// Instead of: resolve → export → repeat for each record
// Do: resolve ALL → combine into single scene → export once

function combineRecordsIntoMultiPageScene(
  baseScene: PolotnoScene,
  records: Record<string, string>[]
): PolotnoScene {
  const pages = records.flatMap((record, index) => {
    const resolved = resolveVdpVariables(baseScene, { record, recordIndex: index });
    return resolved.pages; // May be multiple pages per record (front/back)
  });
  
  return {
    ...baseScene,
    pages, // All resolved pages combined
  };
}
```

### Phase 4: Simplify Edge Function

| File | Change |
|------|--------|
| `compose-label-sheet/index.ts` | For full-page CMYK exports, simply proxy to VPS (no pdf-lib) |
| `render-vector-pdf/index.ts` | Add proxy for new `/export-multipage` and `/export-labels` endpoints |

## Benefits of This Approach

| Aspect | Current | Proposed |
|--------|---------|----------|
| **Vector fidelity** | Lost during pdf-lib merge | Preserved (no re-rendering) |
| **Network calls** | N calls for N records | 1 call for all records |
| **VPS processing** | N separate PDF exports | 1 combined export |
| **Complexity** | Upload/download dance | Direct export |
| **Memory usage** | N blobs in browser | 1 blob |

## File Changes Summary

### VPS (Your GitHub Repository)

| File | Action |
|------|--------|
| `server.js` | Add `/export-multipage` endpoint |
| `server.js` | Add `/export-labels` endpoint with imposition |
| `Dockerfile` | Add `qpdf` package |

### Lovable (This Project)

| File | Action |
|------|--------|
| `src/lib/polotno/pdfBatchExporter.ts` | Combine records into multi-page scene, call new VPS endpoint |
| `src/lib/polotno/vectorPdfExporter.ts` | Add `exportMultiPagePdf()` function |
| `supabase/functions/render-vector-pdf/index.ts` | Add proxy for new endpoints |
| `supabase/functions/compose-label-sheet/index.ts` | Simplify to just route CMYK exports to VPS |

## Expected Outcome

After implementation:
- **PDF Creator/Producer**: Shows `@polotno/pdf-export` and Ghostscript (not pdf-lib)
- **Text**: Preserved as outlined vector paths (selectable in PDF viewers that support it)
- **Graphics**: True vector shapes, not rasterized
- **CMYK**: Native color space preserved throughout
- **Bleed/Crops**: Professional print marks intact

## Verification Steps

1. Export a 6-record certificate project with CMYK enabled
2. Open in Adobe Acrobat
3. Check PDF properties - should show Polotno/Ghostscript as producer
4. Use Acrobat's "Output Preview" or "Preflight" to verify:
   - CMYK color space (no RGB fallback)
   - Vector objects (not rasterized images)
   - Font outlines preserved

