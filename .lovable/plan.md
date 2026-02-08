

# Fix: VPS Crop Mark Injection Using Scene-Level Dimensions

## Problem Identified
The VPS `server.js` crashes with `"unsupported number: NaN"` because the crop mark injection code reads `page.width` and `page.height`, but in Polotno, page dimensions are stored at the **scene level**, not on individual pages.

**Current broken code in `server.js`:**
```javascript
const trimWidth = page.width;   // ← undefined!
const trimHeight = page.height; // ← undefined!
```

## Solution
Update the `injectCropMarks()` function to:
1. Read dimensions from `scene.width` and `scene.height` (the correct source)
2. Pass scene dimensions as parameters to the injection helper
3. Fall back gracefully if dimensions are missing

## Technical Details

### Current (Broken) Flow
```text
scene.pages.map(page => {
  const trimWidth = page.width;   // undefined
  const trimHeight = page.height; // undefined
  // Math with undefined → NaN
  // Polotno export crashes on NaN coordinates
})
```

### Fixed Flow
```text
injectCropMarks(scene, bleedPx, enableCropMarks)
  ↓
Read scene.width and scene.height (defined!)
  ↓
For each page, use scene dimensions for mark positioning
  ↓
Valid coordinates → PDF exports successfully
```

## Implementation

### File to Update
`docs/VPS_SERVER_JS_COMPLETE.js` (and subsequently deploy to VPS)

### Change Summary
1. Modify `injectCropMarks()` signature to accept scene dimensions
2. Read `scene.width` and `scene.height` at the top of the function
3. Pass those dimensions to each page's crop mark generation
4. Add validation to skip injection if dimensions are missing/invalid

### Code Fix (lines 171-204)

**Before:**
```javascript
function injectCropMarks(scene, bleedPx, enableCropMarks) {
  // ...
  const modifiedPages = scene.pages.map((page, pageIndex) => {
    const trimWidth = page.width;    // ← UNDEFINED
    const trimHeight = page.height;  // ← UNDEFINED
    // ...
  });
}
```

**After:**
```javascript
function injectCropMarks(scene, bleedPx, enableCropMarks) {
  if (!enableCropMarks || !scene.pages) {
    return scene;
  }
  
  // Read dimensions from SCENE level (correct Polotno structure)
  const trimWidth = scene.width;
  const trimHeight = scene.height;
  
  // Validate dimensions to prevent NaN
  if (!trimWidth || !trimHeight || isNaN(trimWidth) || isNaN(trimHeight)) {
    console.warn('[crop-marks] Scene dimensions missing, skipping crop marks');
    return scene;
  }
  
  // Mark dimensions at 300 DPI
  const markLength = Math.round(10 * (300 / 25.4)); // ~118px
  const markOffset = Math.round(3 * (300 / 25.4));  // ~35px
  
  const modifiedPages = scene.pages.map((page, pageIndex) => {
    const bleed = page.bleed || bleedPx;
    
    const cropMarkElements = [
      ...generateCornerCropMarks('tl', trimWidth, trimHeight, bleed, markLength, markOffset),
      ...generateCornerCropMarks('tr', trimWidth, trimHeight, bleed, markLength, markOffset),
      ...generateCornerCropMarks('bl', trimWidth, trimHeight, bleed, markLength, markOffset),
      ...generateCornerCropMarks('br', trimWidth, trimHeight, bleed, markLength, markOffset),
    ];
    
    console.log(`[crop-marks] Page ${pageIndex + 1}: Added ${cropMarkElements.length} marks at ${trimWidth}x${trimHeight}px`);
    
    return {
      ...page,
      children: [...(page.children || []), ...cropMarkElements],
    };
  });
  
  return { ...scene, pages: modifiedPages };
}
```

## Verification After Deploy
1. Run a CMYK export with crop marks enabled
2. Console should log: `[crop-marks] Page 1: Added 8 marks at XXXXxYYYYpx`
3. Open PDF in Acrobat — crop marks should appear at corners
4. Zoom in on marks — they should be sharp vectors (no pixelation)

