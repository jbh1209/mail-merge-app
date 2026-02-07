

# Complete Docker Setup for CMYK Conversion Microservice

## Overview

This provides all the files needed for your GitHub repository that Coolify will use to build and deploy your CMYK conversion microservice.

## File Structure

```text
your-repo/
├── Dockerfile
├── package.json
├── server.js
├── profiles/
│   ├── .gitkeep
│   └── README.md
└── .dockerignore
```

## File 1: Dockerfile

```dockerfile
FROM node:20-slim

# Install Ghostscript
RUN apt-get update && \
    apt-get install -y ghostscript wget && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Create profiles directory
RUN mkdir -p /app/profiles

# Download ICC profiles during build
RUN wget -O /app/profiles/GRACoL2013_CRPC6.icc \
    "https://www.colormanagement.org/downloads/GRACoL2013_CRPC6.icc" && \
    wget -O /app/profiles/ISOcoated_v2_eci.icc \
    "https://www.colormanagement.org/downloads/ISOcoated_v2_eci.icc"

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY server.js ./

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start server
CMD ["node", "server.js"]
```

## File 2: package.json

```json
{
  "name": "cmyk-conversion-service",
  "version": "2.0.0",
  "description": "CMYK PDF conversion microservice using Ghostscript",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.2"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

## File 3: server.js

```javascript
const express = require('express');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;
const API_SECRET = process.env.API_SECRET;

// ICC profile paths
const PROFILES = {
  gracol: '/app/profiles/GRACoL2013_CRPC6.icc',
  fogra39: '/app/profiles/ISOcoated_v2_eci.icc'
};

// =============================================================================
// MIDDLEWARE
// =============================================================================

