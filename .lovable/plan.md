

# Fix: Persistent VPS NaN Error in Professional Print Export

## Problem Summary

The VPS continues to return `"unsupported number: NaN"` when exporting with Professional print output (CMYK mode + crop marks), despite multiple fix attempts. The user has a simple template with one image and one text box.

## Root Cause Analysis

After thorough investigation, I identified a **version mismatch** between deployed components:

### The Deployed VPS (`tmp/vps/server.js`)
- Uses the **simple** implementation that directly calls `jsonToPDF`
- Does **NOT** have the `injectCropMarks` function
- Does **NOT** have the two-pass CMYK Ghostscript conversion
- Any `cropMarks: true` option sent to it is silently ignored

### The Documented VPS (`docs/VPS_SERVER_JS_COMPLETE.js`)  
- Has full crop mark injection logic
- Has two-pass rendering (Polotno then Ghostscript for CMYK)
- Has dimension validation to prevent NaN

### The Client Code (Latest)
- Has scene preflight sanitizer
- Has client-side crop mark injection with validation
- Edge function logs show a **successful export at 14:51:57Z** (13.9MB, 6 pages)

## The Real Issue

The error persists because:

1. **VPS Out of Sync**: The running VPS server doesn't match the documented version
2. **Possible Stale Frontend**: The user may be running cached frontend code without the latest sanitizer
3. **Timing**: The screenshot may be from before the latest deployment completed

## Recommended Fix Strategy

### Option A: Quick Fix (Minimal Changes)
Ensure the VPS being used is the simple version (`tmp/vps/server.js`) which does NOT attempt crop mark injection, and rely entirely on:
- Client-side crop mark injection (already implemented)
- Client-side scene sanitization (already implemented)
- Send `cropMarks: false` to VPS always

### Option B: Full Fix (Recommended)
Deploy the complete VPS server (`docs/VPS_SERVER_JS_COMPLETE.js`) to the production VPS, which includes:
- Scene dimension validation before any processing
- Proper error handling with detailed diagnostics
- Two-pass CMYK conversion

## Implementation Steps

### Step 1: Verify Frontend Code is Live
Add visible confirmation that the sanitizer ran:
- Log sanitization results prominently in browser console
- Show a visible indicator in the UI when preflight validation completes

### Step 2: Force `cropMarks: false` to VPS
Since the deployed VPS doesn't handle crop marks, ensure we never send `cropMarks: true`:

```typescript
// In pdfBatchExporter.ts CMYK path
const result = await exportMultiPagePdf(combinedScene, {
  cmyk: true,
  title: 'MergeKit Export',
  bleed: printConfig?.bleedMm,
  cropMarks: false, // Always false - client handles marks
});
```

### Step 3: Add Deployment Verification
Add version info to the VPS health endpoint and display it in the export UI so you can verify which VPS version is running.

## Technical Details

### Files to Modify

1. **`src/lib/polotno/pdfBatchExporter.ts`**
   - Force `cropMarks: false` in VPS calls
   - Add more visible logging for debugging

2. **`src/components/polotno/PolotnoPdfGenerator.tsx`** (optional)
   - Display preflight validation results in UI during export

## Verification Steps

After implementation:
1. Clear browser cache and hard refresh
2. Run Professional print export with CMYK + crop marks enabled
3. Check browser console for `[SceneSanitizer]` logs
4. Verify the export completes successfully
5. Open the PDF in Adobe Acrobat to verify crop marks appear

## Why This Should Work

The successful export logged at 14:51:57Z proves the pipeline CAN work when:
- Frontend sanitizer is running
- Client-side crop marks are injected
- VPS receives clean data with `cropMarks: false`

The remaining task is ensuring this code is consistently deployed and the user is running the latest version.

