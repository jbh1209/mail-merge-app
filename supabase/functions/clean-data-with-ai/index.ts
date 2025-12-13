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
    const { columns, preview, rowCount, workspaceId, emptyColumnsRemoved } = await req.json();
    
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
      .select('subscription_tier, subscription_status, trial_end_date')
      .eq('id', targetWorkspaceId as string)
      .single();

    if (workspaceError) {
      console.error('Workspace fetch error:', workspaceError);
      return new Response(
        JSON.stringify({ error: 'Failed to load workspace' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user has access to AI cleaning (Pro/Business OR trialing)
    console.log('Workspace details:', {
      tier: workspace?.subscription_tier,
      status: workspace?.subscription_status,
      trial_end: workspace?.trial_end_date
    });

    const isTrialing = workspace?.subscription_status === 'trialing' && 
                       workspace?.trial_end_date && 
                       new Date(workspace.trial_end_date) > new Date();
    const allowAICleaning = workspace?.subscription_tier !== 'starter' || isTrialing;

    if (!allowAICleaning) {
      console.warn('Plan restriction - starter tier without active trial for workspace', targetWorkspaceId);
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

    // Construct AI prompt for data analysis with pre-filtering context
    let autoFilterInfo = '';
    if (emptyColumnsRemoved && emptyColumnsRemoved > 0) {
      autoFilterInfo = `\n\nNote: ${emptyColumnsRemoved} entirely empty column(s) were automatically filtered out before this analysis.`;
    }

    const prompt = `You are a data quality analyst helping a non-technical user prepare data for a mail merge. Analyze this dataset and focus ONLY on actionable issues that require user attention.${autoFilterInfo}

Dataset Overview:
- Total Rows: ${rowCount}
- Columns: ${columns.join(', ')}

Sample Data (first ${preview.length} rows):
${JSON.stringify(preview, null, 2)}

IMPORTANT GUIDELINES:
- Focus on DATA INTEGRITY issues that could affect mail merge output
- Don't report issues we've already auto-handled (like empty columns)
- Prioritize issues by severity: CRITICAL (must fix), WARNING (review recommended), INFO (FYI only)
- Be concise and user-friendly in your descriptions

Look for:
1. Column naming issues that make data hard to understand
2. Data type mismatches that could cause merge errors (e.g., numbers stored as text)
3. Missing critical values in key fields
4. Inconsistent formatting (mixed date formats, inconsistent capitalization)
5. Duplicate or very similar column names
6. **IMPORTANT**: Columns containing MULTIPLE VALUES separated by commas, newlines, or other delimiters that should be SPLIT into separate columns
   - Examples: "John Smith, Manager, Acme Corp" contains Name, Job Title, and Company
   - Look for patterns where each cell contains the same NUMBER of delimited values
   - This is common in name badge data, contact lists, etc.

For EACH column, suggest:
- A clearer name if needed (use clear, readable names - not necessarily snake_case)
- The appropriate data type (text, number, date, boolean)
- A confidence score (0-100) for your suggestion

For quality issues, prefix each with severity:
- "CRITICAL: " for issues that will break the merge
- "WARNING: " for issues that should be reviewed
- "INFO: " for minor observations

**CRITICAL: Detect multi-value columns!**
If a column contains multiple values separated by commas or other delimiters (e.g., "Name, Job Title, Company"), add it to the "splitSuggestions" array. Analyze the PATTERN of values across multiple rows to determine what each value represents.

Respond in this EXACT JSON format:
{
  "columnMappings": [
    {
      "original": "column name",
      "suggested": "Clear Column Name",
      "dataType": "text|number|date|boolean",
      "confidence": 95
    }
  ],
  "qualityIssues": [
    "CRITICAL: Description of critical issue",
    "WARNING: Description of warning",
    "INFO: Minor observation"
  ],
  "suggestions": [
    "Clear, actionable suggestion for the user"
  ],
  "splitSuggestions": [
    {
      "column": "original column name that needs splitting",
      "delimiter": ",",
      "splitInto": ["First Name", "Last Name", "Job Title", "Company"],
      "confidence": 90,
      "reason": "Each row contains 4 comma-separated values representing person and role data"
    }
  ]
}`;

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
