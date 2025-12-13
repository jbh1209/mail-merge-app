import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SplitRequest {
  column: string;
  delimiter: string;
  splitInto: string[];
  rows: Record<string, any>[];
  columns: string[];
  workspaceId: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { column, delimiter, splitInto, rows, columns, workspaceId }: SplitRequest = await req.json();

    console.log('Split Column AI request:', {
      column,
      delimiter,
      targetColumns: splitInto,
      rowCount: rows.length
    });

    // Verify user authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check workspace subscription
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('subscription_tier, subscription_status, trial_end_date')
      .eq('id', workspaceId)
      .single();

    if (!workspace) {
      return new Response(JSON.stringify({ error: 'Workspace not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const isTrialing = workspace.subscription_status === 'trialing' &&
      workspace.trial_end_date &&
      new Date(workspace.trial_end_date) > new Date();
    const canUseAI = workspace.subscription_tier !== 'starter' || isTrialing;

    if (!canUseAI) {
      return new Response(JSON.stringify({
        error: 'AI data splitting requires Pro or Business plan',
        code: 'PLAN_REQUIRED'
      }), {
        status: 402,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extract sample data for AI analysis
    const sampleRows = rows.slice(0, 10);
    const sampleValues = sampleRows.map(row => row[column]).filter(Boolean);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Build AI prompt
    const prompt = `You are a data parsing expert. Split a column containing multiple delimited values into separate columns.

**COLUMN TO SPLIT:** "${column}"
**DELIMITER:** "${delimiter}"
**TARGET COLUMNS:** ${JSON.stringify(splitInto)}

**SAMPLE VALUES (first 10 rows):**
${sampleValues.map((v, i) => `Row ${i + 1}: "${v}"`).join('\n')}

**FULL DATA TO PARSE:** ${rows.length} rows
${JSON.stringify(rows.map(r => r[column]))}

**YOUR TASK:**
1. Parse each value by the delimiter "${delimiter}"
2. Map each part to the target columns: ${splitInto.join(', ')}
3. Handle edge cases:
   - Missing values (use null)
   - Extra values (append to last column or ignore)
   - Whitespace trimming
   - Inconsistent delimiters

**OUTPUT FORMAT (JSON):**
{
  "success": true,
  "parsedRows": [
    { "${splitInto[0]}": "value1", "${splitInto[1]}": "value2", ... },
    ...
  ],
  "warnings": ["Any issues encountered"],
  "confidence": 95
}

Parse ALL ${rows.length} rows now:`;

    console.log('Calling Lovable AI for column splitting...');

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'You are a data parsing expert. Always return valid JSON. Parse delimited values accurately.'
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);

      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({
          error: 'Rate limit exceeded. Please try again in a moment.',
          code: 'RATE_LIMITED'
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({
          error: 'AI credits depleted. Please add credits to your workspace.',
          code: 'AI_CREDITS_EXHAUSTED'
        }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    let parseResult;

    try {
      const rawContent = aiData.choices[0].message.content;
      console.log('AI response length:', rawContent.length);

      // Remove markdown code blocks if present
      const cleanContent = rawContent
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      parseResult = JSON.parse(cleanContent);

      if (!parseResult.success || !parseResult.parsedRows) {
        throw new Error('Invalid AI response format');
      }

      console.log('Successfully parsed column:', {
        originalColumn: column,
        newColumns: splitInto.length,
        parsedRows: parseResult.parsedRows.length,
        confidence: parseResult.confidence
      });

    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);

      // Fallback: simple delimiter split
      console.log('Using fallback delimiter split...');
      const parsedRows = rows.map(row => {
        const value = row[column] || '';
        const parts = value.split(delimiter).map((p: string) => p.trim());
        const result: Record<string, string | null> = {};
        splitInto.forEach((col, idx) => {
          result[col] = parts[idx] || null;
        });
        return result;
      });

      parseResult = {
        success: true,
        parsedRows,
        warnings: ['Used simple delimiter split as fallback'],
        confidence: 70
      };
    }

    // Merge parsed columns with original data (excluding the split column)
    const newColumns = columns.filter(c => c !== column).concat(splitInto);
    const mergedRows = rows.map((row, idx) => {
      const newRow: Record<string, any> = {};
      // Copy all columns except the one being split
      columns.forEach(col => {
        if (col !== column) {
          newRow[col] = row[col];
        }
      });
      // Add the new split columns
      const parsed = parseResult.parsedRows[idx] || {};
      splitInto.forEach(col => {
        newRow[col] = parsed[col] ?? null;
      });
      return newRow;
    });

    return new Response(JSON.stringify({
      success: true,
      columns: newColumns,
      rows: mergedRows,
      splitColumn: column,
      newColumns: splitInto,
      confidence: parseResult.confidence,
      warnings: parseResult.warnings || []
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in split-column-with-ai:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error',
      success: false
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
