
# Fix Server-Side 500 Error: Redeploy compose-label-sheet Edge Function

## Problem Identified
The edge function logs reveal the exact error:

```
Composition error: ReferenceError: applyCmyk is not defined
    at Server.<anonymous> (compose-label-sheet/index.ts:293:5)
```

However, the **repository code** at line 293 is:
```typescript
const pages = await outputPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());
```

This means the **deployed edge function is running an older version** that still references `applyCmyk` (the pdfRest conversion function we removed). The code in the repository is correct - it just hasn't been deployed yet.

## Root Cause
When the edge function was updated to remove server-side CMYK conversion, the deployment didn't take effect. The running function is stale.

## Solution
Simply redeploy the `compose-label-sheet` edge function. No code changes needed - the repository already has the correct code.

## What the Fix Achieves

| Before (stale deployment) | After (fresh deployment) |
|---------------------------|--------------------------|
| References `applyCmyk` function | No CMYK logic on server |
| Crashes with ReferenceError | Clean pass-through composition |
| 500 error on every export | Successful PDF composition |

## Implementation
1. Trigger a redeployment of `compose-label-sheet`
2. Test PDF export to confirm the 500 error is resolved

## Technical Notes
- The repository code is already correct (lines 190-200 show CMYK is noted as client-side only)
- No code modifications needed
- This is purely a deployment synchronization issue
