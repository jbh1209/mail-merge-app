

# Update Lovable Cloud Secret to Match VPS

## Current Status

You've redeployed your VPS with the new alphanumeric secret:
```
V9rQm7L2xAPz8K4nW6bY3cJ5
```

## Implementation Steps

### Step 1: Update Lovable Cloud Secret

Update `VITE_PDF_EXPORT_API_SECRET` to match the new alphanumeric value.

### Step 2: Redeploy Edge Function

Deploy `render-vector-pdf` to pick up the new secret value.

### Step 3: Test Vector PDF Export

Export a small batch (2-3 records) to verify the 401 error is resolved.

## Expected Result

Console should show:
```
[render-vector-pdf] Render successful, returning X bytes
```

## Technical Notes

- Alphanumeric secrets eliminate any potential encoding issues with special characters
- Both VPS and Edge Function will now have byte-for-byte matching values
- No shell escaping, URL encoding, or JSON serialization issues possible

