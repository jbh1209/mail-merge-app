import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) throw new Error('No authorization header');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { fieldNames, sampleData, templateSize, templateType } = await req.json();

    console.log('🎨 Hybrid Layout Generation Started', {
      fields: fieldNames?.length,
      template: `${templateSize?.width}mm × ${templateSize?.height}mm`,
      type: templateType
    });

    // Phase 1: Get design strategy from AI
    console.log('Phase 1: Calling design-with-ai for high-level strategy...');
    const { data: designData, error: designError } = await supabase.functions.invoke(
      'design-with-ai',
      {
        body: { fieldNames, sampleData, templateSize }
      }
    );

    if (designError) {
      console.error('Design AI error:', designError);
      throw new Error(`Failed to generate design strategy: ${designError.message}`);
    }

    const { designStrategy } = designData;
    console.log('✓ Design strategy received:', designStrategy.strategy);

    // Phase 2: Execute with rules engine (client-side)
    // We return the design strategy and let the client execute it
    // This is because the layout engine uses Canvas API which needs DOM
    
    return new Response(
      JSON.stringify({
        designStrategy,
        metadata: {
          generatedAt: new Date().toISOString(),
          approach: 'hybrid_ai_rules',
          aiModel: 'google/gemini-2.5-flash'
        }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Error in generate-layout:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        details: error instanceof Error ? error.stack : undefined
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
