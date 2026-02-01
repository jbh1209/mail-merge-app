
## Goal
Fix the client-side CMYK conversion failure (Ghostscript WASM) so CMYK/PDF-X3 conversion reliably works in the browser.

## What’s happening (root cause)
From your screenshot, the browser console shows:

- `Ghostscript initialization failed: Failed to fetch dynamically imported module: .../assets/gs.js`
- A 404 for `/assets/gs.js`

`@imgly/plugin-print-ready-pdfs-web` computes an asset directory (often the same directory as the current JS bundle, typically `/assets/`) and then tries to dynamically import `gs.js` and fetch `gs.wasm` + ICC profiles from that directory.

In our build, those extra files are not being emitted into `/assets/`, so the plugin can’t find them and CMYK conversion fails.

## Approach
Host the plugin’s runtime assets as static files in `public/` and explicitly tell the converter where to load them from using the plugin’s `assetPath` option (documented by IMG.LY).

This makes the paths stable and avoids reliance on where Vite happens to place hashed bundles.

---

## Implementation steps

### 1) Add the Ghostscript + ICC assets to `public/`
Copy these files from:
`node_modules/@imgly/plugin-print-ready-pdfs-web/dist/`

Into a stable public folder, e.g.:
`public/print-ready-pdfs/`

Files needed:
- `gs.js`
- `gs.wasm`
- `GRACoL2013_CRPC6.icc`
- `ISOcoated_v2_eci.icc`
- `sRGB_IEC61966-2-1.icc`

Expected final URLs:
- `/print-ready-pdfs/gs.js`
- `/print-ready-pdfs/gs.wasm`
- `/print-ready-pdfs/ISOcoated_v2_eci.icc` (EU FOGRA)
- `/print-ready-pdfs/GRACoL2013_CRPC6.icc` (US GRACoL)
- `/print-ready-pdfs/sRGB_IEC61966-2-1.icc`

### 2) Force the plugin to use that asset folder
Update `src/lib/polotno/cmykConverter.ts` so every `convertToPDFX3(...)` call passes:

- `assetPath: '/print-ready-pdfs/'`

Example shape:
```ts
return convertToPDFX3(pdfBlob, {
  outputProfile: options.profile,
  title: options.title ?? 'Print-Ready Export',
  flattenTransparency: options.flattenTransparency ?? true,
  assetPath: '/print-ready-pdfs/',
});
```

This prevents the plugin from trying (and failing) to load from `/assets/`.

### 3) (Optional but recommended) Import the browser entry explicitly
To avoid any bundler/conditional-export weirdness, change the import to:

- from `@imgly/plugin-print-ready-pdfs-web/browser`

This ensures the browser build is always used.

### 4) Add a fast preflight check (better error messaging)
Before starting conversion, do a lightweight “are assets reachable” check:
- `fetch('/print-ready-pdfs/gs.js', { method: 'HEAD' })`
- `fetch('/print-ready-pdfs/gs.wasm', { method: 'HEAD' })`

If either fails, show a clear UI message:
- “CMYK converter assets could not be loaded. Please refresh and try again, or use RGB export.”

This makes failures obvious and avoids confusing “Edge Function non‑2xx” cascades.

### 5) Verify the server-side compose step isn’t failing independently
Your screenshot also shows a 500 to the backend compose endpoint.
After CMYK is fixed, if that 500 persists, we’ll:
- Pull the latest backend function logs for `compose-label-sheet`
- Confirm the deployed code matches the repository version (we previously had a historical `applyCmyk is not defined` runtime error in older deployments)

This is likely secondary noise caused by the client failing mid-pipeline, but we’ll confirm.

---

## Testing checklist (what you’ll do after the fix)
1. Reload the app with DevTools open (to avoid cached 404s).
2. Generate PDFs with CMYK enabled.
3. Confirm in Network tab:
   - `gs.js` returns 200
   - `gs.wasm` returns 200
   - the relevant ICC profile returns 200
4. Confirm the progress reaches “CMYK conversion complete”.
5. Download PDF and verify in Acrobat:
   - Output Intent present
   - Color space shows DeviceCMYK / PDF/X-3 metadata

---

## Files we will touch
- `public/print-ready-pdfs/*` (new static assets)
- `src/lib/polotno/cmykConverter.ts` (pass `assetPath`, possibly change import)
- (Optional) `src/lib/polotno/pdfBatchExporter.ts` (preflight + friendlier errors)
- (Only if needed) `src/components/polotno/PolotnoPdfGenerator.tsx` (surface preflight error clearly)

---

## Notes / constraints
- This fix is compatible with both Preview and Published environments because it relies on `public/` static files.
- Your existing COOP/COEP headers are already correct for SharedArrayBuffer/WASM workers; this issue is purely “files not found”.
