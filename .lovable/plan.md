
# Fix PDF Export Dimension Mismatch

## Summary
The PDF output shows portrait orientation when the editor displays landscape. This is because dimension changes made in the editor are not being transferred to the exported scene. Additionally, the in-app download sometimes fails while the direct URL works.

---

## Problem 1: PDF Dimensions Don't Match Editor

### Root Cause
When exporting PDFs, the system calls `mergeLayoutToBase()` to combine the current scene with the template. However, this function only copies element positions and styles - it does **not** copy the root-level `width` and `height` properties from the current scene.

The flow:
1. User changes from Portrait (210×297mm) to Landscape (297×210mm)
2. `store.setSize()` updates the live canvas - works correctly
3. When exporting, `getBaseScene()` calls `mergeLayoutToBase(currentScene, baseScene)`
4. `mergeLayoutToBase()` starts with `cloneScene(baseScene)` - which has **old** dimensions
5. It never updates `merged.width` and `merged.height`
6. PDF exports with portrait dimensions despite landscape content

### Solution
Update `mergeLayoutToBase()` in `src/lib/polotno/vdpResolver.ts` to transfer root-level dimensions:

```typescript
// In mergeLayoutToBase(), before returning:
merged.width = currentScene.width;
merged.height = currentScene.height;
if (currentScene.unit) merged.unit = currentScene.unit;
if (currentScene.dpi) merged.dpi = currentScene.dpi;
```

---

## Problem 2: In-App Download Fails

### Root Cause
The signed URL works when opened directly in a browser tab, but the in-app fetch sometimes fails. This is likely due to:
1. CORS headers not being present on the storage response
2. The fetch timing out or being blocked
3. Browser security restrictions on cross-origin blob creation

### Solution
Update the download handler in `PolotnoPdfGenerator.tsx` to use `window.open()` as a fallback when fetch fails:

```typescript
// In handleDownload():
try {
  const response = await fetch(data.signedUrl);
  // ... existing blob download logic
} catch (fetchError) {
  // Fallback: Open URL directly in new tab
  window.open(data.signedUrl, '_blank');
}
```

---

## Implementation Steps

### Step 1: Fix Dimension Transfer
**File**: `src/lib/polotno/vdpResolver.ts`

Add dimension copying in `mergeLayoutToBase()` function, just before `return merged`:

```typescript
// Transfer root-level properties from current scene
merged.width = currentScene.width;
merged.height = currentScene.height;
if (currentScene.unit !== undefined) merged.unit = currentScene.unit;
if (currentScene.dpi !== undefined) merged.dpi = currentScene.dpi;
if (currentScene.fonts?.length) merged.fonts = currentScene.fonts;

return merged;
```

### Step 2: Fix In-App Download
**File**: `src/components/polotno/PolotnoPdfGenerator.tsx`

Improve the download handler with fallback:

```typescript
const handleDownload = async () => {
  if (!mergeJobId) return;

  setDownloading(true);
  try {
    const { data, error } = await supabase.functions.invoke('get-download-url', {
      body: { mergeJobId },
    });

    if (error) throw error;
    if (!data?.signedUrl) throw new Error('No download URL returned');

    // Try fetch + blob approach first (better UX - triggers download dialog)
    try {
      const response = await fetch(data.signedUrl);
      if (!response.ok) throw new Error('Fetch failed');
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `${docNamePlural}-${mergeJobId.slice(0, 8)}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (fetchError) {
      // Fallback: Open signed URL directly (works even with CORS issues)
      console.warn('Blob download failed, falling back to direct URL:', fetchError);
      window.open(data.signedUrl, '_blank');
    }
    
    toast({
      title: "Download started",
      description: "Your PDF is downloading",
    });
  } catch (error) {
    // ... existing error handling
  } finally {
    setDownloading(false);
  }
};
```

---

## Files to Modify

| File | Change |
|------|--------|
| `src/lib/polotno/vdpResolver.ts` | Add dimension transfer in `mergeLayoutToBase()` |
| `src/components/polotno/PolotnoPdfGenerator.tsx` | Add download fallback for CORS issues |

---

## Testing Checklist

1. Change a certificate from A4 Portrait to A4 Landscape
2. Add some content and export PDF
3. Verify the exported PDF is landscape orientation
4. Click Download and verify it works (either via blob or direct URL)
5. Navigate through records and verify landscape persists
6. Re-export and confirm all pages are landscape
