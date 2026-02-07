import { corsHeaders } from '../_shared/cors.ts';

const SERVICE_URL = Deno.env.get('VITE_PDF_EXPORT_SERVICE_URL');
const API_SECRET = Deno.env.get('VITE_PDF_EXPORT_API_SECRET');

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.split('/').pop(); // Get last segment: health, render, or batch-render

  // Check configuration
  if (!SERVICE_URL || !API_SECRET) {
    console.error('[render-vector-pdf] Service not configured');
    return new Response(
      JSON.stringify({ error: 'Vector PDF service not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Health check endpoint
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
          console.log('[render-vector-pdf] VPS is healthy');
          return new Response(
            JSON.stringify({ status: 'ok', service: 'available' }),
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

    // Render single PDF endpoint
    if (path === 'render') {
      console.log('[render-vector-pdf] Render request');
      
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

      // Return PDF bytes
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

    // Batch render endpoint
    if (path === 'batch-render') {
      console.log('[render-vector-pdf] Batch render request');
      
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

      // Return JSON response with base64 PDFs
      const result = await vpsResponse.json();
      console.log('[render-vector-pdf] Batch render successful:', result.successful, '/', result.total);
      
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Unknown endpoint
    return new Response(
      JSON.stringify({ error: 'Unknown endpoint. Use /health, /render, or /batch-render' }),
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