// Authentication middleware
const authMiddleware = (req, res, next) => {
  if (!API_SECRET) {
    console.error('[Auth] API_SECRET not configured');
    return res.status(500).json({ error: 'Server misconfigured' });
  }
  
  const providedKey = req.headers['x-api-key'];
  if (!providedKey || providedKey !== API_SECRET) {
    console.warn('[Auth] Invalid or missing API key');
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  next();
};

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// =============================================================================
// HEALTH CHECK
// =============================================================================

app.get('/health', (req, res) => {
  // Verify Ghostscript is available
  try {
    const gsVersion = execSync('gs --version', { encoding: 'utf8' }).trim();
    
    // Check ICC profiles exist
    const gracolExists = fs.existsSync(PROFILES.gracol);
    const fogra39Exists = fs.existsSync(PROFILES.fogra39);
    
    res.json({
      status: 'healthy',
      ghostscript: gsVersion,
      profiles: {
        gracol: gracolExists,
        fogra39: fogra39Exists
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

// =============================================================================
// CMYK CONVERSION ENDPOINT
// =============================================================================

app.post('/convert-cmyk', 
  authMiddleware,
  express.raw({ type: 'application/pdf', limit: '100mb' }),
  async (req, res) => {
    const startTime = Date.now();
    const profile = req.query.profile === 'fogra39' ? 'fogra39' : 'gracol';
    const profilePath = PROFILES[profile];
    
    console.log(`[Convert] Starting CMYK conversion with profile: ${profile}`);
    
    if (!req.body || req.body.length === 0) {
      return res.status(400).json({ error: 'No PDF data provided' });
    }
    
    if (!fs.existsSync(profilePath)) {
      console.error(`[Convert] ICC profile not found: ${profilePath}`);
      return res.status(500).json({ error: `ICC profile not found: ${profile}` });
    }
    
    // Create temp directory for this conversion
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmyk-'));
    const inputPath = path.join(tempDir, 'input.pdf');
    const outputPath = path.join(tempDir, 'output.pdf');
    
    try {
      // Write input PDF
      fs.writeFileSync(inputPath, req.body);
      console.log(`[Convert] Input PDF: ${req.body.length} bytes`);
      
      // Run Ghostscript CMYK conversion
      const gsCommand = [
        'gs',
        '-dBATCH',
        '-dNOPAUSE',
        '-dNOSAFER',
        '-dPDFX',
        '-sDEVICE=pdfwrite',
        '-sColorConversionStrategy=CMYK',
        '-sProcessColorModel=DeviceCMYK',
        '-dOverrideICC=true',
        `-sOutputICCProfile=${profilePath}`,
        `-sOutputFile=${outputPath}`,
        inputPath
      ].join(' ');
      
      console.log(`[Convert] Running Ghostscript...`);
      execSync(gsCommand, { 
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024 // 50MB buffer for logs
      });
      
      // Read and return output
      const cmykPdf = fs.readFileSync(outputPath);
      const duration = Date.now() - startTime;
      
      console.log(`[Convert] Success: ${cmykPdf.length} bytes in ${duration}ms`);
      
      res.set('Content-Type', 'application/pdf');
      res.set('X-Conversion-Time-Ms', duration.toString());
      res.send(cmykPdf);
      
    } catch (error) {
      console.error('[Convert] Ghostscript error:', error.message);
      res.status(500).json({ 
        error: 'CMYK conversion failed',
        details: error.message 
      });
    } finally {
      // Cleanup temp files
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (e) {
        console.warn('[Convert] Cleanup warning:', e.message);
      }
    }
  }
);

// =============================================================================
// BATCH CONVERSION ENDPOINT
// =============================================================================

app.post('/batch-convert-cmyk',
  authMiddleware,
  express.json({ limit: '200mb' }),
  async (req, res) => {
    const startTime = Date.now();
    const { pdfs, profile = 'gracol' } = req.body;
    
    if (!Array.isArray(pdfs) || pdfs.length === 0) {
      return res.status(400).json({ error: 'No PDFs provided' });
    }
    
    console.log(`[Batch] Converting ${pdfs.length} PDFs with profile: ${profile}`);
    
    const profilePath = PROFILES[profile] || PROFILES.gracol;
    const results = [];
    
    for (let i = 0; i < pdfs.length; i++) {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmyk-batch-'));
      const inputPath = path.join(tempDir, 'input.pdf');
      const outputPath = path.join(tempDir, 'output.pdf');
      
      try {
        // Decode base64 PDF
        const pdfBuffer = Buffer.from(pdfs[i], 'base64');
        fs.writeFileSync(inputPath, pdfBuffer);
        
        // Run Ghostscript
        const gsCommand = [
          'gs',
          '-dBATCH',
          '-dNOPAUSE',
          '-dNOSAFER',
          '-dPDFX',
          '-sDEVICE=pdfwrite',
          '-sColorConversionStrategy=CMYK',
          '-sProcessColorModel=DeviceCMYK',
          '-dOverrideICC=true',
          `-sOutputICCProfile=${profilePath}`,
          `-sOutputFile=${outputPath}`,
          inputPath
        ].join(' ');
        
        execSync(gsCommand, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
        
        // Read output and encode as base64
        const cmykPdf = fs.readFileSync(outputPath);
        results.push({
          success: true,
          data: cmykPdf.toString('base64')
        });
        
        console.log(`[Batch] Converted ${i + 1}/${pdfs.length}`);
        
      } catch (error) {
        console.error(`[Batch] Error on PDF ${i + 1}:`, error.message);
        results.push({
          success: false,
          error: error.message
        });
      } finally {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (e) {}
      }
    }
    
    const duration = Date.now() - startTime;
    console.log(`[Batch] Complete: ${results.filter(r => r.success).length}/${pdfs.length} successful in ${duration}ms`);
    
    res.json({
      success: true,
      results,
      totalTime: duration
    });
  }
);

// =============================================================================
// START SERVER
// =============================================================================

app.listen(PORT, '0.0.0.0', () => {
  console.log(`CMYK Conversion Service running on port ${PORT}`);
  console.log(`API_SECRET configured: ${API_SECRET ? 'Yes' : 'NO - AUTH DISABLED!'}`);
  
  // Verify Ghostscript on startup
  try {
    const gsVersion = execSync('gs --version', { encoding: 'utf8' }).trim();
    console.log(`Ghostscript version: ${gsVersion}`);
  } catch (e) {
    console.error('WARNING: Ghostscript not found!');
  }
  
  // Verify ICC profiles on startup
  Object.entries(PROFILES).forEach(([name, path]) => {
    const exists = fs.existsSync(path);
    console.log(`ICC Profile ${name}: ${exists ? 'Found' : 'MISSING!'}`);
  });
});
```

## File 4: .dockerignore

```text
node_modules
npm-debug.log
.git
.gitignore
README.md
.env
*.md
```

## File 5: profiles/README.md

```markdown
# ICC Profiles

These profiles are downloaded automatically during Docker build.

- **GRACoL2013_CRPC6.icc** - US commercial printing (GRACoL)
- **ISOcoated_v2_eci.icc** - EU commercial printing (Fogra39)

If automatic download fails, manually download from:
- https://www.colormanagement.org/downloads/
```

## File 6: profiles/.gitkeep

```text
# This file ensures the profiles directory exists in git
```

## Coolify Environment Variables

In your Coolify dashboard, set this environment variable:

| Variable | Value |
|----------|-------|
| `API_SECRET` | `V9rQm7L2xAPz8K4nW6bY3cJ5` |

## Deployment Steps

1. **Create/update files** in your GitHub repository with the content above
2. **Commit and push** to your repository
3. **Coolify will automatically redeploy** when it detects the changes
4. **Verify deployment** by checking the health endpoint:
   ```bash
   curl https://pdf.jaimar.dev/health
   ```

## Expected Health Check Response

```json
{
  "status": "healthy",
  "ghostscript": "10.02.1",
  "profiles": {
    "gracol": true,
    "fogra39": true
  },
  "timestamp": "2025-02-07T12:00:00.000Z"
}
```

## Testing the Conversion

Once deployed, test with:
```bash
curl -X POST https://pdf.jaimar.dev/convert-cmyk?profile=gracol \
  -H "x-api-key: V9rQm7L2xAPz8K4nW6bY3cJ5" \
  -H "Content-Type: application/pdf" \
  --data-binary @test.pdf \
  --output converted.pdf
```

## Next Steps After Deployment

Once your VPS is redeployed and the `/health` endpoint shows all profiles are available, let me know and I'll:

1. Update the Edge Function to proxy to `/convert-cmyk`
2. Update the client-side code to use client Polotno export + VPS CMYK conversion
3. Remove the old `/render` scene-based endpoint logic

