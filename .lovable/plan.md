

# Simplified Professional Print Pipeline

## The Problem (and why we kept going in circles)

The deployed VPS server (`tmp/vps/server.js`) calls `jsonToPDF` like this:

```text
await jsonToPDF(scene, outputPath, {
  pdfx1a: options.cmyk,   // <-- triggers internal Ghostscript, crashes on edge-case values
  title: options.title,
});
```

Two problems:
1. **`pdfx1a: true` causes the NaN crash** -- it triggers Polotno's internal Ghostscript/CMYK conversion which is fragile with certain scene values
2. **`includeBleed` and `cropMarkSize` are never passed** -- Polotno natively supports bleed and crop marks, but the VPS isn't using those options

Meanwhile, the `docs/VPS_SERVER_JS_COMPLETE.js` file already has the correct two-pass approach (Polotno for vectors, then separate Ghostscript for CMYK), but it was never deployed to the actual VPS.

## The Fix: Simple, Two-Pass Pipeline

The approach is straightforward -- let each tool do what it's good at:

```text
Step 1: Polotno generates a vector PDF with bleed + crop marks (RGB)
        jsonToPDF(scene, path, { includeBleed: true, cropMarkSize: 20 })

Step 2: Ghostscript converts RGB to CMYK (preserving vectors)
        gs -sDEVICE=pdfwrite -dColorConversionStrategy=/CMYK ...
```

No client-side crop mark injection. No scene JSON manipulation for marks. No `pdfx1a`. Just two clean steps.

## What Changes

### 1. Update VPS Server (`tmp/vps/server.js`)

Replace the `/export-multipage` endpoint:

**Before:**
```javascript
await jsonToPDF(scene, outputPath, {
  pdfx1a: options.cmyk,
  title: options.title || 'MergeKit Export',
});
```

**After:**
```javascript
// PASS 1: Vector PDF with native bleed + crop marks (RGB)
await jsonToPDF(scene, vectorPath, {
  title: options.title || 'MergeKit Export',
  includeBleed: true,
  cropMarkSize: bleedPx > 0 ? 20 : 0,
  // NO pdfx1a -- we handle CMYK separately
});

// PASS 2: CMYK conversion via Ghostscript (only if requested)
if (wantCmyk) {
  await execAsync(`gs -q -dNOPAUSE -dBATCH -dSAFER \
    -sDEVICE=pdfwrite \
    -dColorConversionStrategy=/CMYK \
    -dProcessColorModel=/DeviceCMYK \
    -dPreserveHalftoneInfo=true \
    -dPreserveOverprintSettings=true \
    -sOutputICCProfile="${iccProfile}" \
    -sOutputFile="${cmykPath}" \
    "${vectorPath}"`);
}
```

This is essentially what `docs/VPS_SERVER_JS_COMPLETE.js` already does but with Polotno's native bleed/crop mark support added.

### 2. Simplify Client Code (`src/lib/polotno/pdfBatchExporter.ts`)

Remove all client-side crop mark injection logic for the professional export path. The VPS handles everything. The client just needs to:
- Build the combined multi-page scene (already working)
- Send it with `bleed` value and `cropMarks: true`
- The VPS does the rest

Remove:
- `injectClientCropMarksIfNeeded` calls for professional export
- `sendCropMarksToVps = false` override
- Complex crop mark element generation in the JSON

### 3. Pass Bleed Value Properly

The client sends `bleedMm` in the options. The VPS converts mm to pixels and sets `bleed` on each page before calling `jsonToPDF`. Each page in the scene needs its `bleed` property set (in pixels) for Polotno to know the bleed size.

### 4. Keep the Sanitizer (Safety Net)

The scene sanitizer stays as a safety net but is no longer the primary defense. With `pdfx1a` removed, the NaN-sensitive Ghostscript path inside Polotno is bypassed entirely. The separate Ghostscript call for CMYK conversion is much more robust.

## Files to Change

1. **`tmp/vps/server.js`** -- Update `/export-multipage` to two-pass (Polotno with `includeBleed` + `cropMarkSize`, then Ghostscript for CMYK). This file needs to be redeployed to the VPS manually.

2. **`src/lib/polotno/pdfBatchExporter.ts`** -- Remove client-side crop mark injection for professional path. Send `cropMarks: true` and `bleed: bleedMm` to VPS.

3. **`src/lib/polotno/vectorPdfExporter.ts`** -- Pass `cropMarks` and `bleed` through to the edge function cleanly.

4. **`supabase/functions/render-vector-pdf/index.ts`** -- Ensure the edge function proxy passes `bleed` and `cropMarks` to the VPS unchanged.

## Why This Will Work

- Polotno's own `includeBleed` and `cropMarkSize` are battle-tested -- it's the same code path used by thousands of Polotno users for print exports
- Removing `pdfx1a` eliminates the fragile internal Ghostscript call that causes NaN crashes
- The separate Ghostscript CMYK pass uses well-known flags that preserve vectors
- No more injecting synthetic "line" elements into the JSON scene -- Polotno draws the crop marks itself as part of the PDF rendering

## Verification

1. Deploy updated `server.js` to VPS
2. Hard refresh the app
3. Export with Professional print output ON, CMYK selected
4. Result: vector PDF with bleed, crop marks, and CMYK color space
5. Verify in Adobe Acrobat: Output Preview shows CMYK, crop marks visible outside trim area

