

# Fix: Remove Legacy Vector Export, Use Client + VPS CMYK Architecture

## Problem
The current code checks `isVectorServiceAvailable()` and when true, calls the legacy `/render` endpoint which no longer exists on the VPS. The VPS now only supports `/convert-cmyk` for color conversion.

**Error observed:**
```
[render-vector-pdf] Legacy render request
[render-vector-pdf] VPS render failed: 404 Cannot POST /render
```

## Solution
Simplify the export pipeline to always use Polotno's client-side PDF export, then optionally send through CMYK conversion.

```text
BEFORE (broken):
  isVectorServiceAvailable() → true → exportVectorPdf() → /render → 404 ERROR

AFTER (fixed):
  Always use exportPdf() (client) → if CMYK → convertPdfsToCmyk() → /convert-cmyk → OK
```

## Changes Required

### 1. Update pdfBatchExporter.ts
Remove the branching logic that checks for vector service availability:

**Current (broken):**
```typescript
const useVectorExport = await isVectorServiceAvailable();
if (useVectorExport) {
  // Call exportVectorPdf() → /render → 404!
} else {
  // Use client export
}
```

**Fixed:**
```typescript
// Always use client-side Polotno export
for (let i = 0; i < records.length; i++) {
  const resolvedScene = resolveVdpVariables(...);
  const blob = await exportPdf(resolvedScene);
  pdfBlobs.push(blob);
}

// Then apply CMYK conversion if requested
if (wantCmyk) {
  const cmykCheck = await checkCmykServiceAvailable();
  if (cmykCheck.available) {
    finalBlobs = await convertPdfsToCmyk(pdfBlobs, { profile }, onProgress);
  }
}
```

### 2. Remove vectorPdfExporter.ts Import
Remove the unused import and the entire vector export code path from `pdfBatchExporter.ts`.

### 3. Optionally Deprecate vectorPdfExporter.ts
The file is no longer needed since we don't render PDFs on the VPS. It can be marked as deprecated or removed entirely.

## Technical Details

### Files Modified

| File | Change |
|------|--------|
| `src/lib/polotno/pdfBatchExporter.ts` | Remove vector export path, always use client export + CMYK conversion |

### Key Changes in pdfBatchExporter.ts

1. **Remove import**: `import { isVectorServiceAvailable, exportVectorPdf } from './vectorPdfExporter';`

2. **Remove the branching logic** (lines ~346-390) that checks `useVectorExport`

3. **Simplify to single path**: Always use the client-side `exportPdf` function passed in

4. **Keep CMYK conversion**: When `printConfig?.colorMode === 'cmyk'`, use the already-working `convertPdfsToCmyk()` which calls `/convert-cmyk`

### Expected Behavior After Fix

1. Client renders PDF using Polotno (fast, vector output with bleed/crop marks)
2. If CMYK is requested, sends RGB PDF to VPS `/convert-cmyk`
3. VPS converts to CMYK using Ghostscript with ICC profiles
4. CMYK PDF returned for upload and composition

## Summary

This is a minimal change that removes the broken vector export path and relies entirely on:
- **Client-side Polotno** for PDF rendering
- **VPS `/convert-cmyk`** for CMYK conversion (already working based on health check)

