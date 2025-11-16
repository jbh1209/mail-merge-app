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
    const { columns, preview, rowCount, workspaceId } = await req.json();
    
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

    // Determine target workspace and verify membership when workspaceId is provided
    console.log('AI clean request - user:', user.id, 'requested workspaceId:', workspaceId);

    let targetWorkspaceId: string | null = workspaceId ?? null;

    if (targetWorkspaceId) {
      const { data: membership, error: membershipError } = await supabaseClient
        .from('user_roles')
        .select('workspace_id')
        .eq('user_id', user.id)
        .eq('workspace_id', targetWorkspaceId)
        .maybeSingle();

      if (membershipError) {
        console.error('Membership check error:', membershipError);
        return new Response(
          JSON.stringify({ error: 'Failed to verify workspace membership' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!membership) {
        console.warn('User not a member of requested workspace');
        return new Response(
          JSON.stringify({ error: 'Forbidden - not a member of this workspace' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      // Fallback to user's profile workspace when none is provided
      const { data: profile } = await supabaseClient
        .from('profiles')
        .select('workspace_id')
        .eq('id', user.id)
        .maybeSingle();

      if (!profile?.workspace_id) {
        return new Response(
          JSON.stringify({ error: 'No workspace found' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      targetWorkspaceId = profile.workspace_id;
    }

    // Get target workspace subscription tier
    const { data: workspace, error: workspaceError } = await supabaseClient
      .from('workspaces')
      .select('subscription_tier')
      .eq('id', targetWorkspaceId as string)
      .single();

    if (workspaceError) {
      console.error('Workspace fetch error:', workspaceError);
      return new Response(
        JSON.stringify({ error: 'Failed to load workspace' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user has access to AI cleaning (not starter tier)
    if (workspace?.subscription_tier === 'starter') {
      console.warn('Plan restriction - starter tier for workspace', targetWorkspaceId);
      return new Response(
        JSON.stringify({ error: 'AI data cleaning requires Pro or Business plan', code: 'PLAN_REQUIRED' }),
        { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('Cleaning data with AI:', { columnCount: columns.length, rowCount });

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const prompt = `You are a data cleaning assistant specializing in detecting parsing errors and data quality issues. Analyze this data carefully for structural problems.

Data has ${rowCount} total rows. Here are the first ${preview.length} rows for analysis:

Columns: ${columns.join(', ')}

Sample data:
${JSON.stringify(preview, null, 2)}

CRITICAL ANALYSIS REQUIREMENTS:

1. **PARSING ARTIFACT DETECTION** - Look for signs that data was incorrectly split:
   - Values that look like fragments (e.g., "123 Main" in one column, "Street" in next)
   - Numeric-only values in text columns that should be part of addresses
   - Street names without numbers or vice versa
   - Column values that appear to be the second half of the previous column

2. **COLUMN MISALIGNMENT** - Validate data types match columns:
   - Check if "address" columns contain actual complete addresses (should have street numbers, street names, and ideally city/postal)
   - Check if numeric columns contain only numbers
   - Check if date columns contain valid dates
   - Check if email/phone columns contain valid formats

3. **COMMA-RELATED PARSING ERRORS** - Specifically check:
   - Addresses that should contain commas but were split across multiple columns
   - Business names with commas incorrectly split
   - Any field that looks like it was cut off mid-value

4. **CROSS-COLUMN VALIDATION**:
   - If there's a "store_name" and "address", verify the address is complete
   - Check for patterns like: column has "Street" but previous column has number - likely merged
   - Look for values that make no sense in their column context

5. **DATA COMPLETENESS**:
   - Missing values
   - Unusually short values in columns that should have longer text
   - Duplicate patterns that suggest parsing errors

Provide a JSON response with this structure:
{
  "columnMappings": [
    {
      "original": "original_column_name",
      "suggested": "clean_snake_case_name",
      "dataType": "text|email|phone|date|number|address|url|boolean",
      "confidence": 0.95
    }
  ],
  "qualityIssues": [
    "CRITICAL: Address column contains fragments - data appears incorrectly split (found '123 Main' without street type)",
    "WARNING: Column 5 contains street names that should be part of addresses",
    "ERROR: 15 rows have misaligned data across columns"
  ],
  "suggestions": [
    "Re-upload the source file - current data shows parsing errors",
    "If using CSV, ensure addresses with commas are properly quoted",
    "Consider using Excel format to avoid comma-related parsing issues"
  ]
}

Be VERY critical and flag any suspicious patterns. If data looks incorrectly split, say so explicitly with examples.`;

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
        console.error('AI API rate limit hit');
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.', code: 'RATE_LIMITED' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (aiResponse.status === 402) {
        const errorText = await aiResponse.text();
        console.error('AI credits depleted:', errorText);
        return new Response(
          JSON.stringify({ error: 'AI credits depleted. Please add credits to continue.', code: 'AI_CREDITS_EXHAUSTED' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to analyze data with AI' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
