
## What the screenshot proves (and why previous “crop mark” changes didn’t help)
The VPS is still returning:

- `VPS error: 500 — {"error":"unsupported number: NaN"}`

That error is thrown by `@polotno/pdf-export` when **any numeric field anywhere in the scene JSON** is `NaN` (or `Infinity`). This is not “crop marks missing” anymore — it’s “the JSON we send contains at least one invalid number”.

Even if we turn crop-marks off on the server, this error will still happen if **any element** has an invalid numeric value (x/y/width/height/rotation/fontSize/strokeWidth/cropWidth/etc), or if `scene.width/scene.height` are invalid.

So the next correct step is not “tweak crop mark geometry again”. The correct step is:
1) **find the exact path(s) that are NaN**, and  
2) **make the export path resilient** by sanitizing/repairing them (or failing with a precise report).

## Do I know what the issue is?
I know what the issue *is* at a system level: the scene JSON being sent to the VPS includes one or more non‑finite numbers.  
I do *not yet* know which exact field(s) in your scene become NaN for your template/data combination — we need deterministic detection.

## Strategy (careful, minimal-risk, and reversible)
We will add a **scene preflight validator + sanitizer** on the client, right before we call the VPS.

### Goals
- **Never** send NaN/Infinity to the VPS.
- Produce **actionable diagnostics** (e.g. “pages[0].children[12].fontSize = NaN”) so we can fix root causes after the export succeeds again.
- Keep behavior stable: sanitize only non-finite numbers; do not otherwise change the scene.

### Default behavior choice (since you said “I have no idea”)
We’ll implement **Auto-fix + diagnostics**:
- Replace `NaN/Infinity` with safe defaults (usually `0`) *only at the invalid fields*.
- Log a compact report to the console.
- Surface a user-visible warning like “Fixed 3 invalid numeric values before export” (so you know it happened).
- If export still fails, show the first ~10 offending paths in the error UI.

This avoids blocking you while still giving us the evidence to fix the root cause later.

## Implementation steps (exactly what will change)

### 1) Add a new utility: `sanitizePolotnoSceneForVps(scene)`
Create a small utility that:
- Deep-walks the entire scene object (including pages, children, custom fields).
- Detects any number that fails `Number.isFinite(n)`.
- Replaces it with `0` (or another safe fallback where appropriate).
- Returns:
  - `sanitizedScene`
  - `issues`: list of `{ path: string; value: unknown }`
  - `changedCount`

Important details:
- We will **not** clamp normal values.
- We will **not** mutate the original scene object (clone first).
- We will cap diagnostics output to avoid huge payloads (e.g., first 50 issues).

**Files:**
- Create: `src/lib/polotno/sceneSanitizer.ts` (new)

### 2) Run sanitizer immediately before VPS export (CMYK path)
In `src/lib/polotno/pdfBatchExporter.ts`, in the CMYK path right after:

- `combineRecordsIntoMultiPageScene(...)`
- `injectClientCropMarksIfNeeded(...)`

…we will run:
- `sanitizePolotnoSceneForVps(combinedScene)`

Then:
- use `sanitizedScene` for `exportMultiPagePdf(...)` / `exportLabelsWithImposition(...)`
- if `changedCount > 0`:
  - `console.warn` with a summarized table of issue paths
  - update progress message (non-blocking) e.g. “Preflight: fixed invalid numeric values”
  - optionally trigger a toast (non-destructive)

**Files:**
- Update: `src/lib/polotno/pdfBatchExporter.ts`

### 3) Add a second safety net in `vectorPdfExporter.ts`
Even if another call site exports a scene directly, we should protect it.

We’ll integrate the same sanitizer into:
- `exportMultiPagePdf`
- `exportLabelsWithImposition`
- (optional) `exportVectorPdf`

So **every** VPS call path is protected.

**Files:**
- Update: `src/lib/polotno/vectorPdfExporter.ts`

### 4) Improve “what failed” messaging (so you aren’t blind again)
When the VPS returns 500:
- we already attach `details` from the proxy.
- We’ll additionally include the client-side preflight summary in the thrown error, e.g.:

`VPS error: 500 … (Preflight fixed 2 invalid numbers; first issue: pages[0].children[5].fontSize was NaN)`

This makes it immediately obvious whether:
- the sanitizer found something and fixed it, or
- the NaN is coming from somewhere else (e.g., VPS-side processing).

**Files:**
- Update: `src/lib/polotno/pdfBatchExporter.ts` (error formatting)

### 5) (Optional but recommended) Add a one-click “Export Diagnostics” drawer
If you want maximum clarity with minimal back-and-forth:
- Add an “Export diagnostics” expandable section in the Generate PDFs modal that shows:
  - page count
  - scene width/height/dpi
  - print settings
  - count of preflight fixes
  - first N offending paths

This is optional; the console + error string may be enough.

**Files (optional):**
- Update: `src/components/polotno/PolotnoPdfGenerator.tsx`

## Why this is the safest next change
- It does not guess about crop marks or bleed behavior.
- It addresses the *actual crash condition* (`NaN` in JSON) directly.
- It gives us proof of the real upstream culprit, which could be:
  - an element with `width/height` getting corrupted,
  - a font scaling edge case producing `NaN` fontSize,
  - an image crop property becoming `NaN`,
  - a plugin/element type injecting unexpected numeric fields.

Once we know the exact offending paths, we can then fix the root cause properly (instead of playing whack-a-mole).

## Acceptance criteria (how we’ll know it’s fixed)
1) Export with Professional print output ON no longer 500s.
2) If any invalid numbers existed, you see a warning like “Preflight fixed X invalid numeric values”.
3) The resulting PDF generates successfully.
4) Next step after that: re-enable/verify crop mark rendering, now that the pipeline is stable.

## “Next things you might want” (after this is stable)
1) End-to-end test pass: export 1 record, 10 records, and 100+ records to ensure no regressions.
2) Add a persistent “Export diagnostics” panel (copy/paste report) for faster support.
3) Add progress phases for VPS export (“uploading scene”, “rendering”, “converting CMYK”, “finalizing”) via backend-side progress events (if you want smoother UX).
4) Add an automated “scene health check” button that runs preflight without exporting.
5) Add registration marks option (crosshair) in addition to crop marks once the NaN issue is eliminated.
