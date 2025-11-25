import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { columns, rows, targetFields, workspaceId } = await req.json();

    console.log('Structure Data AI request:', { 
      columnCount: columns.length, 
      rowCount: rows.length,
      targetFieldCount: targetFields?.length 
    });

    // Verify user authentication
    const authHeader = req.headers.get('Authorization')!;
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify workspace membership
    const { data: profile } = await supabase
      .from('profiles')
      .select('workspace_id')
      .eq('id', user.id)
      .single();

    const userWorkspaceId = workspaceId || profile?.workspace_id;

    if (!userWorkspaceId) {
      return new Response(JSON.stringify({ error: 'Workspace not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check workspace subscription for AI features
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('subscription_tier, subscription_status')
      .eq('id', userWorkspaceId)
      .single();

    if (!workspace) {
      return new Response(JSON.stringify({ error: 'Workspace not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Prepare sample data for AI (first 5 rows)
    const sampleRows = rows.slice(0, 5);
    
    // Build the AI prompt
    const prompt = `You are a data structuring expert. Parse unstructured single-column data into proper structured columns.

**INPUT DATA:**
Columns: ${JSON.stringify(columns)}
Sample Rows (first 5 of ${rows.length}):
${sampleRows.map((row: any, idx: number) => `Row ${idx + 1}: ${JSON.stringify(row)}`).join('\n')}

**TARGET STRUCTURE:**
${targetFields ? `Expected fields: ${targetFields.join(', ')}` : 'Auto-detect fields from data'}

**YOUR TASK:**
1. Analyze the data pattern (appears to be comma-separated address data)
2. Parse EACH row into structured columns
3. For address data, extract: name, address_line_1, address_line_2, city, county, postcode
4. Handle missing components (e.g., no address_line_2, no county)
5. Return confidence score (0-100) for the parsing

**CRITICAL RULES:**
- Parse ALL ${rows.length} rows (not just the sample)
- Maintain exact row order
- Use null for missing components
- Handle UK and US address formats
- Extract apartment/flat numbers to address_line_2 if present

**OUTPUT FORMAT (JSON):**
{
  "success": true,
  "columns": ["name", "address_line_1", "address_line_2", "city", "county", "postcode"],
  "rows": [
    { "name": "Oliver Bennett", "address_line_1": "12 Rowan Close", "address_line_2": null, "city": "Denton", "county": "Manchester", "postcode": "M34 2FT" },
    ...
  ],
  "confidence": 95,
  "method": "comma_split_address_parsing"
}

Parse this data now:`;

    // Call Lovable AI
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    console.log('Calling Lovable AI for data structuring...');

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
            content: 'You are a data structuring expert. Always return valid JSON. Parse unstructured data into proper columns.'
          },
          {
            role: 'user',
            content: prompt + '\n\nFull dataset:\n' + JSON.stringify({ columns, rows })
          }
        ],
        temperature: 0.3,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ 
          error: 'Rate limit exceeded. Please try again in a moment.' 
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ 
          error: 'AI credits depleted. Please add credits to your workspace.' 
        }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    let structuredData;

    try {
      const rawContent = aiData.choices[0].message.content;
      console.log('AI response length:', rawContent.length);
      
      // Remove markdown code blocks if present
      const cleanContent = rawContent
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      structuredData = JSON.parse(cleanContent);
      
      if (!structuredData.success || !structuredData.columns || !structuredData.rows) {
        throw new Error('Invalid AI response format');
      }

      console.log('Successfully structured data:', {
        originalColumns: columns.length,
        newColumns: structuredData.columns.length,
        rowCount: structuredData.rows.length,
        confidence: structuredData.confidence
      });

    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      return new Response(JSON.stringify({ 
        error: 'Failed to parse AI response',
        details: parseError instanceof Error ? parseError.message : 'Unknown error'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(structuredData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in structure-data-with-ai:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      success: false
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
