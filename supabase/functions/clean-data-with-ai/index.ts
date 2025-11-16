import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { columns, preview, rowCount } = await req.json();
    
    // Get auth header to check subscription
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check subscription tier
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

    // Get user's workspace and subscription
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

    // Check if user has access to AI cleaning (not starter tier)
    if (workspace?.subscription_tier === 'starter') {
      return new Response(
        JSON.stringify({ error: 'AI data cleaning requires Pro or Business plan' }),
        { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('Cleaning data with AI:', { columnCount: columns.length, rowCount });

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const prompt = `You are a data cleaning assistant. Analyze this data and provide structured recommendations.

Data has ${rowCount} total rows. Here are the first ${preview.length} rows for analysis:

Columns: ${columns.join(', ')}

Sample data:
${JSON.stringify(preview, null, 2)}

Provide a JSON response with the following structure:
{
  "columnMappings": [
    {
      "original": "original_column_name",
      "suggested": "clean_snake_case_name",
      "dataType": "text|email|phone|date|number|address|url|boolean",
      "confidence": 0.95
    }
  ],
  "qualityIssues": ["List of data quality issues found"],
  "suggestions": ["List of improvement suggestions"]
}

Focus on:
1. Clean, descriptive column names in snake_case
2. Accurate data type detection
3. Identifying missing values, formatting issues, duplicates
4. Practical suggestions for data improvement`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'You are a data cleaning expert. Always respond with valid JSON only, no markdown formatting.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        throw new Error('Rate limit exceeded. Please try again in a moment.');
      }
      if (aiResponse.status === 402) {
        throw new Error('AI credits depleted. Please add credits to continue.');
      }
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      throw new Error('Failed to analyze data with AI');
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No response from AI');
    }

    // Parse AI response (remove markdown if present)
    let cleanedContent = content.trim();
    if (cleanedContent.startsWith('```json')) {
      cleanedContent = cleanedContent.replace(/```json\n?/, '').replace(/\n?```$/, '');
    } else if (cleanedContent.startsWith('```')) {
      cleanedContent = cleanedContent.replace(/```\n?/, '').replace(/\n?```$/, '');
    }

    const analysis = JSON.parse(cleanedContent);

    console.log('AI analysis complete:', {
      mappingsCount: analysis.columnMappings?.length,
      issuesCount: analysis.qualityIssues?.length,
    });

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('AI cleaning error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error analyzing data' 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
