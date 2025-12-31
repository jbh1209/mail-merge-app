import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const polotnoApiKey = Deno.env.get('VITE_POLOTNO_API_KEY');
    
    if (!polotnoApiKey) {
      console.error('[GET-POLOTNO-KEY] API key not configured');
      return new Response(
        JSON.stringify({ error: 'Polotno API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[GET-POLOTNO-KEY] Returning API key');
    
    return new Response(
      JSON.stringify({ apiKey: polotnoApiKey }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[GET-POLOTNO-KEY] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
