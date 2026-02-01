
# Fix Page Size Controls Not Updating Polotno Canvas

## Problem Summary
When changing page size (e.g., A4 Portrait to A4 Landscape), the header correctly shows the new dimensions (297.0 x 210.0mm), but the Polotno canvas remains in portrait orientation. The root cause is that dimension changes trigger a **full bootstrap restart** instead of simply resizing the existing store.

## Root Cause Analysis
1. The bootstrap effect in `usePolotnoBootstrap.ts` (line 512) depends on `labelWidth` and `labelHeight`
2. When dimensions change, the entire bootstrap re-runs from scratch
3. This creates a new store and resets the canvas, losing the current scene
4. The user sees no change because the scene isn't preserved through the restart

## Solution Overview
Separate dimension-only changes from full bootstrap restarts. When the editor is already "ready" and only dimensions change, call `store.setSize()` on the existing store instead of re-initializing everything.

---

## Implementation Steps

### Step 1: Add `updateStoreSize` Helper to Runtime
**File**: `src/vendor/polotno-runtime.js`

Add a new exported function to update store dimensions without recreating the store:

```javascript
/**
 * Update the store's page dimensions without recreating the store.
 * @param {object} store - Polotno store instance
 * @param {number} widthPx - New width in pixels
 * @param {number} heightPx - New height in pixels
 */
export function updateStoreSize(store, widthPx, heightPx) {
  if (!store) return;
  store.setSize(widthPx, heightPx);
}
```

### Step 2: Modify Bootstrap to Skip Re-Init on Dimension-Only Changes
**File**: `src/components/polotno/hooks/usePolotnoBootstrap.ts`

Add a separate effect that handles dimension changes when already in "ready" state:

```typescript
// NEW EFFECT: Handle dimension changes without full re-bootstrap
useEffect(() => {
  // Only run if already bootstrapped and store exists
  if (bootstrapStage !== 'ready' || !storeRef.current) return;
  
  const store = storeRef.current;
  const newWidthPx = mmToPixels(labelWidth);
  const newHeightPx = mmToPixels(labelHeight);
  
  // Update store size directly (no re-bootstrap)
  store.setSize(newWidthPx, newHeightPx);
  console.log(`[polotno-bootstrap] Dimensions updated: ${labelWidth}mm x ${labelHeight}mm`);
}, [bootstrapStage, labelWidth, labelHeight]);
```

Update the main bootstrap effect to **exclude** `labelWidth` and `labelHeight` from its dependency array:

```typescript
// Before (line 512):
}, [mountEl, labelWidth, labelHeight, bleedMm, projectType, retryCount]);

// After:
}, [mountEl, bleedMm, projectType, retryCount]);
```

Store initial dimensions in a ref so the first bootstrap still uses them:

```typescript
// Add at top of hook:
const initialDimensionsRef = useRef({ width: labelWidth, height: labelHeight });
```

Use the ref values during store creation:

```typescript
const store = await createPolotnoStore({
  apiKey,
  unit: 'mm',
  dpi: 300,
  width: mmToPixels(initialDimensionsRef.current.width),
  height: mmToPixels(initialDimensionsRef.current.height),
});
```

### Step 3: Ensure Scene Preservation During Resize
When `store.setSize()` is called, Polotno automatically preserves the current scene. No additional code is needed for this.

---

## Technical Details

### Polotno's `store.setSize(width, height)` Behavior
- Accepts dimensions in the store's configured unit (pixels after DPI conversion)
- Preserves all elements on the page
- Updates the canvas viewport immediately
- Does not trigger a full scene reload

### Edge Cases Handled
1. **Initial load**: Uses `initialDimensionsRef` for first bootstrap
2. **Dimension change while ready**: New effect calls `store.setSize()`
3. **Bleed/project type change**: Still triggers full re-bootstrap (correct behavior)
4. **Retry**: Still works via `retryCount` dependency

---

## Files to Modify
1. `src/vendor/polotno-runtime.js` - Add `updateStoreSize` helper
2. `src/components/polotno/hooks/usePolotnoBootstrap.ts` - Split dimension handling

## Testing Checklist
1. Open a certificate project
2. Change from A4 Portrait to A4 Landscape - canvas should rotate
3. Change back to Portrait - canvas should rotate back
4. Verify all elements remain in place after rotation
5. Verify bleed toggle still works correctly
6. Verify editor still loads on fresh page load
