

# Fix: True Vector CMYK PDFs with Crop Marks

## Root Cause

The Polotno docs reveal the problem on line 172:

> "Install GhostScript on the host machine to enable PDF/X-1a conversion. Without GhostScript the conversion falls back to standard PDF output."

And line 139:

> "pdfx1a: true ... CMYK conversion, **transparency flattening**, and font outlining"

So `pdfx1a: true` either:
- Falls back silently if GS is missing (producing a basic/raster PDF), OR
- Uses Ghostscript internally with default flags that flatten transparency -- which rasterizes everything

Either way, `pdfx1a: true` is the cause of the rasterization. We cannot use it.

## The Real Fix: Three-Pass Pipeline

```text
Pass 1: Polotno renders VECTOR RGB PDF (pdfx1a: false)
        --> True vectors, outlined fonts, no rasterization

Pass 2: Ghostscript converts RGB to CMYK with vector-safe flags
        --> Preserves vectors, only converts color space
        --> Uses the specific flags that prevent flattening

Pass 3: pdf-lib adds crop marks + TrimBox/BleedBox (additive only)
        --> Already implemented and working
```

## What Changes in `tmp/vps/server.js`

### 1. Add back Ghostscript CMYK conversion with vector-safe flags

```javascript
async function convertToCmykSafe(inputPath, outputPath, iccProfile) {
  const profilePath = iccProfile === 'fogra39'
    ? '/app/icc/ISOcoated_v2_eci.icc'
    : '/app/icc/GRACoL2013_CRPC6.icc';

  const gsArgs = [
    'gs',
    '-dBATCH', '-dNOPAUSE', '-dQUIET',
    '-sDEVICE=pdfwrite',
    '-dColorConversionStrategy=/CMYK',
    '-dProcessColorModel=/DeviceCMYK',
    '-dPreserveHalftoneInfo=true',
    '-dPreserveOverprintSettings=true',
    // CRITICAL: Do NOT use -dPDFSETTINGS=/prepress (causes flattening)
    // CRITICAL: Do NOT flatten transparency
    `-sOutputICCProfile=${profilePath}`,
    `-sOutputFile=${outputPath}`,
    inputPath,
  ];

  await execAsync(gsArgs.join(' '));
}
```

These specific Ghostscript flags:
- `-dColorConversionStrategy=/CMYK` -- converts colors only
- `-dProcessColorModel=/DeviceCMYK` -- sets output color model
- `-dPreserveHalftoneInfo=true` -- keeps print settings
- `-dPreserveOverprintSettings=true` -- keeps overprint
- No `-dPDFSETTINGS=/prepress` -- this is what causes transparency flattening

### 2. Update all export endpoints to three-pass flow

```javascript
// Pass 1: Polotno vector RGB (NO pdfx1a)
await jsonToPDF(scene, vectorPath, {
  title: options.title || 'MergeKit Export',
  includeBleed: bleedPx > 0,
  // pdfx1a is intentionally NOT set -- keeps true vectors
});

// Pass 2: Ghostscript CMYK (if requested) -- vector-safe
let cmykPath = vectorPath;
if (wantCmyk) {
  cmykPath = path.join(TEMP_DIR, `${jobId}-cmyk.pdf`);
  await convertToCmykSafe(vectorPath, cmykPath, options.iccProfile);
}

// Pass 3: pdf-lib crop marks (if requested) -- additive only
let finalPath = cmykPath;
if (wantCropMarks && bleedMm > 0) {
  await addCropMarksAndBoxes(cmykPath, bleedMm, markedPath);
  finalPath = markedPath;
}
```

### 3. Ensure ICC profiles are available on the VPS

The VPS Docker image needs GRACoL and Fogra ICC profiles at `/app/icc/`. These are already in the project at `public/print-ready-pdfs/`.

### 4. Update health endpoint

Report the three-pass pipeline status and verify Ghostscript is installed.

## What Does NOT Change

- The `addCropMarksAndBoxes()` function stays exactly as-is (it works)
- The edge function proxy stays as-is (it passes everything through)
- The client-side code stays as-is (it already sends `cmyk`, `bleed`, `cropMarks`, `iccProfile`)
- The sanitizer stays as-is

## Files to Change

1. **`tmp/vps/server.js`** -- Add `convertToCmykSafe()` function, update `/export-multipage`, `/render-vector`, `/export-labels`, and `/batch-render-vector` to use three-pass pipeline (vector RGB, then GS CMYK, then pdf-lib marks). Remove `pdfx1a: true` from all `jsonToPDF` calls.

## Verification

After deploying:
1. Export with CMYK + bleed + crop marks enabled
2. Open in Adobe Acrobat:
   - Zoom into text: should be sharp vector outlines (not pixelated)
   - Output Preview: should show true CMYK channels (not RGB embedded in CMYK wrapper)
   - Crop marks visible at corners
   - TrimBox and BleedBox set in page properties

