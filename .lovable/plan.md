

# Fix: Remove Invalid Import

## Problem

Line 6 of `tmp/vps/server.js` imports `jsonToPDFBase64` which does not exist in `@polotno/pdf-export`, causing a startup crash.

## The Fix

One line change:

**Line 6 — Before:**
```javascript
import { jsonToPDF, jsonToPDFBase64 } from '@polotno/pdf-export';
```

**Line 6 — After:**
```javascript
import { jsonToPDF } from '@polotno/pdf-export';
```

## About pdf-lib

The `pdf-lib` import is already present on line 10:
```javascript
import { PDFDocument, rgb, PDFName, PDFArray, PDFNumber } from 'pdf-lib';
```

You will still need to run `npm install pdf-lib` on the VPS if you haven't already, so that this import resolves at runtime.

## After the fix

1. Push updated `server.js` to your repo
2. Run `npm install pdf-lib` on the VPS (if not done yet)
3. Redeploy/restart in Coolify
4. Verify with `curl https://pdf.jaimar.dev/health`

