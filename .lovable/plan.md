
# Client-Side CMYK Conversion with @imgly/plugin-print-ready-pdfs-web

## Summary
Replace the server-side pdfRest CMYK conversion with a fully client-side solution using IMG.LY's print-ready PDF plugin. This eliminates the need for an external API key while providing professional-grade CMYK PDF/X-3 output.

---

## Why This Works

The `@imgly/plugin-print-ready-pdfs-web` package:
- **Works with any PDF Blob** - Not limited to CE.SDK, works with Polotno output
- **100% browser-based** - Uses Ghostscript WASM, no server calls needed
- **Vite-compatible out of the box** - Auto-resolves assets via `import.meta.url`
- **Includes standard ICC profiles** - FOGRA39 (EU) and GRACoL (US) built-in
- **CORS headers already configured** - The project's `_headers` file already has the required SharedArrayBuffer support

---

## Current vs New Flow

```text
Current Flow (broken - needs pdfRest API key):
Polotno → RGB PDFs → Upload → Server compose → pdfRest CMYK → Download

New Flow (no API key needed):
Polotno → RGB PDFs → Client CMYK conversion → Upload → Server compose → Download
```

---

## Implementation Steps

### Step 1: Install the Package

```bash
npm install @imgly/plugin-print-ready-pdfs-web
```

### Step 2: Add Client-Side CMYK Conversion

**File:** `src/lib/polotno/cmykConverter.ts` (new file)

Create a utility module to handle CMYK conversion:

```typescript
import { convertToPDFX3 } from '@imgly/plugin-print-ready-pdfs-web';

export type ColorProfile = 'fogra39' | 'gracol' | 'srgb';

export interface CmykConversionOptions {
  profile: ColorProfile;
  title?: string;
  flattenTransparency?: boolean;
}

/**
 * Convert a single RGB PDF to CMYK PDF/X-3
 */
export async function convertPdfToCmyk(
  pdfBlob: Blob,
  options: CmykConversionOptions
): Promise<Blob> {
  return convertToPDFX3(pdfBlob, {
    outputProfile: options.profile,
    title: options.title ?? 'Print-Ready Export',
    flattenTransparency: options.flattenTransparency ?? true,
  });
}

/**
 * Convert multiple RGB PDFs to CMYK PDF/X-3 (sequential processing)
 */
export async function convertPdfsToCmyk(
  pdfBlobs: Blob[],
  options: CmykConversionOptions,
  onProgress?: (current: number, total: number) => void
): Promise<Blob[]> {
  const results: Blob[] = [];
  
  for (let i = 0; i < pdfBlobs.length; i++) {
    const cmykBlob = await convertToPDFX3(pdfBlobs[i], {
      outputProfile: options.profile,
      title: options.title ?? 'Print-Ready Export',
      flattenTransparency: options.flattenTransparency ?? true,
    });
    results.push(cmykBlob);
    onProgress?.(i + 1, pdfBlobs.length);
  }
  
  return results;
}

/**
 * Get the appropriate color profile based on region
 */
export function getProfileForRegion(region: 'US' | 'EU' | 'us' | 'eu' | string): ColorProfile {
  return region.toLowerCase() === 'eu' ? 'fogra39' : 'gracol';
}
```

### Step 3: Integrate into PDF Export Pipeline

**File:** `src/lib/polotno/pdfBatchExporter.ts`

Modify the `batchExportWithPolotno` function to apply CMYK conversion before uploading:

```typescript
// After exporting PDFs from Polotno:
const pdfBlobs: Blob[] = [];
for (let i = 0; i < records.length; i++) {
  // ... existing export logic
  const blob = await exportPdf(resolvedScene);
  pdfBlobs.push(blob);
}

// NEW: Apply CMYK conversion if requested (before upload)
let finalBlobs = pdfBlobs;
if (printConfig?.colorMode === 'cmyk') {
  onProgress({
    phase: 'exporting', // Reuse phase with different message
    current: 0,
    total: records.length,
    message: 'Converting to CMYK...',
  });
  
  const profile = getProfileForRegion(printConfig.region || 'us');
  finalBlobs = await convertPdfsToCmyk(pdfBlobs, { profile }, (current, total) => {
    onProgress({
      phase: 'exporting',
      current,
      total,
      message: `CMYK conversion ${current} of ${total}...`,
    });
  });
}

// Continue with upload using finalBlobs instead of pdfBlobs
```

### Step 4: Add Progress Phase for CMYK

**File:** `src/lib/polotno/pdfBatchExporter.ts`

Update the `BatchExportProgress` interface:

```typescript
export interface BatchExportProgress {
  phase: 'preparing' | 'exporting' | 'converting' | 'uploading' | 'composing' | 'complete' | 'error';
  current: number;
  total: number;
  message?: string;
}
```

### Step 5: Update UI Progress Display

**File:** `src/components/polotno/PolotnoPdfGenerator.tsx`

Add handling for the new 'converting' phase in progress display:

```typescript
switch (progress.phase) {
  case 'preparing':
    return 5;
  case 'exporting':
    return 5 + basePercent * 0.50;  // Reduced from 65%
  case 'converting':
    return 55 + basePercent * 0.15; // New CMYK phase
  case 'uploading':
    return 70 + basePercent * 0.15;
  case 'composing':
    return 85 + basePercent * 0.15;
  default:
    return basePercent;
}
```

### Step 6: Remove Server-Side CMYK Code

**File:** `supabase/functions/compose-label-sheet/index.ts`

Since CMYK conversion now happens client-side, we can:
- Remove the `convertToCmyk` function
- Remove the `applyCmyk` logic block
- Remove the pdfRest API dependency
- Keep `cmykApplied` response field for UI feedback

---

## Files to Modify

| File | Changes |
|------|---------|
| `package.json` | Add `@imgly/plugin-print-ready-pdfs-web` dependency |
| `src/lib/polotno/cmykConverter.ts` | **NEW** - CMYK conversion utility |
| `src/lib/polotno/pdfBatchExporter.ts` | Add CMYK conversion step, update progress phases |
| `src/components/polotno/PolotnoPdfGenerator.tsx` | Update progress UI for CMYK phase |
| `supabase/functions/compose-label-sheet/index.ts` | Remove pdfRest CMYK logic |

---

## Technical Details

### Browser Requirements
The plugin uses Ghostscript WASM which requires:
- **SharedArrayBuffer support** - Already enabled via `public/_headers` (COOP/COEP headers)
- **Modern browser** - Chrome 87+, Firefox 79+, Safari 15.2+, Edge 87+

### Performance Considerations
- CMYK conversion is sequential (one PDF at a time) to avoid overwhelming WASM
- Each PDF typically takes 1-3 seconds to convert
- Progress UI will show conversion status

### Transparency Handling
PDF/X-3 doesn't support transparency. The plugin flattens transparent elements by default.
If needed, can set `flattenTransparency: false` for visual fidelity over strict compliance.

---

## Result After Implementation

```text
Benefits:
✅ No external API key required (pdfRest eliminated)
✅ No server costs for CMYK conversion
✅ Faster processing (no network round-trip to pdfRest)
✅ Works offline once WASM is loaded
✅ Professional PDF/X-3 compliant output
✅ Correct ICC profiles (FOGRA39 EU / GRACoL US)
```

---

## Testing Checklist

1. Create a certificate with colorful design
2. Enable print marks and select CMYK mode
3. Generate PDF and verify progress shows "Converting to CMYK" phase
4. Download PDF and open in Adobe Acrobat
5. Check Document Properties → Color Space shows "DeviceCMYK"
6. Verify ICC profile is embedded (FOGRA39 or GRACoL based on region)
