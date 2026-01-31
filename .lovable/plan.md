
# Fix Plan: Critical Regressions in Refactored Polotno Editor

## Problem Summary

The refactoring introduced **three critical bugs**:

1. **"null" displayed for blank data** - Empty cells show literal "null" instead of being blank
2. **Records not changing on navigation** - VDP text fields stay frozen on first record
3. **Barcode panel crashes** - `TypeError: Cannot read properties of undefined (reading '0')`

## Root Cause Analysis

### Issue 1: Incorrect Props Passing to Section Creators

The `polotno-sections.js` functions expect:
```javascript
createBarcodesSection(PanelComponent, panelProps)
// where panelProps = { store, availableFields, onInserted }
```

But `usePolotnoBootstrap.ts` passes:
```javascript
createBarcodesSection(
  BarcodePanel,
  availableFieldsRef,           // ← Wrong! This is a ref, not props object
  () => commitToBase('...')     // ← This third arg is ignored!
)
```

### Issue 2: Store Not Passed to Panels

In `polotno-sections.js` line 87:
```javascript
Panel: () => React.createElement(PanelComponent, panelProps)
```

This doesn't pass the `store` prop. According to Polotno documentation, the `Panel` component receives `{ store }` from Polotno's SidePanel. It should be:
```javascript
Panel: ({ store }) => React.createElement(PanelComponent, { store, ...panelProps })
```

### Issue 3: Null Value Handling

When a record field contains `null` (empty cell in CSV), the VDP resolver converts it to the string "null" because:
```javascript
const value = findRecordValue(token, record);
// If record[token] = null, this returns null
// But the null check uses: if (value === null) return ''
// The problem is JavaScript's null vs the string "null" from JSON parsing
```

Actually, looking more closely at the code, if the record has `"null"` as a string value (not JavaScript `null`), `findRecordValue` will return `"null"` and the VDP resolver will display it.

## Technical Solution

### Step 1: Fix polotno-sections.js - Pass Store to Panels

**File:** `src/vendor/polotno-sections.js`

Update all section creator functions to properly receive and pass `store`:

```javascript
// BEFORE:
Panel: () => React.createElement(PanelComponent, panelProps)

// AFTER:
Panel: ({ store }) => React.createElement(PanelComponent, { store, ...panelProps })
```

### Step 2: Fix usePolotnoBootstrap.ts - Correct Props Objects

**File:** `src/components/polotno/hooks/usePolotnoBootstrap.ts`

Fix how section creators are called:

```javascript
// VDP Fields Section
const vdpFieldsSection = createVdpFieldsSection(VdpFieldsPanel, {
  availableFields: availableFieldsRef.current || [],
  projectImages: projectImagesRef.current || [],
  onInserted: () => commitToBase('vdp-insert'),
});

// Barcodes Section  
const barcodesSection = createBarcodesSection(BarcodePanel, {
  availableFields: availableFieldsRef.current || [],
  onInserted: () => commitToBase('barcode-insert'),
});

// Project Images Section
const imagesSection = createProjectImagesSection(ProjectImagesPanel, {
  projectImages: projectImages,
  onInserted: () => commitToBase('image-insert'),
});

// Sequence Section
const sequenceSection = createSequenceSection(SequencePanel, {
  onInserted: () => commitToBase('sequence-insert'),
});
```

However, this has a problem: props become stale if `availableFieldsRef.current` changes after bootstrap.

**Better approach**: Use refs in the section factories:

```javascript
const vdpFieldsSection = createVdpFieldsSection(VdpFieldsPanel, {
  get availableFields() { return availableFieldsRef.current || []; },
  get projectImages() { return projectImagesRef.current || []; },
  onInserted: () => commitToBase('vdp-insert'),
});
```

Or even simpler - keep using refs and update `polotno-sections.js` to handle refs:

```javascript
Panel: ({ store }) => {
  const resolvedProps = typeof panelProps === 'function' 
    ? panelProps() 
    : panelProps;
  return React.createElement(PanelComponent, { store, ...resolvedProps });
}
```

Then pass a factory function from bootstrap:

```javascript
const vdpFieldsSection = createVdpFieldsSection(VdpFieldsPanel, () => ({
  availableFields: availableFieldsRef.current || [],
  projectImages: projectImagesRef.current || [],
  onInserted: () => commitToBase('vdp-insert'),
}));
```

### Step 3: Fix Null Value Handling in VDP Resolver

**File:** `src/lib/polotno/vdpResolver.ts`

Update the `findRecordValue` function and the replacement logic to handle null/undefined values:

```javascript
function findRecordValue(token: string, record: Record<string, string>): string | null {
  // Direct match
  if (token in record) {
    const value = record[token];
    // Treat null, undefined, and "null" string as missing
    if (value === null || value === undefined || value === 'null') {
      return '';  // Return empty string instead of null
    }
    return value;
  }
  // ... rest of fuzzy matching
}
```

Also update the replacement block:

```javascript
el.text = el.text.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (match, rawToken) => {
  const token = rawToken.trim();
  const value = findRecordValue(token, record);
  // Handle null, undefined, empty string, and literal "null"
  if (value === null || value === undefined || value === '' || value === 'null') {
    return '';
  }
  return value;
});
```

## Files to Modify

1. **`src/vendor/polotno-sections.js`** - Fix Panel to receive and pass store
2. **`src/components/polotno/hooks/usePolotnoBootstrap.ts`** - Fix section creator calls
3. **`src/lib/polotno/vdpResolver.ts`** - Handle null values properly

## Testing Checklist

After implementing fixes:

1. Open existing template in editor
2. Verify no "null" text appears for empty data fields
3. Navigate through records - text should update correctly
4. Click Barcode section - should open without errors
5. Add a barcode/QR code - should appear on canvas
6. Navigate records - barcode should persist
7. Click Sequence section - should work
8. Add sequence number - should increment per record
