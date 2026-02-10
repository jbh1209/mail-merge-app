import express from 'express';
import cors from 'cors';
import path from 'path';
import { promises as fs } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { jsonToPDF, jsonToPDFBase64 } from '@polotno/pdf-export';
import { exec } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const API_SECRET = process.env.API_SECRET || 'V9rQm7L2xAPz8K4nW6bY3cJ5';

// Increase payload limit for large scenes
app.use(express.json({ limit: '100mb' }));
app.use(cors());

// Temp directory for PDF processing
const TEMP_DIR = '/tmp/pdf-export';

// ICC profiles directory
const ICC_DIR = path.join(__dirname, 'profiles');

// Ensure temp directory exists
async function ensureTempDir() {
  try {
    await fs.mkdir(TEMP_DIR, { recursive: true });
  } catch (e) {
    console.error('Failed to create temp directory:', e);
  }
}
ensureTempDir();

// API key authentication middleware
function authenticate(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// =============================================================================
// HEALTH CHECK
// =============================================================================
app.get('/health', async (req, res) => {
  try {
    // Check if ghostscript is available
    const { stdout: gsVersion } = await execAsync('gs --version');
    
    // Check if qpdf is available
    let qpdfVersion = 'not installed';
    try {
      const { stdout } = await execAsync('qpdf --version');
      qpdfVersion = stdout.trim().split('\n')[0];
    } catch (_) {}
    
    // Check ICC profiles
    const gracol = await fs.access(path.join(ICC_DIR, 'GRACoL2013_CRPC6.icc')).then(() => true).catch(() => false);
    const fogra = await fs.access(path.join(ICC_DIR, 'ISOcoated_v2_eci.icc')).then(() => true).catch(() => false);

    res.json({
      status: 'ok',
      ghostscript: gsVersion.trim(),
      qpdf: qpdfVersion,
      icc: { gracol, fogra },
      polotno: '@polotno/pdf-export available',
      pipeline: 'two-pass (Polotno RGB+bleed+crops → Ghostscript CMYK)',
    });
  } catch (e) {
    res.status(500).json({ status: 'error', error: e.message });
  }
});

// =============================================================================
// EXPORT MULTI-PAGE PDF — TWO-PASS PIPELINE
//
// Pass 1: Polotno renders vector PDF with native bleed + crop marks (RGB)
// Pass 2: Ghostscript converts to CMYK (preserving vectors)
// =============================================================================
app.post('/export-multipage', authenticate, async (req, res) => {
  const startTime = Date.now();
  const jobId = uuidv4();
  const vectorPath = path.join(TEMP_DIR, `${jobId}-vector.pdf`);
  const cmykPath = path.join(TEMP_DIR, `${jobId}-cmyk.pdf`);

  try {
    const { scene, options = {} } = req.body;

    if (!scene || !scene.pages) {
      return res.status(400).json({ error: 'Scene with pages is required' });
    }

    const wantCmyk = options.cmyk === true;
    const bleedMm = Number.isFinite(options.bleed) ? options.bleed : 0;
    const wantCropMarks = options.cropMarks === true;
    const iccProfile = options.iccProfile || 'gracol'; // 'gracol' or 'fogra39'

    // Convert bleed mm to pixels (scene DPI, default 300)
    const dpi = scene.dpi || 300;
    const bleedPx = Math.round(bleedMm * (dpi / 25.4));

    console.log(`[${jobId}] Export multi-page: ${scene.pages.length} pages`);
    console.log(`[${jobId}]   CMYK: ${wantCmyk}, Bleed: ${bleedMm}mm (${bleedPx}px), CropMarks: ${wantCropMarks}`);

    // Set bleed on each page so Polotno knows the bleed size
    if (bleedPx > 0) {
      for (const page of scene.pages) {
        page.bleed = bleedPx;
      }
    }

    // ── PASS 1: Polotno renders vector PDF (RGB) with native bleed + crop marks ──
    console.log(`[${jobId}] Pass 1: Polotno vector PDF (includeBleed: ${bleedPx > 0}, cropMarkSize: ${wantCropMarks && bleedPx > 0 ? 20 : 0})`);

    await jsonToPDF(scene, vectorPath, {
      title: options.title || 'MergeKit Export',
      includeBleed: bleedPx > 0,
      cropMarkSize: (wantCropMarks && bleedPx > 0) ? 20 : 0,
      // NO pdfx1a — we handle CMYK separately to avoid NaN crashes
    });

    const vectorBuffer = await fs.readFile(vectorPath);
    console.log(`[${jobId}] Pass 1 complete: ${vectorBuffer.length} bytes (RGB vector)`);

    // ── PASS 2: Ghostscript CMYK conversion (only if requested) ──
    let finalPath = vectorPath;

    if (wantCmyk) {
      // Resolve ICC profile path
      const profileMap = {
        gracol: path.join(ICC_DIR, 'GRACoL2013_CRPC6.icc'),
        fogra39: path.join(ICC_DIR, 'ISOcoated_v2_eci.icc'),
      };
      const iccPath = profileMap[iccProfile] || profileMap.gracol;

      // Check ICC profile exists
      const iccExists = await fs.access(iccPath).then(() => true).catch(() => false);

      console.log(`[${jobId}] Pass 2: Ghostscript CMYK conversion (profile: ${iccProfile}, exists: ${iccExists})`);

      // Build Ghostscript command — preserves vectors, converts color space only
      const gsArgs = [
        'gs', '-q', '-dNOPAUSE', '-dBATCH', '-dSAFER',
        '-sDEVICE=pdfwrite',
        '-dColorConversionStrategy=/CMYK',
        '-dProcessColorModel=/DeviceCMYK',
        '-dPreserveHalftoneInfo=true',
        '-dPreserveOverprintSettings=true',
        // Do NOT use -dPDFSETTINGS=/prepress — it flattens transparency and rasterizes vectors
      ];

      if (iccExists) {
        gsArgs.push(`-sOutputICCProfile=${iccPath}`);
      }

      gsArgs.push(`-sOutputFile=${cmykPath}`, vectorPath);

      const gsCmd = gsArgs.join(' ');
      console.log(`[${jobId}] GS command: ${gsCmd}`);

      try {
        await execAsync(gsCmd);
        const cmykBuffer = await fs.readFile(cmykPath);
        console.log(`[${jobId}] Pass 2 complete: ${cmykBuffer.length} bytes (CMYK)`);
        finalPath = cmykPath;
      } catch (gsError) {
        console.error(`[${jobId}] Ghostscript CMYK conversion failed:`, gsError.message);
        console.warn(`[${jobId}] Falling back to RGB vector PDF`);
        // Fall back to the RGB vector — still a valid professional PDF, just not CMYK
      }
    }

    const finalBuffer = await fs.readFile(finalPath);

    console.log(`[${jobId}] Export complete: ${finalBuffer.length} bytes, ${scene.pages.length} pages in ${Date.now() - startTime}ms`);

    res.set('Content-Type', 'application/pdf');
    res.set('X-Render-Time-Ms', String(Date.now() - startTime));
    res.set('X-Page-Count', String(scene.pages.length));
    res.set('X-Color-Mode', finalPath === cmykPath ? 'cmyk' : 'rgb');
    res.send(finalBuffer);
  } catch (e) {
    console.error(`[${jobId}] Multi-page export error:`, e);
    res.status(500).json({ error: e.message, details: e.stack?.slice(0, 500) });
  } finally {
    fs.unlink(vectorPath).catch(() => {});
    fs.unlink(cmykPath).catch(() => {});
  }
});

// =============================================================================
// RENDER SINGLE VECTOR PDF (existing, updated to two-pass)
// =============================================================================
app.post('/render-vector', authenticate, async (req, res) => {
  const startTime = Date.now();
  const jobId = uuidv4();
  const vectorPath = path.join(TEMP_DIR, `${jobId}-vector.pdf`);
  const cmykPath = path.join(TEMP_DIR, `${jobId}-cmyk.pdf`);

  try {
    const { scene, options = {} } = req.body;

    if (!scene) {
      return res.status(400).json({ error: 'Scene is required' });
    }

    const wantCmyk = options.cmyk === true;

    console.log(`[${jobId}] Rendering vector PDF (CMYK: ${wantCmyk})`);

    // Pass 1: Polotno vector PDF (no pdfx1a)
    await jsonToPDF(scene, vectorPath, {
      title: options.title || 'Export',
      // NO pdfx1a
    });

    let finalPath = vectorPath;

    // Pass 2: Optional CMYK via Ghostscript
    if (wantCmyk) {
      try {
        await execAsync(`gs -q -dNOPAUSE -dBATCH -dSAFER -sDEVICE=pdfwrite -dColorConversionStrategy=/CMYK -dProcessColorModel=/DeviceCMYK -sOutputFile=${cmykPath} ${vectorPath}`);
        finalPath = cmykPath;
      } catch (gsError) {
        console.warn(`[${jobId}] CMYK conversion failed, using RGB:`, gsError.message);
      }
    }

    const pdfBuffer = await fs.readFile(finalPath);

    console.log(`[${jobId}] Complete: ${pdfBuffer.length} bytes in ${Date.now() - startTime}ms`);

    res.set('Content-Type', 'application/pdf');
    res.set('X-Render-Time-Ms', String(Date.now() - startTime));
    res.send(pdfBuffer);
  } catch (e) {
    console.error(`[${jobId}] Error:`, e);
    res.status(500).json({ error: e.message });
  } finally {
    fs.unlink(vectorPath).catch(() => {});
    fs.unlink(cmykPath).catch(() => {});
  }
});

// =============================================================================
// BATCH RENDER VECTOR PDFs (returns base64)
// =============================================================================
app.post('/batch-render-vector', authenticate, async (req, res) => {
  const startTime = Date.now();
  const { scenes, options = {} } = req.body;

  if (!Array.isArray(scenes) || scenes.length === 0) {
    return res.status(400).json({ error: 'Scenes array is required' });
  }

  console.log(`[batch] Rendering ${scenes.length} scenes`);

  const results = [];
  let successful = 0;

  for (let i = 0; i < scenes.length; i++) {
    const jobId = uuidv4();
    const outputPath = path.join(TEMP_DIR, `${jobId}.pdf`);

    try {
      await jsonToPDF(scenes[i], outputPath, {
        title: options.title || 'Export',
        // NO pdfx1a
      });

      const pdfBuffer = await fs.readFile(outputPath);
      const base64 = pdfBuffer.toString('base64');

      results.push({ index: i, success: true, pdf: base64 });
      successful++;
    } catch (e) {
      console.error(`[batch] Scene ${i} failed:`, e.message);
      results.push({ index: i, success: false, error: e.message });
    } finally {
      fs.unlink(outputPath).catch(() => {});
    }
  }

  console.log(`[batch] Complete: ${successful}/${scenes.length} in ${Date.now() - startTime}ms`);

  res.json({ total: scenes.length, successful, results });
});

// =============================================================================
// EXPORT LABELS WITH IMPOSITION (preserves vectors using qpdf)
// =============================================================================
app.post('/export-labels', authenticate, async (req, res) => {
  const startTime = Date.now();
  const jobId = uuidv4();
  const labelsPath = path.join(TEMP_DIR, `${jobId}-labels.pdf`);
  const outputPath = path.join(TEMP_DIR, `${jobId}-imposed.pdf`);

  try {
    const { scene, layout, options = {} } = req.body;

    if (!scene || !scene.pages) {
      return res.status(400).json({ error: 'Scene with pages is required' });
    }

    if (!layout) {
      return res.status(400).json({ error: 'Layout configuration is required' });
    }

    const labelCount = scene.pages.length;
    const bleedMm = Number.isFinite(options.bleed) ? options.bleed : 0;
    const dpi = scene.dpi || 300;
    const bleedPx = Math.round(bleedMm * (dpi / 25.4));

    console.log(`[${jobId}] Exporting ${labelCount} labels (bleed: ${bleedMm}mm)`);

    // Set bleed on each page
    if (bleedPx > 0) {
      for (const page of scene.pages) {
        page.bleed = bleedPx;
      }
    }

    // Step 1: Export all labels as a multi-page PDF (with native bleed)
    await jsonToPDF(scene, labelsPath, {
      title: options.title || 'Labels Export',
      includeBleed: bleedPx > 0,
      // NO pdfx1a
    });

    const labelsBuffer = await fs.readFile(labelsPath);
    console.log(`[${jobId}] Labels exported: ${labelsBuffer.length} bytes`);

    // Step 2: Impose labels onto sheets using qpdf
    const imposedBuffer = await imposeLabelsWithQpdf(labelsPath, layout, outputPath, jobId);

    console.log(`[${jobId}] Imposition complete: ${imposedBuffer.length} bytes in ${Date.now() - startTime}ms`);

    res.set('Content-Type', 'application/pdf');
    res.set('X-Render-Time-Ms', String(Date.now() - startTime));
    res.set('X-Label-Count', String(labelCount));
    res.send(imposedBuffer);
  } catch (e) {
    console.error(`[${jobId}] Label export error:`, e);
    res.status(500).json({ error: e.message });
  } finally {
    fs.unlink(labelsPath).catch(() => {});
    fs.unlink(outputPath).catch(() => {});
  }
});

// =============================================================================
// IMPOSITION HELPER
// =============================================================================
async function imposeLabelsWithQpdf(labelsPath, layout, outputPath, jobId) {
  // For now, return the labels PDF directly (full imposition TBD)
  const outputBuffer = await fs.readFile(labelsPath);
  await fs.writeFile(outputPath, outputBuffer);
  return outputBuffer;
}

// =============================================================================
// COMPOSE PDFs (merge multiple PDFs preserving vectors)
// =============================================================================
app.post('/compose-pdfs', authenticate, async (req, res) => {
  const startTime = Date.now();
  const jobId = uuidv4();
  const outputPath = path.join(TEMP_DIR, `${jobId}-composed.pdf`);
  const inputPaths = [];

  try {
    const { pdfs, options = {} } = req.body;

    if (!Array.isArray(pdfs) || pdfs.length === 0) {
      return res.status(400).json({ error: 'PDFs array (base64) is required' });
    }

    console.log(`[${jobId}] Composing ${pdfs.length} PDFs`);

    for (let i = 0; i < pdfs.length; i++) {
      const pdfPath = path.join(TEMP_DIR, `${jobId}-input-${i}.pdf`);
      const buffer = Buffer.from(pdfs[i], 'base64');
      await fs.writeFile(pdfPath, buffer);
      inputPaths.push(pdfPath);
    }

    const inputArgs = inputPaths.map(p => `"${p}"`).join(' ');
    await execAsync(`qpdf --empty --pages ${inputArgs} -- "${outputPath}"`);

    const outputBuffer = await fs.readFile(outputPath);

    console.log(`[${jobId}] Composition complete: ${outputBuffer.length} bytes in ${Date.now() - startTime}ms`);

    res.set('Content-Type', 'application/pdf');
    res.set('X-Compose-Time-Ms', String(Date.now() - startTime));
    res.set('X-Page-Count', String(pdfs.length));
    res.send(outputBuffer);
  } catch (e) {
    console.error(`[${jobId}] Composition error:`, e);
    res.status(500).json({ error: e.message });
  } finally {
    for (const p of inputPaths) {
      fs.unlink(p).catch(() => {});
    }
    fs.unlink(outputPath).catch(() => {});
  }
});

// =============================================================================
// LEGACY ENDPOINTS (kept for backward compatibility)
// =============================================================================
app.post('/render', authenticate, async (req, res) => {
  req.url = '/render-vector';
  return app._router.handle(req, res);
});

app.post('/batch-render', authenticate, async (req, res) => {
  req.url = '/batch-render-vector';
  return app._router.handle(req, res);
});

// =============================================================================
// START SERVER
// =============================================================================
app.listen(PORT, () => {
  console.log(`PDF Export Service running on port ${PORT}`);
  console.log(`Pipeline: Two-pass (Polotno RGB → Ghostscript CMYK)`);
  console.log(`Endpoints: /health, /render-vector, /batch-render-vector, /export-multipage, /export-labels, /compose-pdfs`);
});
