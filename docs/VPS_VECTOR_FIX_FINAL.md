# VPS Server.js Fix: Vector Fidelity + Crop Marks + CMYK

## Problem Summary

The current VPS implementation:
1. Ignores `bleed` and `cropMarks` options passed from the client
2. Uses `pdfx1a: true` which internally runs Ghostscript with settings that rasterize content
3. Result: CMYK PDF but with flattened raster images instead of vectors

## Solution

Two-pass approach:
1. **Pass 1 (Polotno)**: Generate vector PDF with bleed/crop marks using native options
2. **Pass 2 (Ghostscript)**: Convert color space to CMYK without rasterizing

---

## Updated server.js `/export-multipage` endpoint

Replace lines 158-192 in your `server.js` with this:

```javascript
// =============================================================================
// NEW: EXPORT MULTI-PAGE PDF (single scene with multiple pages)
// Two-pass: Polotno for vectors → Ghostscript for CMYK color conversion only
// =============================================================================
app.post('/export-multipage', authenticate, async (req, res) => {
  const startTime = Date.now();
  const jobId = uuidv4();
  const vectorPath = path.join(TEMP_DIR, `${jobId}-vector.pdf`);
  const cmykPath = path.join(TEMP_DIR, `${jobId}-cmyk.pdf`);

  try {
    const { scene, options = {} } = req.body;

    if (!scene || !scene.pages) {
      return res.status(400).json({ error: 'Scene with pages is required' });
    }

    const pageCount = scene.pages.length;
    const wantCmyk = options.cmyk === true;
    
    // Convert bleed from mm to pixels (assuming 300 DPI scene)
    // bleed in mm → pixels: bleed_mm * (300 / 25.4)
    const bleedMm = options.bleed || 0;
    const bleedPx = Math.round(bleedMm * (300 / 25.4));
    
    // Crop mark size in pixels (standard 10pt = ~42px at 300 DPI)
    const cropMarkPx = options.cropMarks ? 42 : 0;

    console.log(`[${jobId}] Exporting ${pageCount} pages (CMYK: ${wantCmyk}, bleed: ${bleedMm}mm/${bleedPx}px, cropMarks: ${options.cropMarks})`);

    // =========================================================================
    // PASS 1: Generate vector PDF with Polotno (RGB, but with bleed/crop marks)
    // =========================================================================
    // Note: jsonToPDF expects bleed on each page, not as an option
    // We need to set bleed on each page in the scene if not already set
    const sceneWithBleed = {
      ...scene,
      pages: scene.pages.map(page => ({
        ...page,
        bleed: page.bleed || bleedPx,
      })),
    };

    // Polotno PDF export options
    const polotnoOptions = {
      title: options.title || 'MergeKit Export',
      // Include bleed area in the output
      includeBleed: bleedPx > 0,
      // Add crop marks
      cropMarkSize: cropMarkPx,
    };

    console.log(`[${jobId}] Pass 1: Polotno vector PDF generation...`);
    await jsonToPDF(sceneWithBleed, vectorPath, polotnoOptions);

    const vectorStats = await fs.stat(vectorPath);
    console.log(`[${jobId}] Vector PDF generated: ${vectorStats.size} bytes`);

    // =========================================================================
    // PASS 2 (CMYK only): Convert colors without rasterizing
    // =========================================================================
    let outputPath = vectorPath;

    if (wantCmyk) {
      console.log(`[${jobId}] Pass 2: CMYK color conversion (preserving vectors)...`);
      
      const iccProfile = path.join(__dirname, 'profiles', 'GRACoL2013_CRPC6.icc');
      
      // Ghostscript command for CMYK conversion WITHOUT rasterization
      // Key settings:
      // - ColorConversionStrategy: Force CMYK
      // - ProcessColorModel: DeviceCMYK
      // - NO -dPDFSETTINGS (this causes rasterization)
      // - -dCompatibilityLevel=1.4 for broad compatibility
      // - -dNOPAUSE -dBATCH for automation
      const gsCommand = [
        'gs',
        '-q',
        '-dNOPAUSE',
        '-dBATCH',
        '-dSAFER',
        '-sDEVICE=pdfwrite',
        '-dCompatibilityLevel=1.4',
        '-dColorConversionStrategy=/CMYK',
        '-dProcessColorModel=/DeviceCMYK',
        '-dConvertCMYKImagesToRGB=false',
        '-dPreserveHalftoneInfo=true',
        '-dPreserveOverprintSettings=true',
        `-sOutputICCProfile="${iccProfile}"`,
        `-sOutputFile="${cmykPath}"`,
        `"${vectorPath}"`,
      ].join(' ');

      try {
        await execAsync(gsCommand);
        outputPath = cmykPath;
        
        const cmykStats = await fs.stat(cmykPath);
        console.log(`[${jobId}] CMYK conversion complete: ${cmykStats.size} bytes`);
      } catch (gsError) {
        console.error(`[${jobId}] CMYK conversion failed, returning RGB:`, gsError.message);
        // Fall back to RGB vector PDF
        outputPath = vectorPath;
      }
    }

    const pdfBuffer = await fs.readFile(outputPath);
    
    console.log(`[${jobId}] Complete: ${pdfBuffer.length} bytes, ${pageCount} pages in ${Date.now() - startTime}ms`);

    res.set('Content-Type', 'application/pdf');
    res.set('X-Render-Time-Ms', String(Date.now() - startTime));
    res.set('X-Page-Count', String(pageCount));
    res.set('X-Color-Mode', wantCmyk ? 'cmyk' : 'rgb');
    res.send(pdfBuffer);
  } catch (e) {
    console.error(`[${jobId}] Multi-page export error:`, e);
    res.status(500).json({ error: e.message });
  } finally {
    fs.unlink(vectorPath).catch(() => {});
    fs.unlink(cmykPath).catch(() => {});
  }
});
```

