import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Persona configurations
const PERSONA_CONFIGS: Record<string, any> = {
  'data-assistant': {
    maxTokens: 500,
    temperature: 0.5,
    requiresAuth: true,
    requiresPaidTier: true
  },
  'layout-assistant': {
    maxTokens: 600,
    temperature: 0.6,
    requiresAuth: true,
    requiresPaidTier: true
  }
};

function generateSystemPrompt(persona: string, context: any): string {
  if (persona === 'data-assistant') {
    return `You are a Data Assistant specialized ONLY in:
- Data quality validation and cleaning
- Column naming and formatting best practices
- Field mapping: matching data columns to template fields
- Handling missing values, duplicates, and data inconsistencies
- CSV/Excel import troubleshooting
- Data type detection and conversion
- Data transformation advice

DATA CONTEXT:
${context.fileName ? `- File: ${context.fileName}` : ''}
${context.rowCount ? `- Rows: ${context.rowCount}` : ''}
${context.columns ? `- Columns: ${context.columns.join(', ')}` : ''}
${context.qualityIssues?.length > 0 ? `- Quality Issues: ${context.qualityIssues.join('; ')}` : ''}
${context.dataColumns ? `- Available Data Columns: ${context.dataColumns.join(', ')}` : ''}
${context.templateFields ? `- Template Fields: ${context.templateFields.join(', ')}` : ''}
${context.currentMappings ? `- Current Mappings: ${JSON.stringify(context.currentMappings)}` : ''}
${context.sampleData ? `- Sample Data: ${JSON.stringify(context.sampleData.slice(0, 2))}` : ''}

CONSTRAINTS:
1. ONLY answer questions about data quality, cleaning, and field mapping
2. If asked about templates, design, or layout, respond: "That's outside my area. I specialize in data quality and mapping. For layout questions, please use the Layout Assistant."
3. Keep responses concise (2-3 paragraphs max)
4. Provide specific, actionable recommendations
5. Reference the user's actual data when possible

Stay focused on data. You're a specialist, not a generalist.`;
  }

  if (persona === 'layout-assistant') {
    return `You are a Layout Assistant specialized ONLY in:
- Template selection and recommendations
- Text placeholder configuration and positioning
- Font size and typography recommendations
- Layout best practices for labels, certificates, cards
- Spacing, margins, and alignment
- Print-ready design considerations
- Visual hierarchy

LAYOUT CONTEXT:
${context.projectType ? `- Project Type: ${context.projectType}` : ''}
${context.templateName ? `- Template: ${context.templateName}` : ''}
${context.width_mm && context.height_mm ? `- Size: ${context.width_mm}mm × ${context.height_mm}mm` : ''}
${context.labelsPerSheet ? `- Labels Per Sheet: ${context.labelsPerSheet}` : ''}
${context.category ? `- Category: ${context.category}` : ''}

CONSTRAINTS:
1. ONLY answer questions about template design, layout, and placeholder configuration
2. If asked about data, mapping, or quality, redirect: "That's outside my specialty. For data questions, please use the Data Assistant."
3. Focus on practical design and layout advice
4. Consider print requirements (margins, bleed, resolution)
5. Provide specific font sizes and spacing recommendations
6. Keep responses actionable and concise

You're a layout specialist. Help users create beautiful, print-ready designs.`;
  }

  return 'You are a helpful assistant.';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      persona,
      message, 
      chatHistory, 
      context 
    } = await req.json();

    const personaConfig = PERSONA_CONFIGS[persona];
    if (!personaConfig) {
      return new Response(
        JSON.stringify({ error: 'Invalid persona specified' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Auth check
    if (personaConfig.requiresAuth) {
      const authHeader = req.headers.get('authorization');
      if (!authHeader) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: authHeader } } }
      );

      const { data: { user } } = await supabaseClient.auth.getUser();
      if (!user) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Tier check
      if (personaConfig.requiresPaidTier) {
        const { data: profile } = await supabaseClient
          .from('profiles')
          .select('workspace_id')
          .eq('id', user.id)
          .single();

        if (!profile?.workspace_id) {
          return new Response(
            JSON.stringify({ error: 'No workspace found' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: workspace } = await supabaseClient
          .from('workspaces')
          .select('subscription_tier')
          .eq('id', profile.workspace_id)
          .single();

        if (workspace?.subscription_tier === 'starter') {
          return new Response(
            JSON.stringify({ error: 'AI assistants require Pro or Business plan' }),
            { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Generate persona-specific system prompt
    const systemPrompt = generateSystemPrompt(persona, context);

    // Build conversation
    const messages = [
      { role: 'system', content: systemPrompt },
      ...chatHistory.map((msg: any) => ({
        role: msg.role,
        content: msg.content
      })),
      { role: 'user', content: message }
    ];

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: messages,
        temperature: personaConfig.temperature,
        max_tokens: personaConfig.maxTokens,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API Error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits depleted. Please add credits to continue.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`AI API failed: ${aiResponse.status}`);
    }

    const data = await aiResponse.json();
    const assistantMessage = data.choices[0].message.content;

    return new Response(
      JSON.stringify({ 
        message: assistantMessage,
        persona: persona,
        isScoped: true
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in scoped-ai-assistant:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
