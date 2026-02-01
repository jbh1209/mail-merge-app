

# Fix Bleed Clipping - Prevent Artwork from Covering Crop Marks

## Problem
When exporting PDFs with bleed enabled (e.g., 3mm), background images or artwork that extends beyond the bleed area covers the crop marks. This makes the crop marks unusable for print finishing.

Your screenshot shows the issue clearly: the background image extends all the way to the edge and covers the crop marks in the corners.

## Root Cause
In the `compose-label-sheet` edge function:
1. The source PDF (exported from Polotno with bleed) is embedded at full size
2. This includes any artwork that extends beyond the bleed boundary
3. Crop marks are drawn after the embedded content
4. But the embedded content overlaps into the crop mark area, hiding them

## Solution
Draw white masking rectangles in the crop mark area (outside the bleed box) before drawing the crop marks. This effectively clips any overflowing artwork to the bleed boundary.

```text
┌──────────────────────────────────────────────┐
│  ████ WHITE MASK ████  │  ████ WHITE ████    │
│  ┌─────────────────────────────────────┐     │
│  │   ┌─────────────────────────────┐   │     │
│  │ B │                             │ B │     │
│  │ L │     Trim Area               │ L │     │
│  │ E │     (Visible after cut)     │ E │     │
│  │ E │                             │ E │     │
│  │ D │                             │ D │     │
│  │   └─────────────────────────────┘   │     │
│  └─────────────────────────────────────┘     │
│  ████ WHITE MASK (hides overflow) ████       │
└──────────────────────────────────────────────┘

Crop marks are drawn in the white mask area (outside bleed)
```

## Implementation

### File: `supabase/functions/compose-label-sheet/index.ts`

Add a function to draw white masking rectangles around the bleed box:

```typescript
/**
 * Draw white masking rectangles to clip content to bleed area
 * This ensures artwork doesn't extend into the crop mark area
 */
function drawBleedMask(
  page: ReturnType<PDFDocument['addPage']>,
  bleedX: number,
  bleedY: number,
  bleedWidth: number,
  bleedHeight: number,
  totalWidth: number,
  totalHeight: number
): void {
  const white = rgb(1, 1, 1);
  
  // Left mask (from edge to bleed left)
  page.drawRectangle({
    x: 0,
    y: 0,
    width: bleedX,
    height: totalHeight,
    color: white,
  });
  
  // Right mask (from bleed right to edge)
  page.drawRectangle({
    x: bleedX + bleedWidth,
    y: 0,
    width: totalWidth - (bleedX + bleedWidth),
    height: totalHeight,
    color: white,
  });
  
  // Bottom mask (between left and right masks)
  page.drawRectangle({
    x: bleedX,
    y: 0,
    width: bleedWidth,
    height: bleedY,
    color: white,
  });
  
  // Top mask (between left and right masks)
  page.drawRectangle({
    x: bleedX,
    y: bleedY + bleedHeight,
    width: bleedWidth,
    height: totalHeight - (bleedY + bleedHeight),
    color: white,
  });
}
```

Modify the print features section (around lines 284-300) to:
1. First embed the source PDF
2. Then draw the white mask over any overflow
3. Finally draw crop marks on top

```typescript
// Embed source content
const [embeddedPage] = await outputPdf.embedPdf(sourcePdf, [pageIdx]);
newPage.drawPage(embeddedPage, {
  x: contentX,
  y: contentY,
  width: sourceWidth,
  height: sourceHeight,
});

// Draw white mask to clip content to bleed area
drawBleedMask(
  newPage,
  contentX,      // bleedX
  contentY,      // bleedY
  sourceWidth,   // bleedWidth
  sourceHeight,  // bleedHeight
  totalWidth,
  totalHeight
);

// Draw crop marks on top of the mask
drawCropMarks(newPage, trimX, trimY, trimWidthPt, trimHeightPt, cropOffsetPt);
```

## Visual Result After Fix

```text
┌────────────────────────────────────────────┐
│  ┼                                    ┼    │  <- Crop marks visible
│  ─                                    ─    │
│  │  ┌────────────────────────────┐    │    │
│  │  │                            │    │    │
│     │   Background image         │         │
│     │   clipped at bleed edge    │         │
│     │                            │         │
│  │  │                            │    │    │
│  │  └────────────────────────────┘    │    │
│  ─                                    ─    │
│  ┼                                    ┼    │  <- Crop marks visible
└────────────────────────────────────────────┘
```

## Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/compose-label-sheet/index.ts` | Add `drawBleedMask` function and call it after embedding content |

## Testing
1. Create a certificate with a full-bleed background image
2. Enable 3mm bleed and crop marks
3. Export to PDF
4. Verify crop marks are visible at all four corners
5. Verify background image is clipped at the bleed boundary

