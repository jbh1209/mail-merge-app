
## What the screenshot is telling us (root cause)

Your screenshot shows two critical console errors:

1) **404 for the WASM binary**
- `Failed to load /print-ready-pdfs/gs.wasm (404)`

2) **Ghostscript aborts because WASM can’t be loaded**
- `Ghostscript initialization failed: Aborted (both async and sync fetching of the wasm failed)`

So the CMYK pipeline is failing **before it even starts converting** because **Ghostscript’s `gs.wasm` file is missing from your deployed static assets**.

We already host:
- `/print-ready-pdfs/gs.js`
- ICC profiles (`GRACoL…`, `ISOcoated…`, `sRGB…`)

But we do **not** currently host:
- `/print-ready-pdfs/gs.wasm`  ✅ required

This matches what I see in the repository: `public/print-ready-pdfs/` contains `gs.js` + ICCs, but **no `gs.wasm`**.

---

## High-confidence fix (what we will change)

### 1) Add the missing file to public assets
Copy:
- `node_modules/@imgly/plugin-print-ready-pdfs-web/dist/gs.wasm`

To:
- `public/print-ready-pdfs/gs.wasm`

This will make the URL in your screenshot return `200` instead of `404`.

### 2) Strengthen the preflight check so we fail fast (with a clear message)
Update `checkCmykAssetsAvailable()` in `src/lib/polotno/cmykConverter.ts` to also HEAD-check:
- `${ASSET_PATH}gs.wasm`

Right now it only checks `gs.js` and one ICC file, which is why we didn’t catch this earlier.

### 3) Verify we’re actually using the fixed `assetPath` everywhere
Confirm that every `convertToPDFX3(...)` call includes:
- `assetPath: "/print-ready-pdfs/"`

(Your file already does this; we’ll keep it consistent.)

### 4) Post-fix validation steps (to confirm it’s truly resolved)
After we add `gs.wasm`, you’ll test again and confirm in DevTools Network tab:
- `GET /print-ready-pdfs/gs.js` → **200**
- `GET /print-ready-pdfs/gs.wasm` → **200**
- `GET /print-ready-pdfs/ISOcoated_v2_eci.icc` → **200**
- `GET /print-ready-pdfs/GRACoL2013_CRPC6.icc` → **200**

Then run CMYK export and verify the UI no longer shows “CMYK conversion failed”.

---

## Secondary check (only if it still fails after gs.wasm is present)

If `gs.wasm` is loading fine (200) but conversion still fails, the next most likely blocker is **cross-origin isolation** (SharedArrayBuffer requirements).

Symptoms of that issue would look like:
- errors mentioning `SharedArrayBuffer`, `cross-origin isolation`, `COOP`, or `COEP`

Your project has `public/_headers` set, but we should confirm the browser is actually receiving headers on the document response:
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

If those headers are missing in Preview/Published, we’ll plan a hosting/header strategy that Lovable Cloud supports (since these headers must come from the server, not JS).

Note: Your screenshot currently shows a straight 404 for `gs.wasm`, so **we should not jump to COOP/COEP changes until the file exists**.

---

## Files we will change

1) **Add**
- `public/print-ready-pdfs/gs.wasm`

2) **Edit**
- `src/lib/polotno/cmykConverter.ts`  
  - Update `checkCmykAssetsAvailable()` to check `gs.wasm` as well

(No other changes should be needed if this is the only failure.)

---

## Why this should fix it definitively

`gs.js` is just the loader/runtime glue code. The actual Ghostscript engine is inside `gs.wasm`. If `gs.wasm` is missing, Ghostscript cannot initialize and the plugin will always abort—exactly what your screenshot shows.

Once `gs.wasm` is present at the same `assetPath` we already configured, Ghostscript should initialize and CMYK conversion can proceed.

---

## Acceptance criteria

We’ll consider it fixed when:
- The console no longer shows any `404` for `/print-ready-pdfs/gs.wasm`
- CMYK conversion completes without the fallback warning
- (Optional) Acrobat shows PDF/X-3 / CMYK output intent as expected

---

## One quick clarification (helps target the next step if needed)
After we add `gs.wasm`, are you testing on:
- Preview URL, Published URL, or both?

(Headers/caching can differ between them; knowing which one fails helps if we need the secondary COOP/COEP step.)
