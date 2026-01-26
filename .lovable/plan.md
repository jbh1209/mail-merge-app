

# Fix Plan: VDP Text Resolution Not Updating on Record Navigation

## Problem Summary

When navigating between records (e.g., Record 1 → Record 8):
- ✅ Sequential numbers update correctly (shows "0008" for record 8)
- ✅ QR codes work and persist
- ❌ Text fields (Name, Address) stay frozen on the first record's values

## Root Cause Analysis

The sequential number works because it uses `recordIndex` directly:
```typescript
const seqNumber = config.startNumber + recordIndex;  // Uses index, not record data
```

But text fields use `record` data:
```typescript
const value = findRecordValue(token, record);  // Uses record object
```

After investigation, I found **two potential causes**:

### Cause 1: `store.loadJSON()` May Be Async

At line 1471, `store.loadJSON(resolved)` is called **without await**:
```typescript
store.loadJSON(resolved);  // Not awaited!
```

If Polotno's `loadJSON` is asynchronous (which some versions are), the canvas may not update before the effect completes. Meanwhile, the next re-render or user action could occur, and the load might be cancelled or overwritten.

### Cause 2: Stale Closure in Async Function

The `currentRecord` variable is captured at the TOP of the effect (line 1417), but used INSIDE an async function (line 1466). If there's any delay or race condition, the captured `currentRecord` might not match the intended record.

## Solution

### Step 1: Await `store.loadJSON()`

Polotno's `store.loadJSON()` may return a Promise in newer versions. We should await it to ensure the scene is fully loaded before proceeding.

**File:** `src/components/polotno/PolotnoEditorWrapper.tsx`

**Change at line 1471:**
```typescript
// Before:
store.loadJSON(resolved);

// After:
await store.loadJSON(resolved);
```

### Step 2: Add Defensive Re-capture of Current Record

Move the record lookup closer to where it's used to avoid stale closures:

**Change at lines 1462-1470:**
```typescript
try {
  // Re-capture record data right before resolution to avoid stale closure
  const freshSampleData = allSampleDataRef.current;
  const freshRecord = freshSampleData[currentRecordIndex];
  
  if (!freshRecord) {
    console.warn(`❌ No record found at index ${currentRecordIndex}`);
    return;
  }
  
  const baseScene = JSON.parse(baseSceneRef.current) as PolotnoScene;
  const resolved = resolveVdpVariables(baseScene, {
    record: freshRecord,  // Use freshly captured record
    recordIndex: currentRecordIndex,
    projectImages: images,
    useCachedImages: true,
  });
  await store.loadJSON(resolved);
  ...
}
```

### Step 3: Add Diagnostic Logging

Add logging to confirm VDP resolution is using the correct record data:

```typescript
console.log(`🔄 VDP resolving for record ${currentRecordIndex + 1}:`, {
  recordName: freshRecord['Name'] || freshRecord['Full Name'] || freshRecord[Object.keys(freshRecord)[0]],
  totalRecords: freshSampleData.length,
  baseHasPlaceholders: baseSceneRef.current?.includes('{{'),
});
```

### Step 4: Force Store Update If Needed

If `store.loadJSON` still doesn't update visually, we may need to force a store update:

```typescript
await store.loadJSON(resolved);
// Force store to re-render all elements
store.activePage?.children.forEach(el => el.set({}));
```

## Files to Modify

1. **`src/components/polotno/PolotnoEditorWrapper.tsx`**
   - Await `store.loadJSON()` at line 1471
   - Re-capture record data before VDP resolution
   - Add diagnostic logging

## Testing Steps

1. Open the editor with an existing template
2. Check console for VDP resolution logs showing correct record data
3. Navigate to Record 8 - text should now show different person's name
4. Navigate back to Record 1 - original data should appear
5. Verify sequence numbers still work correctly (0001, 0002, etc.)
6. Verify QR codes still persist across navigation

## Technical Notes

### Why Sequential Numbers Work But Text Doesn't

Sequential numbers are calculated from `recordIndex` which is passed directly:
```typescript
const seqNumber = config.startNumber + recordIndex;
```

Text resolution uses `record` object which may be stale:
```typescript
const value = findRecordValue(token, record);
```

### Why This Regression Occurred

The Phase B1 stabilization fix we added earlier focused on preventing the initial scene from being reloaded. However, this may have inadvertently affected the timing of when data is captured in the VDP navigation effect, or exposed an existing race condition with async data loading.

