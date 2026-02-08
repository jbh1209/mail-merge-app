
# Fix: CMYK Export NaN Error — Root Cause and Solution

## Summary

The VPS continues to crash with `"unsupported number: NaN"` despite:
1. Client-side sanitizer being implemented
2. `cropMarks: false` being explicitly sent

**The sanitizer is running on the correct combined scene, but the VPS is still receiving NaN values.** This means either:
- The sanitizer is not being applied at the right point in the export flow
- `JSON.stringify` is converting `NaN` → `null`, but the VPS expects numeric values and crashes when calculating with `null`
- There's a timing/caching issue where the stale code is still running in the preview

## Root Cause Identification

After reviewing the code in detail, I found the following flow issues:

### Problem 1: VPS `pdfx1a` Option
The deployed VPS (`tmp/vps/server.js` line 173–176) uses:
```javascript
await jsonToPDF(scene, outputPath, {
  pdfx1a: options.cmyk,
  title: options.title || 'MergeKit Export',
});
```

When `pdfx1a: true` is passed, `@polotno/pdf-export` internally runs Ghostscript with prepress settings that can fail on edge-case numeric values.

### Problem 2: Bleed/CropMarks Options Passed to VPS
The client sends `bleed: printConfig?.bleedMm` (line 601 in pdfBatchExporter.ts). If `bleedMm` is `undefined` or `null`, the VPS may interpret this as `NaN` during internal calculations (mm → px conversion).

### Problem 3: Scene Dimensions After Clone
The `resolveVdpVariables` function uses `JSON.parse(JSON.stringify(scene))` for cloning. If any numeric property is `NaN`, this converts it to `null` in the JSON. The VPS may then read `null` as a number and get `NaN` during arithmetic.

## Recommended Fix

A single, surgical change: **Don't send `bleed` to the VPS if it's falsy, and ensure the VPS receives zero-safe defaults for all print options.**

### Step 1: Patch `pdfBatchExporter.ts` Export Options (Primary Fix)

When calling `exportMultiPagePdf`, sanitize the options object itself:

```typescript
// Before sending to VPS, ensure numeric options are always valid numbers
const result = await exportMultiPagePdf(combinedScene, {
  cmyk: true,
  title: 'MergeKit Export',
  bleed: Number.isFinite(printConfig?.bleedMm) ? printConfig.bleedMm : 0,
  cropMarks: false, // Already forced to false
});
```

Same for `exportLabelsWithImposition`.

### Step 2: Patch `vectorPdfExporter.ts` Request Body

In the fetch request body, coerce `bleed` to 0 if it's not a valid finite number:

```typescript
body: JSON.stringify({
  scene: sanitizedScene,
  options: {
    cmyk: options.cmyk ?? false,
    title: options.title ?? 'MergeKit Export',
    bleed: Number.isFinite(options.bleed) ? options.bleed : 0,
    cropMarks: options.cropMarks ?? false,
  },
}),
```

### Step 3: Enhance Sanitizer to Handle `null` Values

The current sanitizer only checks `Number.isFinite(obj)` for numbers. But when the scene is cloned, `NaN` becomes `null` in JSON. Extend the sanitizer to also detect numeric keys that are `null`:

```typescript
// In deepSanitize, after the primitives check:
// If a key is expected to be numeric (like x, y, width, height, fontSize, etc.)
// and the value is null, replace with 0
const NUMERIC_KEYS = new Set([
  'x', 'y', 'width', 'height', 'rotation', 'opacity', 'fontSize',
  'strokeWidth', 'cropX', 'cropY', 'cropWidth', 'cropHeight', 'bleed',
  'dpi', 'letterSpacing', 'lineHeight', 'cornerRadius',
]);

// When value is null and key is in NUMERIC_KEYS, replace with 0
```

### Step 4: Add Pre-flight Scene Dump for Debugging

Before the VPS call, log the first 500 characters of the stringified scene so we can see exactly what's being sent:

```typescript
const sceneStr = JSON.stringify(combinedScene);
console.log('[PolotnoExport] Scene preview (first 500 chars):', sceneStr.slice(0, 500));
```

This helps identify the actual source of `null`/`NaN` values.

## Files to Modify

1. `src/lib/polotno/pdfBatchExporter.ts`
   - Lines 598–603: Coerce `bleed` to 0 if not finite
   - Lines 621–625: Same for label export path

2. `src/lib/polotno/vectorPdfExporter.ts`
   - Lines 178–184: Coerce `bleed` in fetch body
   - Lines 280–286: Same for label export

3. `src/lib/polotno/sceneSanitizer.ts`
   - Enhance `deepSanitize` to replace `null` with `0` for known numeric keys

## Expected Outcome

1. VPS no longer receives `null` or `undefined` for numeric fields
2. The sanitizer catches any remaining `NaN` values from upstream logic
3. Export succeeds with proper CMYK conversion
4. Console shows preflight report confirming no issues (or issues that were fixed)

## Verification Steps

1. Hard refresh the preview app
2. Open browser console
3. Click "Export" with Professional print output ON
4. Check for the "SCENE PREFLIGHT VALIDATION REPORT" in console
5. Verify the export completes successfully
6. Open the PDF to confirm it rendered correctly
