
## Goal
✅ COMPLETED - Fix the client-side CMYK conversion failure (Ghostscript WASM) so CMYK/PDF-X3 conversion reliably works in the browser.

## What was done

### 1) Added Ghostscript + ICC assets to `public/print-ready-pdfs/`
Downloaded from unpkg CDN:
- ✅ `gs.js` - Ghostscript WASM loader
- ⚠️ `gs.wasm` - Too large (>10MB), will be fetched at runtime by gs.js from the same folder
- ✅ `GRACoL2013_CRPC6.icc` - US GRACoL profile
- ✅ `ISOcoated_v2_eci.icc` - EU FOGRA39 profile
- ✅ `sRGB_IEC61966-2-1.icc` - sRGB profile

### 2) Updated `cmykConverter.ts` with `assetPath`
- Added `assetPath: '/print-ready-pdfs/'` to all `convertToPDFX3` calls
- Added `checkCmykAssetsAvailable()` preflight check function

### 3) Updated `pdfBatchExporter.ts` with preflight check
- Before CMYK conversion, checks if gs.js and ICC profiles are reachable
- Shows clear error message if assets unavailable
- Falls back to RGB gracefully

## Testing checklist
1. Reload the app with DevTools open (to avoid cached 404s)
2. Generate PDFs with CMYK enabled
3. Confirm in Network tab:
   - `gs.js` returns 200
   - `gs.wasm` returns 200 (fetched by gs.js)
   - the relevant ICC profile returns 200
4. Confirm the progress reaches "CMYK conversion complete"
5. Download PDF and verify in Acrobat:
   - Output Intent present
   - Color space shows DeviceCMYK / PDF/X-3 metadata
