
## What’s actually happening (and why it still fails)

The VPS error `"unsupported number: NaN"` is being thrown inside `@polotno/pdf-export` while writing the PDF. That means **some numeric value in the scene is still ending up as NaN at render-time**, even after our client-side sanitization.

From code inspection, there’s a high-probability culprit:

- `src/lib/polotno/vdpResolver.ts` copies **root-level geometry** from the “current scene” into the merged/base scene without validation:

  - `merged.width = currentScene.width;`
  - `merged.height = currentScene.height;`
  - `if (currentScene.dpi !== undefined) merged.dpi = currentScene.dpi;`

If `currentScene.width/height/dpi` are `null` (or some invalid non-number) at any point, they get propagated into the final multi-page scene we send to the VPS.

Then the sanitizer currently does:
- `width: null` → `0`
- `height: null` → `0`
- `dpi: null` → `0`

Those “fixed” values are **not safe defaults** for PDF rendering (especially `dpi=0`), and they can easily cause internal `px -> pt` conversions to produce Infinity/NaN.

So the system is doing what we told it to do (sanitize), but the **default replacement policy is wrong for critical root keys**, and `vdpResolver` is likely introducing the invalid root geometry in the first place.

## Goal

Make the “Professional print output” pipeline robust and boring:
1) Never allow invalid `scene.width/height/dpi` into the exported scene.
2) Sanitize with **key-specific safe defaults** (especially for dpi/scale/opacity).
3) Fail early with a clear, actionable error if the scene’s root geometry is still broken.

---

## Implementation approach (small, targeted, and debuggable)

### A) Fix the source: validate root-level geometry propagation (vdpResolver)

**File:** `src/lib/polotno/vdpResolver.ts`

In `mergeLayoutToBase(...)`, change root transfers to:

- Only copy `width/height` if they are finite and > 0.
- Only copy `dpi` if finite and > 0 (and likely clamp to a sane range, e.g. 72–1200).
- Only copy `unit` if it’s one of the allowed values (`'mm' | 'cm' | 'in' | 'pt' | 'px'`).
- If invalid, **keep the base/merged values** (do not overwrite).

This prevents “bad root geometry” from ever reaching export.

**Why this matters:** even a single record/preview scene with a transient invalid root dimension can poison the merged scene and crash the VPS.

---

### B) Fix the sanitizer defaults: schema-aware replacements

**File:** `src/lib/polotno/sceneSanitizer.ts`

Update sanitization to replace invalid values with **correct defaults per key**, not a blanket `0`.

Proposed defaults:
- `dpi`: **300** (never 0)
- `opacity`: **1**
- `scaleX`, `scaleY`: **1**
- `lineHeight`: **1.2** (or 1)
- `strokeWidth`: **1** (or 0.75 if you prefer)
- `rotation`, `skewX`, `skewY`, `x`, `y`: **0**
- `width`, `height`: **0** is acceptable for *some* elements, but **root-level scene.width/scene.height must be > 0**, so we should not rely on sanitizer to “fix” root geometry—validate it separately (next step).

Mechanics:
- Replace `DEFAULT_REPLACEMENT` with a function like `getReplacement(parentKey, path)`:
  - If `parentKey === 'dpi'` return 300
  - If `parentKey === 'opacity'` return 1
  - etc.

Also improve array handling so `parentKey` can be threaded into nested objects consistently (it’s fine as-is, but the replacements should be more correct).

---

### C) Add a hard “export preflight assert” for root geometry (fail fast, clear error)

**File:** `src/lib/polotno/pdfBatchExporter.ts`

Right before calling `exportMultiPagePdf` / `exportLabelsWithImposition`, validate:

- `scene.width` finite and > 0
- `scene.height` finite and > 0
- `scene.dpi` finite and > 0 (if missing, set 300 before export; if invalid, set 300 or error)

If invalid, stop export with a message like:
- “Export failed before sending to render service: invalid document dimensions (width/height/dpi). Please refresh the editor and try again.”

Also log a compact “root geometry snapshot”:
- width, height, dpi, unit, pages count
- first page’s child count

This makes the next failure actionable immediately without guessing.

---

### D) Keep the “safeBleed” and `cropMarks` handling consistent

You already added `safeBleed` and `cropMarks ?? false` in the exporter. As part of this pass we’ll ensure:

- Professional export always uses:
  - `bleed: safeBleed` (finite number)
  - `cropMarks: false` (since client injects marks when enabled OR we bypass VPS crop mark logic)

If the UI toggle says “Include 3mm bleed + crop marks”, we should:
- Inject client marks when enabled
- Still send `cropMarks: false` to VPS to avoid server-side injection paths

(From your screenshot the call is `/export-multipage`, and VPS is crashing inside `jsonToPDF`, so keeping the VPS option surface minimal is still good.)

---

## Files that will be changed

1) `src/lib/polotno/vdpResolver.ts`
   - Guard root geometry propagation in `mergeLayoutToBase`.

2) `src/lib/polotno/sceneSanitizer.ts`
   - Implement key-specific replacements (especially `dpi`, `opacity`, `scaleX/Y`).

3) `src/lib/polotno/pdfBatchExporter.ts`
   - Add export-time “root geometry preflight assert”
   - Ensure `cropMarks` is never sent as `true` to VPS for professional path (client is source of truth)
   - Keep the existing `safeBleed` coercion

---

## Verification procedure (what we should see after this)

1) In Preview app, hard refresh.
2) Run “Generate PDFs” with:
   - Professional print output: ON
   - Color mode: CMYK
3) If it fails:
   - The UI should now show a clear *preflight* error if root geometry is invalid (instead of a mysterious VPS NaN).
4) If it succeeds:
   - The VPS call `/export-multipage` should return 200.
   - The resulting PDF should include bleed/crops (via client-injected marks) and CMYK mode.

---

## Why this should finally stop the NaN loop

- Right now the pipeline can “successfully sanitize” a broken dpi/width/height into values that still break rendering (notably `dpi=0`).
- By preventing invalid root geometry from being written (vdpResolver) and using sane replacements (sanitizer), we remove the major class of NaN-producing math at the rendering layer.
- By asserting root geometry right before export, we prevent silent corruption from ever reaching the VPS again.

---

## One critical unknown (we’ll handle without extra back-and-forth)

We don’t currently know *why* `currentScene.width/height/dpi` is becoming `null`/invalid—however, the above changes make that irrelevant for reliability, and the new logs will tell us exactly when it happens so we can optionally trace it later without blocking exports.
