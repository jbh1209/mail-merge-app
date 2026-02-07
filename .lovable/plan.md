

# Fix: Vector PDF Service Integration via Edge Function Proxy

## Problem Identified

The vector PDF export is falling back to client-side CMYK conversion because the environment variables aren't accessible in the browser.

**Technical Root Cause:**
- Secrets added via Lovable's secrets system (`VITE_PDF_EXPORT_SERVICE_URL`, `VITE_PDF_EXPORT_API_SECRET`) are available to **edge functions** via `Deno.env.get()`
- They are **NOT** available to client-side browser code via `import.meta.env`
- The `VITE_` prefix convention only works for actual `.env` file entries, not Lovable project secrets
- Result: `isVectorServiceAvailable()` returns `false` because `SERVICE_URL` and `API_SECRET` are both undefined in the browser

---

## Solution: Edge Function Proxy

Create a new edge function that proxies requests to your VPS microservice. This approach:
- Keeps the API secret secure (never exposed to browser)
- Follows the existing pattern used by `get-polotno-key`
- Provides better security than exposing credentials to the client

---

## Architecture After Fix

```text
Browser (Client)                          Lovable Edge Functions                        Your VPS
┌─────────────────────┐                   ┌────────────────────────┐                   ┌─────────────────────┐
│ pdfBatchExporter.ts │  POST /render     │ render-vector-pdf      │  POST /render     │ pdf.jaimar.dev      │
│                     │ ─────────────────→│                        │ ─────────────────→│                     │
│ (scene JSON)        │                   │ Reads secrets from     │ (+ x-api-key)     │ @polotno/pdf-export │
│                     │←─────────────────│ Deno.env.get()         │←─────────────────│                     │
│ (PDF blob)          │  PDF bytes        │ Forwards request       │  PDF bytes        │ Returns vector PDF  │
└─────────────────────┘                   └────────────────────────┘                   └─────────────────────┘
```

---

## Files to Create

### 1. New Edge Function: `supabase/functions/render-vector-pdf/index.ts`

A proxy edge function that:
- Reads `PDF_EXPORT_SERVICE_URL` and `PDF_EXPORT_API_SECRET` from environment
- Accepts scene JSON from the client
- Forwards the request to your VPS with the API key
- Returns the PDF bytes to the client
- Includes error handling and logging

---

## Files to Modify

### 2. Update: `src/lib/polotno/vectorPdfExporter.ts`

Change the implementation to:
- Remove direct VPS calls (no more `import.meta.env` reading)
- Call the new edge function instead
- The edge function handles authentication with the VPS
- Keep the same public API (`isVectorServiceAvailable`, `exportVectorPdf`, etc.)

### 3. Update Secrets Configuration

The secrets need to be renamed without the `VITE_` prefix since they're now edge-function-only:
- `PDF_EXPORT_SERVICE_URL` - The VPS URL
- `PDF_EXPORT_API_SECRET` - The API key

---

## Technical Details

### Edge Function Implementation

```typescript
// supabase/functions/render-vector-pdf/index.ts

// Read secrets (not exposed to browser)
const SERVICE_URL = Deno.env.get('PDF_EXPORT_SERVICE_URL');
const API_SECRET = Deno.env.get('PDF_EXPORT_API_SECRET');

// Health check endpoint for availability detection
if (path === '/health') {
  // Forward health check to VPS
  const vpsResponse = await fetch(`${SERVICE_URL}/health`);
  return vpsResponse;
}

// Render endpoint - forward scene to VPS
if (path === '/render') {
  const response = await fetch(`${SERVICE_URL}/render`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_SECRET,
    },
    body: JSON.stringify(requestBody),
  });
  
  // Return PDF bytes
  return new Response(await response.arrayBuffer(), {
    headers: { 'Content-Type': 'application/pdf' }
  });
}
```

### Client-Side Changes

```typescript
// src/lib/polotno/vectorPdfExporter.ts

// Instead of calling VPS directly, call edge function
const EDGE_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/render-vector-pdf`;

export async function isVectorServiceAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${EDGE_FUNCTION_URL}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

export async function exportVectorPdf(scene, options): Promise<VectorExportResult> {
  const response = await fetch(`${EDGE_FUNCTION_URL}/render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scene, options }),
  });
  // ...
}
```

---

## Why This Approach?

| Aspect | Direct VPS Call (Failed) | Edge Function Proxy (Solution) |
|--------|-------------------------|-------------------------------|
| API Secret Location | Browser (exposed) | Edge function (secure) |
| Secret Access | `import.meta.env` (doesn't work with Lovable secrets) | `Deno.env.get()` (works) |
| Security | API key visible in network tab | API key never leaves server |
| CORS | Requires VPS CORS config | Handled by edge function |

---

## Summary of Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/functions/render-vector-pdf/index.ts` | Create | Proxy requests to VPS with secure API key |
| `src/lib/polotno/vectorPdfExporter.ts` | Modify | Call edge function instead of VPS directly |

---

## Testing After Implementation

1. Export a small batch of labels (2-3 records)
2. Console should show `[VectorExport] Service is available`
3. Progress modal should NOT show "Converting to CMYK (fallback)..."
4. Instead, it should show "Generating vector PDF X of Y (CMYK)..."
5. Verify the final PDF has selectable text (vector, not raster)

