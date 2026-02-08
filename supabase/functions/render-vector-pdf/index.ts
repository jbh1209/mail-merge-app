import { corsHeaders } from '../_shared/cors.ts';

const SERVICE_URL = Deno.env.get('PDF_EXPORT_SERVICE_URL');
const API_SECRET = Deno.env.get('PDF_EXPORT_API_SECRET');

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.split('/').pop(); // Get last segment

  // Check configuration
  if (!SERVICE_URL || !API_SECRET) {
    console.error('[render-vector-pdf] Service not configured');
    return new Response(
      JSON.stringify({ error: 'Vector PDF service not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // ==========================================================================
    // EXPORT MULTI-PAGE (New primary endpoint for full-page exports)
    // ==========================================================================
    if (path === 'export-multipage') {
      console.log('[render-vector-pdf] Multi-page export request');
      
      const body = await req.json();
      
      const vpsResponse = await fetch(`${SERVICE_URL}/export-multipage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_SECRET,
        },
        body: JSON.stringify(body),
      });

      if (!vpsResponse.ok) {
        const errorText = await vpsResponse.text();
        console.error('[render-vector-pdf] VPS export-multipage failed:', vpsResponse.status, errorText);
        return new Response(
          JSON.stringify({ error: `VPS error: ${vpsResponse.status}`, details: errorText }),
          { status: vpsResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const pdfBuffer = await vpsResponse.arrayBuffer();
      const pageCount = vpsResponse.headers.get('X-Page-Count') || 'unknown';
      const renderTime = vpsResponse.headers.get('X-Render-Time-Ms') || 'unknown';
      
      console.log(`[render-vector-pdf] Multi-page export successful: ${pdfBuffer.byteLength} bytes, ${pageCount} pages in ${renderTime}ms`);
      
      return new Response(pdfBuffer, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/pdf',
          'Content-Length': pdfBuffer.byteLength.toString(),
          'X-Page-Count': pageCount,
          'X-Render-Time-Ms': renderTime,
        },
      });
    }

    // ==========================================================================
    // EXPORT LABELS (New endpoint for label imposition)
    // ==========================================================================
    if (path === 'export-labels') {
      console.log('[render-vector-pdf] Label export request');
      
      const body = await req.json();
      
      const vpsResponse = await fetch(`${SERVICE_URL}/export-labels`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_SECRET,
        },
        body: JSON.stringify(body),
      });

      if (!vpsResponse.ok) {
        const errorText = await vpsResponse.text();
        console.error('[render-vector-pdf] VPS export-labels failed:', vpsResponse.status, errorText);
        return new Response(
          JSON.stringify({ error: `VPS error: ${vpsResponse.status}`, details: errorText }),
          { status: vpsResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const pdfBuffer = await vpsResponse.arrayBuffer();
      const labelCount = vpsResponse.headers.get('X-Label-Count') || 'unknown';
      const renderTime = vpsResponse.headers.get('X-Render-Time-Ms') || 'unknown';
      
      console.log(`[render-vector-pdf] Label export successful: ${pdfBuffer.byteLength} bytes, ${labelCount} labels in ${renderTime}ms`);
      
      return new Response(pdfBuffer, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/pdf',
          'Content-Length': pdfBuffer.byteLength.toString(),
          'X-Label-Count': labelCount,
          'X-Render-Time-Ms': renderTime,
        },
      });
    }

    // ==========================================================================
    // COMPOSE PDFs (Merge multiple PDFs preserving vectors)
    // ==========================================================================
    if (path === 'compose-pdfs') {
      console.log('[render-vector-pdf] Compose PDFs request');
      
      const body = await req.json();
      
      const vpsResponse = await fetch(`${SERVICE_URL}/compose-pdfs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_SECRET,
        },
        body: JSON.stringify(body),
      });

      if (!vpsResponse.ok) {
        const errorText = await vpsResponse.text();
        console.error('[render-vector-pdf] VPS compose-pdfs failed:', vpsResponse.status, errorText);
        return new Response(
          JSON.stringify({ error: `VPS error: ${vpsResponse.status}`, details: errorText }),
          { status: vpsResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const pdfBuffer = await vpsResponse.arrayBuffer();
      const composeTime = vpsResponse.headers.get('X-Compose-Time-Ms') || 'unknown';
      const pageCount = vpsResponse.headers.get('X-Page-Count') || 'unknown';
      
      console.log(`[render-vector-pdf] Compose successful: ${pdfBuffer.byteLength} bytes, ${pageCount} pages in ${composeTime}ms`);
      
      return new Response(pdfBuffer, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/pdf',
          'Content-Length': pdfBuffer.byteLength.toString(),
          'X-Page-Count': pageCount,
          'X-Compose-Time-Ms': composeTime,
        },
      });
    }

    // ==========================================================================
    // RENDER VECTOR (Primary endpoint - uses @polotno/pdf-export on VPS)
    // ==========================================================================
    if (path === 'render-vector') {
      console.log('[render-vector-pdf] Vector render request');
      
      const body = await req.json();
      
      const vpsResponse = await fetch(`${SERVICE_URL}/render-vector`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_SECRET,
        },
        body: JSON.stringify(body),
      });

      if (!vpsResponse.ok) {
        const errorText = await vpsResponse.text();
        console.error('[render-vector-pdf] VPS render-vector failed:', vpsResponse.status, errorText);
        return new Response(
          JSON.stringify({ error: `VPS error: ${vpsResponse.status}`, details: errorText }),
          { status: vpsResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const pdfBuffer = await vpsResponse.arrayBuffer();
      console.log('[render-vector-pdf] Vector render successful, returning', pdfBuffer.byteLength, 'bytes');
      
      return new Response(pdfBuffer, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/pdf',
          'Content-Length': pdfBuffer.byteLength.toString(),
        },
      });
    }

    // ==========================================================================
    // BATCH RENDER VECTOR (Multiple scenes → base64 PDFs)
    // ==========================================================================
    if (path === 'batch-render-vector') {
      console.log('[render-vector-pdf] Batch vector render request');
      
      const body = await req.json();
      
      const vpsResponse = await fetch(`${SERVICE_URL}/batch-render-vector`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_SECRET,
        },
        body: JSON.stringify(body),
      });

      if (!vpsResponse.ok) {
        const errorText = await vpsResponse.text();
        console.error('[render-vector-pdf] VPS batch-render-vector failed:', vpsResponse.status, errorText);
        return new Response(
          JSON.stringify({ error: `VPS error: ${vpsResponse.status}`, details: errorText }),
          { status: vpsResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const result = await vpsResponse.json();
      console.log('[render-vector-pdf] Batch vector render successful:', result.successful, '/', result.total);
      
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ==========================================================================
    // HEALTH CHECK
    // ==========================================================================
    if (path === 'health') {
      console.log('[render-vector-pdf] Health check request');
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      try {
        const vpsResponse = await fetch(`${SERVICE_URL}/health`, {
          method: 'GET',
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        
        if (vpsResponse.ok) {
          const healthData = await vpsResponse.json();
          console.log('[render-vector-pdf] VPS is healthy:', healthData);
          return new Response(
            JSON.stringify({ status: 'ok', service: 'available', ...healthData }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        console.warn('[render-vector-pdf] VPS health check failed:', vpsResponse.status);
        return new Response(
          JSON.stringify({ status: 'error', service: 'unavailable' }),
          { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (error) {
        clearTimeout(timeoutId);
        console.error('[render-vector-pdf] VPS unreachable:', error);
        return new Response(
          JSON.stringify({ status: 'error', service: 'unreachable' }),
          { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ==========================================================================
    // CMYK CONVERSION (Standalone endpoint)
    // ==========================================================================
    if (path === 'convert-cmyk') {
      console.log('[render-vector-pdf] CMYK conversion request');
      
      // Get profile from query params (default: gracol)
      const profile = url.searchParams.get('profile') || 'gracol';
      
      // Read raw PDF bytes from request
      const pdfBytes = await req.arrayBuffer();
      
      if (!pdfBytes || pdfBytes.byteLength === 0) {
        return new Response(
          JSON.stringify({ error: 'No PDF data provided' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      console.log(`[render-vector-pdf] Forwarding ${pdfBytes.byteLength} bytes for CMYK conversion (profile: ${profile})`);
      
      const vpsResponse = await fetch(`${SERVICE_URL}/convert-cmyk?profile=${profile}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/pdf',
          'x-api-key': API_SECRET,
        },
        body: pdfBytes,
      });

      if (!vpsResponse.ok) {
        const errorText = await vpsResponse.text();
        console.error('[render-vector-pdf] VPS CMYK conversion failed:', vpsResponse.status, errorText);
        return new Response(
          JSON.stringify({ error: `VPS error: ${vpsResponse.status}`, details: errorText }),
          { status: vpsResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Return CMYK PDF bytes
      const cmykPdfBuffer = await vpsResponse.arrayBuffer();
      const conversionTime = vpsResponse.headers.get('X-Conversion-Time-Ms') || 'unknown';
      
      console.log(`[render-vector-pdf] CMYK conversion successful: ${cmykPdfBuffer.byteLength} bytes in ${conversionTime}ms`);
      
      return new Response(cmykPdfBuffer, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/pdf',
          'Content-Length': cmykPdfBuffer.byteLength.toString(),
          'X-Conversion-Time-Ms': conversionTime,
        },
      });
    }

    // ==========================================================================
    // BATCH CMYK CONVERSION
    // ==========================================================================
    if (path === 'batch-convert-cmyk') {
      console.log('[render-vector-pdf] Batch CMYK conversion request');
      
      const body = await req.json();
      
      const vpsResponse = await fetch(`${SERVICE_URL}/batch-convert-cmyk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_SECRET,
        },
        body: JSON.stringify(body),
      });

      if (!vpsResponse.ok) {
        const errorText = await vpsResponse.text();
        console.error('[render-vector-pdf] VPS batch CMYK conversion failed:', vpsResponse.status, errorText);
        return new Response(
          JSON.stringify({ error: `VPS error: ${vpsResponse.status}`, details: errorText }),
          { status: vpsResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const result = await vpsResponse.json();
      console.log(`[render-vector-pdf] Batch CMYK conversion successful: ${result.results?.filter((r: any) => r.success).length}/${result.results?.length}`);
      
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ==========================================================================
    // LEGACY: Render single PDF (kept for backward compatibility)
    // ==========================================================================
    if (path === 'render') {
      console.log('[render-vector-pdf] Legacy render request');
      
      const body = await req.json();
      
      const vpsResponse = await fetch(`${SERVICE_URL}/render`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_SECRET,
        },
        body: JSON.stringify(body),
      });

      if (!vpsResponse.ok) {
        const errorText = await vpsResponse.text();
        console.error('[render-vector-pdf] VPS render failed:', vpsResponse.status, errorText);
        return new Response(
          JSON.stringify({ error: `VPS error: ${vpsResponse.status}`, details: errorText }),
          { status: vpsResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const pdfBuffer = await vpsResponse.arrayBuffer();
      console.log('[render-vector-pdf] Render successful, returning', pdfBuffer.byteLength, 'bytes');
      
      return new Response(pdfBuffer, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/pdf',
          'Content-Length': pdfBuffer.byteLength.toString(),
        },
      });
    }

    // ==========================================================================
    // LEGACY: Batch render (kept for backward compatibility)
    // ==========================================================================
    if (path === 'batch-render') {
      console.log('[render-vector-pdf] Legacy batch render request');
      
      const body = await req.json();
      
      const vpsResponse = await fetch(`${SERVICE_URL}/batch-render`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_SECRET,
        },
        body: JSON.stringify(body),
      });

      if (!vpsResponse.ok) {
        const errorText = await vpsResponse.text();
        console.error('[render-vector-pdf] VPS batch render failed:', vpsResponse.status, errorText);
        return new Response(
          JSON.stringify({ error: `VPS error: ${vpsResponse.status}`, details: errorText }),
          { status: vpsResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const result = await vpsResponse.json();
      console.log('[render-vector-pdf] Batch render successful:', result.successful, '/', result.total);
      
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Unknown endpoint
    return new Response(
      JSON.stringify({ 
        error: 'Unknown endpoint', 
        available: ['/health', '/export-multipage', '/export-labels', '/compose-pdfs', '/render-vector', '/batch-render-vector', '/convert-cmyk'] 
      }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[render-vector-pdf] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
