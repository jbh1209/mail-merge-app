

# Simplified Pipeline: Polotno Native CMYK + pdf-lib Crop Marks

## Current Problem

The VPS currently runs a two-pass pipeline (Polotno RGB then Ghostscript CMYK) which:
- Rasterizes/flattens vectors during the Ghostscript CMYK conversion
- Produces a flattened image instead of true vector output
- Still missing crop marks

## The Fix: Let Polotno Do What It's Built For

The Polotno docs clearly state that `pdfx1a: true` produces print-ready CMYK vector PDFs natively. The previous NaN crashes were caused by unsanitized scene data -- which the sanitizer now handles. So we go back to using Polotno's native CMYK, and only post-process for crop marks.

```text
Step 1: Polotno generates vector CMYK PDF with bleed
        jsonToPDF(scene, path, { pdfx1a: true, includeBleed: true })

Step 2: pdf-lib opens the PDF and adds crop marks + sets TrimBox/BleedBox
        (additive only -- does NOT re-encode or merge, so vectors stay intact)
```

That's the entire pipeline. No Ghostscript.

## What Changes on the VPS (`tmp/vps/server.js`)

### Remove Ghostscript CMYK conversion entirely

The `/export-multipage` endpoint simplifies to:

```javascript
// Step 1: Polotno native vector PDF with bleed + CMYK
await jsonToPDF(scene, vectorPath, {
  title: options.title || 'MergeKit Export',
  includeBleed: bleedPx > 0,
  pdfx1a: wantCmyk,  // Native CMYK -- sanitizer prevents NaN crashes
});

// Step 2: Add crop marks via pdf-lib (if requested)
if (wantCropMarks && bleedPx > 0) {
  await addCropMarksAndBoxes(vectorPath, bleedMm, markedPath);
  finalPath = markedPath;
}
```

### Add pdf-lib crop marks helper

A new function `addCropMarksAndBoxes()` that:
- Opens the Polotno-generated PDF with pdf-lib
- Calculates TrimBox from the known bleed value
- Draws 8 crop mark lines (2 per corner) outside the bleed area
- Sets TrimBox and BleedBox metadata on each page
- Saves the modified PDF

This is safe because pdf-lib is only **adding** lines and metadata -- not re-rendering or merging content. The original vector data stays untouched.

### Install pdf-lib on the VPS

```bash
npm install pdf-lib
```

### Same changes apply to `/render-vector` and `/export-labels`

All three export endpoints get the same simplified two-step logic.

## What Changes on the Client

### `src/lib/polotno/pdfBatchExporter.ts`

The client code is already mostly correct from the previous update. The only change is ensuring `cmyk: true` triggers `pdfx1a: true` on the VPS (which it will, since the VPS maps `options.cmyk` to `pdfx1a`).

No other client changes needed.

## What Does NOT Change

- The sanitizer stays as-is (it's the safety net that makes `pdfx1a` safe)
- The edge function proxy stays as-is (it already passes everything through)
- The client-side export flow stays as-is

## Technical Details: pdf-lib Crop Marks

```javascript
import { PDFDocument, rgb, PDFName, PDFArray, PDFNumber } from 'pdf-lib';

async function addCropMarksAndBoxes(inputPath, bleedMm, outputPath) {
  const pdfBytes = await fs.readFile(inputPath);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  
  const bleedPt = bleedMm * (72 / 25.4);  // mm to PDF points
  const markLength = 14;   // ~5mm in points
  const markOffset = 8.5;  // ~3mm gap between bleed edge and mark start
  const strokeWidth = 0.25;
  
  for (const page of pdfDoc.getPages()) {
    const { width, height } = page.getSize();
    
    // MediaBox = full page including bleed (what Polotno exported)
    // TrimBox = inset by bleedPt on all sides (where the cut happens)
    const trimX = bleedPt;
    const trimY = bleedPt;
    const trimW = width - (bleedPt * 2);
    const trimH = height - (bleedPt * 2);
    
    // Set TrimBox and BleedBox in the page dictionary
    // TrimBox = the final trimmed size
    // BleedBox = MediaBox (bleed extends to the edge)
    
    // Draw crop marks at each corner
    // 4 corners x 2 lines each = 8 lines
    // Each line starts outside the bleed area (offset from trim edge)
    // and extends markLength further out
    
    // Top-left horizontal, top-left vertical, etc.
    // All drawn with page.drawLine() in registration black
  }
  
  const modifiedBytes = await pdfDoc.save();
  await fs.writeFile(outputPath, modifiedBytes);
}
```

## Files to Change

1. **`tmp/vps/server.js`** -- Simplify to use `pdfx1a: true` for CMYK, add `addCropMarksAndBoxes()` post-processor, remove Ghostscript CMYK logic. Add `pdf-lib` import. Requires `npm install pdf-lib` on VPS and redeployment.

2. **No client-side or edge function changes needed** -- everything already passes the right parameters through.

## Verification

After deploying the updated server:
1. Export with Professional print output ON, CMYK selected, bleed enabled
2. Open in Adobe Acrobat:
   - Zoom into text: should be sharp vectors (not pixelated)
   - Tools > Print Production > Output Preview: should show CMYK channels
   - Crop marks visible outside the trim area
   - File > Properties: TrimBox and BleedBox should be set

## Why This Will Work

- `pdfx1a: true` is Polotno's official, documented way to produce CMYK PDFs
- The NaN crashes were caused by unsanitized data, which the sanitizer now fixes
- pdf-lib adding lines to an existing PDF is purely additive -- no content re-encoding
- No Ghostscript means no rasterization risk

