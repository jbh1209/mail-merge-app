

# Fix: VPS API Secret Not Being Read Correctly

## Root Cause Identified

The 401 error is happening because the Edge Function is looking for secrets with the **wrong names**.

**Current code in `render-vector-pdf/index.ts`:**
```typescript
const SERVICE_URL = Deno.env.get('VITE_PDF_EXPORT_SERVICE_URL');  // ❌ Wrong name
const API_SECRET = Deno.env.get('VITE_PDF_EXPORT_API_SECRET');   // ❌ Wrong name
```

**Secrets actually configured in Lovable Cloud:**
- `VITE_PDF_EXPORT_SERVICE_URL` ✓ (matches by coincidence)
- `VITE_PDF_EXPORT_API_SECRET` ✓ (matches by coincidence)

Wait - they DO match! Let me check the logs more carefully...

Actually, the **health check passes** which means `SERVICE_URL` is being read correctly (the URL is correct). But the **render fails with 401** which means the VPS is rejecting the API key.

**The real issue:** The API key stored in Lovable Cloud (`VITE_PDF_EXPORT_API_SECRET`) does NOT match the `API_SECRET` configured in your Coolify VPS.

---

## Evidence

1. Health check passes → URL is correct, VPS is reachable
2. Render returns 401 → VPS received the request but the `x-api-key` header value was rejected
3. VPS responded `{"error":"Unauthorized"}` → This is your VPS's auth middleware rejecting the key

---

## Solution

The API secret stored in Lovable Cloud needs to match exactly what's configured in Coolify. Since you have the key available, we need to **update the secret** in Lovable Cloud.

### What I'll Do

1. **Request to update the secret** `VITE_PDF_EXPORT_API_SECRET` with the correct value
2. **Redeploy the edge function** to pick up the updated secret
3. **Test the render endpoint** to confirm it works

---

## Technical Detail

The Edge Function code is correct - it's reading the secret and passing it to your VPS:

```typescript
// Line 68-75 in render-vector-pdf/index.ts
const vpsResponse = await fetch(`${SERVICE_URL}/render`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': API_SECRET,  // This value must match VPS's API_SECRET
  },
  body: JSON.stringify(body),
});
```

---

## Verification Steps After Fix

1. Export a small batch of labels (2-3 records)
2. Console should show `[render-vector-pdf] Render successful, returning X bytes`
3. No more "VPS error: 401" messages
4. PDF generation completes successfully

---

## Action Required From You

When I request the secret update, please paste the **exact API_SECRET value** from your Coolify environment variables for the pdf-export-service.

