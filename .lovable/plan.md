
# Fix Missing Crop Marks in CMYK PDF Export

## Problem Summary
Crop marks are not appearing in the CMYK vector PDF output despite the VPS passing `cropMarkSize` to `@polotno/pdf-export`.

## Root Cause Analysis
The `@polotno/pdf-export` Node.js package has **different options** than the browser-side `store.saveAsPDF()`:

| Option | `store.saveAsPDF()` (Browser) | `jsonToPDF()` (Node) |
|--------|------------------------------|----------------------|
| `includeBleed` | ✅ Supported | ❌ NOT Supported |
| `cropMarkSize` | ✅ Supported | ❌ NOT Supported |
| `pdfx1a` | ❌ | ✅ Supported |
| `spotColors` | ❌ | ✅ Supported |
| `metadata` | ❌ | ✅ Supported |

The VPS currently passes `cropMarkSize: 42` to `jsonToPDF()`, but this option is **silently ignored** because the Node package doesn't support it.

Bleed works because it's stored on the **page JSON data** (`page.bleed`), which the Node package respects when rendering.

## Solution Options

### Option A: Draw Crop Marks via Polotno Elements (Recommended)
Add invisible crop mark elements directly to the scene JSON before rendering:
- Add thin line elements at each corner of the trim box
- Position them in the bleed area (outside trim, inside media)
- Use registration black color
- These render as true vectors through Polotno

**Pros:** True vectors, no post-processing needed
**Cons:** Slightly more complex scene modification

### Option B: Post-Process with Ghostscript
After Polotno generates the PDF, use Ghostscript's `-dUseCropBox` or manual PostScript injection to add crop marks.

**Pros:** Separate from scene data
**Cons:** More complex, may affect vector quality

### Option C: Use PDF-lib to Add Marks After Ghostscript
After CMYK conversion, use a PDF library to draw crop marks on each page.

**Pros:** Clean separation of concerns
**Cons:** Adds another processing step

## Recommended Approach: Option A

Inject crop mark line elements into the Polotno scene JSON before calling `jsonToPDF()`. This produces native vector crop marks without post-processing.

## Implementation Plan

### 1. VPS Server Update (`server.js`)

Add a helper function to inject crop mark elements into the scene:

```text
┌─────────────────────────────────────────────────────────┐
│  Request arrives with scene JSON + options.cropMarks   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ If cropMarks enabled:                           │   │
│  │   For each page:                                │   │
│  │     - Calculate trim box corners                │   │
│  │     - Add 8 line elements (2 per corner)       │   │
│  │     - Position in bleed zone (offset from trim) │   │
│  │     - Set color to registration black          │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Pass modified scene to jsonToPDF()                     │
└─────────────────────────────────────────────────────────┘
```

**Crop mark geometry (per corner):**
- Mark length: 10mm (~42px at 300 DPI)
- Mark offset: 3mm (~35px at 300 DPI) from trim edge
- Stroke width: 0.25pt (hairline)
- Color: `#000000` (registration black)

### 2. Updated `/export-multipage` Endpoint Logic

```javascript
// Pseudo-code for crop mark injection
function injectCropMarks(scene, bleedPx, cropMarkLengthPx, cropMarkOffsetPx) {
  const modifiedPages = scene.pages.map(page => {
    const { width, height } = page;
    const bleed = page.bleed || bleedPx;
    
    // Trim box is the original page size
    // Crop marks go in the bleed zone
    const cropMarkElements = generateCropMarkLines(
      width,      // trim width
      height,     // trim height  
      bleed,      // bleed extension
      cropMarkLengthPx,
      cropMarkOffsetPx
    );
    
    return {
      ...page,
      children: [...(page.children || []), ...cropMarkElements]
    };
  });
  
  return { ...scene, pages: modifiedPages };
}
```

### 3. Crop Mark Line Elements

Each corner gets two perpendicular lines:

```javascript
// Example: Top-left corner
const topLeftHorizontal = {
  id: 'crop-tl-h',
  type: 'line',
  x: -bleed - cropMarkOffset - cropMarkLength,
  y: 0,
  width: cropMarkLength,
  height: 0,
  stroke: '#000000',
  strokeWidth: 0.75,  // ~0.25pt
};

const topLeftVertical = {
  id: 'crop-tl-v',
  type: 'line',
  x: 0,
  y: -bleed - cropMarkOffset - cropMarkLength,
  width: 0,
  height: cropMarkLength,
  stroke: '#000000',
  strokeWidth: 0.75,
};
```

### 4. Client-Side Changes (None Required)

The client already sends `cropMarks: true` in the options. No frontend changes needed.

## Files to Update

| File | Change |
|------|--------|
| `docs/VPS_SERVER_JS_COMPLETE.js` | Add `injectCropMarks()` helper function |
| VPS `server.js` | Call `injectCropMarks()` when `options.cropMarks` is true |

## UX Improvement: Progress Bar

As a secondary improvement, the progress bar jumps from 0% to 100% because the VPS processes everything in one request. To improve this:

1. Add streaming progress updates via SSE/WebSocket (complex)
2. Or show an indeterminate spinner during the "Generating vector PDF" phase with estimated time

This is a lower priority than fixing crop marks.

## Technical Notes

- Polotno's `line` element type renders as true vector paths
- Crop marks should be positioned using negative coordinates (in the bleed zone)
- The DPI conversion (300 DPI scene) means 1mm ≈ 11.8px
- Registration black (#000000) converts to 100% K in CMYK mode

## Testing Verification

After deployment:
1. Export a CMYK multi-page PDF with bleed and crop marks enabled
2. Open in Adobe Acrobat
3. Verify:
   - File > Properties shows "Ghostscript" as Producer
   - Output Preview shows CMYK color space
   - Crop marks appear at each corner as thin lines
   - Marks are vectors (zoom in - no pixelation)
   - Text remains selectable/vector (not flattened)
