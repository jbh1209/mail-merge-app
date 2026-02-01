

# Fix PDF Generation Failure at Completion

## Problem Summary
The PDF export appeared to complete all exporting and uploading phases but failed "at the very end." The database shows recent merge jobs completing successfully, and edge functions are responding correctly. This indicates a transient network or timeout issue during the final compose or download phase.

## Root Cause Analysis
After investigation:
1. Most recent merge jobs in database: **complete** (no errors)
2. `compose-label-sheet` edge function: **responding correctly**
3. `get-download-url` edge function: **responding correctly with signed URLs**
4. Storage bucket: **accessible**

The failure was likely caused by:
- Intermittent network issues (user reports hanging/network errors throughout the session)
- Edge function timeout during the compose phase for complex/large PDFs
- Session token expiration during long-running operations

## Proposed Fixes

### 1. Add Retry Logic for Edge Function Calls
Improve resilience by adding retry logic to the `composeFromStorage` function in `src/lib/polotno/pdfBatchExporter.ts`.

```typescript
async function composeFromStorage(...) {
  const maxRetries = 3;
  let lastError = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const { data, error } = await supabase.functions.invoke('compose-label-sheet', {...});
      if (!error) return { success: data?.success ?? false, ... };
      lastError = error;
      console.warn(`Compose attempt ${attempt} failed:`, error.message);
      if (attempt < maxRetries) await new Promise(r => setTimeout(r, 2000 * attempt));
    } catch (e) {
      lastError = e;
    }
  }
  return { success: false, error: lastError?.message || 'Compose failed after retries' };
}
```

### 2. Add Detailed Error Logging with Phase Tracking
Improve error messages to show exactly which phase failed (exporting, uploading, or composing).

### 3. Add Progress Message for CMYK Conversion (Server-Side)
Since CMYK conversion happens on the server and can take time, add a message indicating this phase.

### 4. Handle Network Timeouts Gracefully
Add timeout handling around the compose function invocation to catch hanging requests.

---

## Implementation Details

### File: `src/lib/polotno/pdfBatchExporter.ts`

**Changes:**
1. Add retry logic to `composeFromStorage` with exponential backoff
2. Improve error messages to include the phase that failed
3. Add timeout wrapper around edge function calls

### File: `src/components/polotno/PolotnoPdfGenerator.tsx`

**Changes:**
1. Add better error state display showing which phase failed
2. Add "Retry" button for transient failures
3. Improve progress messaging for compose phase

---

## Technical Details

### Retry Strategy
- Maximum 3 attempts for compose function
- Exponential backoff: 2s, 4s, 6s delays between retries
- Non-retryable errors (auth, invalid data) fail immediately

### Timeout Handling
- Add 60-second timeout wrapper for compose function
- Clear error message on timeout: "PDF composition timed out - please try again"

### Edge Case Handling
1. **Network disconnect during upload**: Individual upload retries already exist via batch processing
2. **Token expiration**: Supabase client auto-refreshes tokens
3. **Large PDFs timing out**: Compose function handles batching internally

---

## Files to Modify
1. `src/lib/polotno/pdfBatchExporter.ts` - Add retry logic and timeout handling
2. `src/components/polotno/PolotnoPdfGenerator.tsx` - Add retry button and improved error display

## Testing Checklist
- Export a certificate project with a background image
- Verify progress phases display correctly
- Simulate network disconnect during compose to test retry
- Verify error messages are helpful when failures occur

