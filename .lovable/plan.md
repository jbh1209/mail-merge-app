

# Fix: Update API Secret to Match Coolify Value

## Confirmed Values

| Location | Variable Name | Value |
|----------|---------------|-------|
| Coolify VPS | `API_SECRET` | `V9!rQm7@L2x#A$Pz` |
| Lovable Cloud | `VITE_PDF_EXPORT_API_SECRET` | (needs to match above) |

## Root Cause Confirmed

The secret values between Lovable Cloud and Coolify don't match. This is why:
- Health check passes (no auth required)
- Render fails with 401 (auth required, secret mismatch)

## Fix Steps

### Step 1: Update Secret in Lovable Cloud

Update `VITE_PDF_EXPORT_API_SECRET` with the exact value:
```text
V9!rQm7@L2x#A$Pz
```

### Step 2: Redeploy Edge Function

Redeploy `render-vector-pdf` to pick up the new secret value.

### Step 3: Test Vector PDF Export

Export a small batch (2-3 records) to verify the 401 error is resolved.

## Expected Result

Console should show:
```text
[render-vector-pdf] Render successful, returning X bytes
```

Instead of:
```text
[render-vector-pdf] VPS render failed: 401 {"error":"Unauthorized"}
```

