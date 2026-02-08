
# Server-Side Vector PDF Rendering with @polotno/pdf-export

## Overview

This plan restructures the PDF export pipeline to use Polotno's official Node.js package for true vector PDF generation with native PDF/X-1a CMYK conversion. Instead of client-side rasterization + Ghostscript CMYK conversion, we'll send the Polotno JSON scene to the VPS and let `@polotno/pdf-export` handle everything.

## Current vs Proposed Architecture

```text
CURRENT (broken):
  Client Polotno → toPDFDataURL() → Rasterized PDF → VPS Ghostscript → CMYK fails (strict PDF/X mode)

PROPOSED (correct):
  Client Polotno JSON → VPS @polotno/pdf-export → Vector PDF/X-1a with native CMYK → Return to client
```

The key insight from the documentation:
- `@polotno/pdf-export` produces **true vector PDFs**
- Setting `pdfx1a: true` handles CMYK conversion, transparency flattening, and font embedding
- It uses Ghostscript internally (which we already have installed)
- Simple API: `jsonToPDF(scene, outputPath, { pdfx1a: true })`

## Implementation Scope

### VPS Server (Your GitHub Repository)

**1. Install the package**
```bash
npm install @polotno/pdf-export
```

**2. Add new endpoint `/render-vector`**
```javascript
import { jsonToPDF } from '@polotno/pdf-export';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

app.post('/render-vector', async (req, res) => {
  // Validate API key
  if (req.headers['x-api-key'] !== process.env.API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { scene, options = {} } = req.body;
  const tempDir = `/tmp/render-${uuidv4()}`;
  const outputPath = path.join(tempDir, 'output.pdf');

  try {
    await fs.mkdir(tempDir, { recursive: true });

    // Use @polotno/pdf-export for true vector PDF
    await jsonToPDF(scene, outputPath, {
      pdfx1a: options.cmyk ?? false,  // Native CMYK via PDF/X-1a
      metadata: {
        title: options.title || 'Export',
        application: 'MergeKit VPS',
      },
    });

    // Read and return PDF
    const pdfBuffer = await fs.readFile(outputPath);
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);

    // Cleanup
    await fs.rm(tempDir, { recursive: true, force: true });
  } catch (error) {
    console.error('Render error:', error);
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    res.status(500).json({ 
      error: 'Render failed', 
      details: error.message 
    });
  }
});
```

**3. Add batch endpoint `/batch-render-vector`**
```javascript
app.post('/batch-render-vector', async (req, res) => {
  // Validate API key
  if (req.headers['x-api-key'] !== process.env.API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { scenes, options = {} } = req.body;
  const results = [];

  for (let i = 0; i < scenes.length; i++) {
    const tempDir = `/tmp/batch-${uuidv4()}`;
    const outputPath = path.join(tempDir, 'output.pdf');

    try {
      await fs.mkdir(tempDir, { recursive: true });
      await jsonToPDF(scenes[i], outputPath, {
        pdfx1a: options.cmyk ?? false,
      });

      const pdfBuffer = await fs.readFile(outputPath);
      results.push({
        index: i,
        success: true,
        pdf: pdfBuffer.toString('base64'),
      });

      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      results.push({
        index: i,
        success: false,
        error: error.message,
      });
    }
  }

  res.json({
    results,
    successful: results.filter(r => r.success).length,
    total: scenes.length,
  });
});
```

### Supabase Edge Function Update

Update `supabase/functions/render-vector-pdf/index.ts` to add handlers for the new endpoints:

| Endpoint | Purpose |
|----------|---------|
| `POST /render-vector` | Single scene → Vector PDF (with optional CMYK) |
| `POST /batch-render-vector` | Multiple scenes → Base64 PDFs |

The edge function will proxy requests to the VPS, forwarding the Polotno JSON scenes.

### Client-Side Changes

**1. Update `vectorPdfExporter.ts`**
- Change endpoint from `/render` to `/render-vector`
- Keep the same request format (scene JSON + options)

**2. Update `pdfBatchExporter.ts`**
- Add logic to check if vector service is available
- If available and CMYK requested: send scene JSON to VPS for rendering
- If not available: fall back to client-side rasterized export (current behavior)

### Flow Comparison

**For CMYK Export:**
```text
1. User clicks "Export with CMYK"
2. Client resolves VDP variables for each record
3. Client sends resolved scene JSON to edge function
4. Edge function proxies to VPS /render-vector
5. VPS uses @polotno/pdf-export with pdfx1a: true
6. VPS returns vector PDF with native CMYK
7. Client uploads to Supabase Storage
8. compose-label-sheet merges into final output
```

**For RGB Export:**
```text
1. User clicks "Export"
2. Client uses Polotno store.toPDFDataURL() (rasterized but fast)
3. Client uploads to Supabase Storage
4. compose-label-sheet merges into final output
```

## Technical Requirements

### VPS Dependencies
```json
{
  "dependencies": {
    "@polotno/pdf-export": "^0.1.36",
    "express": "^4.18.2",
    "uuid": "^9.0.0"
  }
}
```

### VPS Environment
- Node.js 18+ (required by @polotno/pdf-export)
- Ghostscript installed (already present)
- ICC profiles for CMYK (already present: GRACoL, FOGRA39)

### Key Benefits

| Aspect | Before | After |
|--------|--------|-------|
| PDF Type | Rasterized (bitmap in PDF wrapper) | True vector (scalable, smaller files) |
| CMYK Conversion | Ghostscript on raw PDF (fails) | Native PDF/X-1a (built-in) |
| Font Handling | Embedded as raster | Outlined/embedded vectors |
| Transparency | Flattened at export | Properly handled by PDF/X-1a |
| Print Quality | Pixel-dependent | Resolution-independent |

## Files to Modify

| Location | File | Changes |
|----------|------|---------|
| VPS (GitHub) | `server.js` | Add `/render-vector` and `/batch-render-vector` endpoints |
| VPS (GitHub) | `package.json` | Add `@polotno/pdf-export` dependency |
| Lovable | `supabase/functions/render-vector-pdf/index.ts` | Add proxy handlers for new endpoints |
| Lovable | `src/lib/polotno/vectorPdfExporter.ts` | Update to call new endpoints |
| Lovable | `src/lib/polotno/pdfBatchExporter.ts` | Integrate vector export path for CMYK |

## Implementation Order

1. **VPS First**: Update your GitHub repository with the new endpoints and `@polotno/pdf-export`
2. **Deploy**: Push to trigger Coolify rebuild
3. **Edge Function**: Update proxy to forward to new endpoints
4. **Client**: Update exporters to use vector path when CMYK is requested

## Summary

This is the correct architectural approach:
- Polotno JSON goes to server
- `@polotno/pdf-export` handles vector rendering + CMYK natively
- No more broken Ghostscript conversion on rasterized PDFs
- Professional print-ready output with true vectors