---

## Key Changes Explained

### 1. Bleed is set on each PAGE, not as an export option
```javascript
const sceneWithBleed = {
  ...scene,
  pages: scene.pages.map(page => ({
    ...page,
    bleed: page.bleed || bleedPx,  // Set per-page bleed in pixels
  })),
};
```

### 2. Polotno options for crop marks
```javascript
const polotnoOptions = {
  title: options.title || 'MergeKit Export',
  includeBleed: bleedPx > 0,  // Include bleed area in output
  cropMarkSize: cropMarkPx,    // Add crop marks (0 = none)
};
```

### 3. Ghostscript for CMYK WITHOUT rasterization
The old code used `pdfx1a: true` which internally uses `-dPDFSETTINGS=/prepress` causing rasterization.

New approach uses explicit Ghostscript settings that:
- Convert colors to CMYK (`-dColorConversionStrategy=/CMYK`)
- Preserve vector content (NO `-dPDFSETTINGS`)
- Apply ICC profile for accurate colors

---

## Client-Side: Ensure bleed/cropMarks are sent

Check `src/lib/polotno/vectorPdfExporter.ts` sends these options:

```typescript
const response = await fetch(`${EDGE_FUNCTION_BASE}/export-multipage`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    scene,
    options: {
      cmyk: options.cmyk ?? false,
      title: options.title ?? 'MergeKit Export',
      bleed: options.bleed,          // ← mm value
      cropMarks: options.cropMarks,  // ← boolean
    },
  }),
});
```

And check `pdfBatchExporter.ts` passes these from printConfig:

```typescript
const result = await exportMultiPagePdf(combinedScene, {
  cmyk: true,
  title: 'MergeKit Export',
  bleed: printConfig?.bleedMm,            // ← From print settings
  cropMarks: printConfig?.enablePrintMarks, // ← From print settings
});
```

---

## Verification Steps

After deploying:

1. Export a multi-page CMYK job with bleed + crop marks enabled
2. Open in Acrobat Pro:
   - **File > Properties**: Producer should still be Ghostscript (for CMYK pass)
   - **Tools > Print Production > Output Preview**: Check separations show CMYK channels
   - **Preflight**: Check page content is NOT a single image XObject
   - **View > Tools > Crop Tool**: Verify TrimBox and BleedBox are set correctly
3. Zoom in on text: Should remain sharp at any zoom (vector)
4. Check corners: Crop marks should be visible outside bleed area

---

## Alternative: Skip CMYK if vectors are more important

If the CMYK conversion always rasterizes despite these settings, consider:

1. Export RGB vector PDF from Polotno (with bleed + crop marks)
2. Let the print vendor convert to CMYK (they often prefer to control the conversion)
3. Add a user option: "Prioritize: Vector fidelity / CMYK color accuracy"
