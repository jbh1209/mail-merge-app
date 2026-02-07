# Vector PDF Export Service Integration

## Status: ✅ COMPLETE

## Summary

The VPS microservice at `https://pdf.jaimar.dev` has been integrated to enable true **vector PDF exports** with optional **CMYK conversion**.

---

## What Was Implemented

### 1. Secrets Configured ✅
- `VITE_PDF_EXPORT_SERVICE_URL` = `https://pdf.jaimar.dev`
- `VITE_PDF_EXPORT_API_SECRET` = (user's secret)

### 2. New File: `src/lib/polotno/vectorPdfExporter.ts` ✅
A utility module that:
- Calls the `/render` endpoint for single PDFs
- Calls `/batch-render` for multiple scenes (5+ records)
- Handles authentication via `x-api-key` header
- Converts base64 responses back to Blobs
- Falls back gracefully if service is unavailable

### 3. Modified: `src/lib/polotno/pdfBatchExporter.ts` ✅
- Added automatic detection of vector service availability
- Vector path: Sends scene JSON to VPS, receives vector PDF with CMYK already applied
- Raster fallback: Uses client-side Polotno export + optional WASM CMYK conversion
- No client-side CMYK conversion when using vector service (handled server-side)

### 4. Modified: `src/components/polotno/PolotnoPdfGenerator.tsx` ✅
- Updated progress bar weighting (exporting now 65% since no separate CMYK phase)
- Updated messaging to indicate "fallback" when CMYK conversion happens client-side

---

## Architecture

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│  Lovable App (Browser)                                                      │
│    → resolveVdpVariables() for each record                                  │
│    → Check isVectorServiceAvailable()                                       │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │
          ┌───────────────────────────┴────────────────────────────┐
          │                                                        │
          ▼ (Vector Service Available)                             ▼ (Fallback)
┌──────────────────────────────────┐                ┌──────────────────────────────┐
│  VPS: pdf.jaimar.dev             │                │  Client-Side Raster Export   │
│  POST /render { scene, cmyk }    │                │  store.toPDFDataURL()        │
│  → @polotno/pdf-export           │                │  + WASM CMYK (if requested)  │
│  → Ghostscript PDF/X-1a          │                │                              │
│  Returns: Vector PDF bytes       │                │  Returns: Raster PDF blob    │
└─────────────────────────────────┘                └──────────────────────────────┘
          │                                                        │
          └────────────────────────────┬───────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Upload to Supabase Storage → compose-label-sheet → Download                │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Benefits

| Aspect | Before | After |
|--------|--------|-------|
| PDF Type | Raster (flattened images) | Vector (selectable text, paths) |
| CMYK Conversion | Client-side per-page WASM | Server-side with Ghostscript |
| Export Speed | Slow for CMYK batches | Fast (no client WASM overhead) |
| File Size | Large (embedded images) | Smaller (vector shapes) |
| Print Quality | Good | Professional (PDF/X-1a) |

---

## Testing Checklist

- [ ] Health check: Service responds at `/health`
- [ ] Small job (RGB): Export 2-3 labels without CMYK
- [ ] Small job (CMYK): Export 2-3 labels with CMYK enabled
- [ ] Larger job: Export 25+ labels with CMYK
- [ ] Fallback test: Disable service URL → confirm raster export works
- [ ] File size comparison: Vector vs raster PDF
- [ ] Print test: Open in Acrobat → confirm text is selectable

---

## Troubleshooting

### Service Not Available
If the vector service is unavailable, the app automatically falls back to client-side raster export with optional WASM-based CMYK conversion.

### CORS Errors
Ensure your VPS has CORS configured to allow:
- `https://mail-merge-app.lovable.app`
- `https://*.lovable.app`

### Large Scenes
For very large designs, consider:
- Increasing memory allocation in Docker
- Adding chunked processing for 50+ record batches
