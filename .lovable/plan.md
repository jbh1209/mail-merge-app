

# Use Polotno Native Bleed & Crop Marks + Fix CMYK Conversion

## Summary
Switch from server-side crop marks and white masking to Polotno's native PDF export with built-in crop marks and proper bleed clipping. Then ensure CMYK conversion is reliably invoked.

---

## Current Situation

**Export Flow Today:**
1. Polotno exports PDF with `includeBleed: true, cropMarkSize: 0`
2. Server-side `compose-label-sheet` adds crop marks via `pdf-lib`
3. Server-side white rectangles mask overflow (added in last fix)
4. CMYK conversion via pdfRest (if `colorMode === 'cmyk'`)

**Problems:**
- Crop marks drawn manually are less elegant than Polotno's native implementation
- White masking is a workaround that adds extra PDF drawing operations
- CMYK conversion may not be triggering (needs investigation)

---

## Proposed Changes

### Change 1: Use Polotno Native Crop Marks

Polotno's `cropMarkSize` option automatically:
- Draws proper crop marks at trim corners
- Clips bleed content correctly (no overflow)
- Sets proper TrimBox/BleedBox metadata

**Before:**
```javascript
// PolotnoPdfGenerator.tsx
const exportPdf = async (scene) => {
  return editorHandle.exportResolvedPdf(scene, {
    includeBleed: printSettings?.enablePrintMarks ?? false,
    includeCropMarks: false, // Server adds them
    pixelRatio: 2,
  });
};
```

**After:**
```javascript
// PolotnoPdfGenerator.tsx
const exportPdf = async (scene) => {
  return editorHandle.exportResolvedPdf(scene, {
    includeBleed: printSettings?.enablePrintMarks ?? false,
    includeCropMarks: printSettings?.enablePrintMarks ?? false, // Use native
    cropMarkSizeMm: printSettings?.cropMarkOffsetMm ?? 3,
    pixelRatio: 2,
  });
};
```

### Change 2: Update Edge Function to Skip Server-Side Marks

When PDFs already have crop marks from Polotno, the compose function should:
- Skip drawing crop marks
- Skip drawing white masks
- Still apply CMYK conversion if requested

Add a new flag `clientRenderedMarks: true` to signal pre-rendered marks.

### Change 3: Verify CMYK Conversion Path

The CMYK conversion in `compose-label-sheet` only triggers when:
1. `fullPageMode === true` (certificates, not labels)
2. `printConfig.colorMode === 'cmyk'`

Current check:
```javascript
const applyCmyk = printConfig?.colorMode === 'cmyk';
```

This should work, but we need to verify `printConfig` is being passed correctly from the client. Add logging to trace the flow.

---

## Implementation Plan

### Step 1: Update Client-Side Export

**File:** `src/components/polotno/PolotnoPdfGenerator.tsx`

```typescript
// Create export function that uses the editor handle
const exportPdf = async (scene: PolotnoScene): Promise<Blob> => {
  const usePrintMarks = printSettings?.enablePrintMarks ?? false;
  
  return editorHandle.exportResolvedPdf(scene, {
    includeBleed: usePrintMarks,
    includeCropMarks: usePrintMarks,  // Enable native crop marks
    cropMarkSizeMm: printSettings?.cropMarkOffsetMm ?? 3,
    pixelRatio: 2,
  });
};
```

### Step 2: Update Print Config to Signal Native Marks

**File:** `src/components/polotno/PolotnoPdfGenerator.tsx`

Add flag to printConfig:
```typescript
const printConfig: PrintConfig | undefined = printSettings ? {
  enablePrintMarks: printSettings.enablePrintMarks,
  bleedMm: printSettings.bleedMm,
  cropMarkOffsetMm: printSettings.cropMarkOffsetMm,
  trimWidthMm: templateConfig.widthMm,
  trimHeightMm: templateConfig.heightMm,
  colorMode: printSettings.colorMode,
  region: printSettings.region?.toLowerCase() as 'us' | 'eu' | 'other',
  clientRenderedMarks: true,  // New: skip server-side marks
} : undefined;
```

### Step 3: Update Edge Function

**File:** `supabase/functions/compose-label-sheet/index.ts`

Update PrintConfig interface:
```typescript
interface PrintConfig {
  enablePrintMarks: boolean;
  bleedMm: number;
  cropMarkOffsetMm: number;
  trimWidthMm?: number;
  trimHeightMm?: number;
  colorMode?: 'rgb' | 'cmyk';
  region?: 'us' | 'eu' | 'other';
  clientRenderedMarks?: boolean;  // New: skip server drawing
}
```

Update full-page processing logic:
```typescript
// Check if client already rendered print marks
const skipServerMarks = printConfig?.clientRenderedMarks === true;

if (applyPrintFeatures && !skipServerMarks) {
  // ... existing server-side bleed/crop mark logic
} else {
  // Just copy pages directly (marks already rendered by client)
  const pages = await outputPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());
  pages.forEach(page => outputPdf.addPage(page));
}
```

### Step 4: Add CMYK Logging

**File:** `supabase/functions/compose-label-sheet/index.ts`

Add detailed logging:
```typescript
console.log('[compose] printConfig received:', JSON.stringify(printConfig));
console.log('[compose] applyCmyk check:', {
  colorMode: printConfig?.colorMode,
  result: applyCmyk
});
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/polotno/PolotnoPdfGenerator.tsx` | Enable native crop marks, add `clientRenderedMarks` flag |
| `src/lib/polotno/pdfBatchExporter.ts` | Add `clientRenderedMarks` to PrintConfig interface |
| `supabase/functions/compose-label-sheet/index.ts` | Skip server-side marks when client-rendered, add CMYK logging |

---

## Result After Changes

```text
Export Flow (New):
1. Polotno exports PDF with includeBleed + cropMarkSize (native marks + clipping)
2. Server-side compose-label-sheet merges pages (no additional drawing)
3. CMYK conversion via pdfRest if requested
4. Final PDF has proper print marks from source

Benefits:
✅ Native crop marks (cleaner implementation)
✅ Proper bleed clipping (built into Polotno)
✅ Simpler server code (no manual mark drawing)
✅ CMYK verified and logged
```

---

## Testing Checklist

1. Create a certificate with full-bleed background
2. Enable bleed (3mm) and print marks
3. Export to PDF (RGB mode first)
4. Verify crop marks are visible and artwork is clipped
5. Enable CMYK mode and re-export
6. Check edge function logs to confirm CMYK conversion triggered
7. Download and verify CMYK output (color profile embedded)

