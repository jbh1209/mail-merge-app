import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const { templateSize, fieldNames, sampleData, templateType } = await req.json();

    console.log('Generating AI layout for:', { templateSize, fieldNames, templateType });

    // Analyze sample data
    const dataAnalysis = fieldNames.map((field: string) => {
      const samples = sampleData?.slice(0, 5).map((row: any) => row[field] || '').filter(Boolean);
      if (!samples || samples.length === 0) return { field, avgLength: 0, maxLength: 0 };
      
      const lengths = samples.map((s: string) => String(s).length);
      return {
        field,
        avgLength: Math.round(lengths.reduce((a: number, b: number) => a + b, 0) / lengths.length),
        maxLength: Math.max(...lengths),
        samples: samples.slice(0, 2)
      };
    });

    const prompt = `You are an expert label designer. Create an optimal layout for this label.

TEMPLATE:
- Dimensions: ${templateSize.width}mm × ${templateSize.height}mm
- Category: ${templateType || 'Label'}
- Available space: ${Math.round(templateSize.width * templateSize.height)} mm²
- Padding: 6mm on all sides
- Usable area: ${templateSize.width - 12}mm × ${templateSize.height - 12}mm

FIELDS TO LAYOUT:
${dataAnalysis.map((d: any, i: number) => 
  `${i + 1}. ${d.field}: avg ${d.avgLength} chars, max ${d.maxLength} chars${d.samples ? ` (e.g., "${d.samples[0]}")` : ''}`
).join('\n')}

CRITICAL REQUIREMENTS (in priority order):

1. MAXIMIZE FONT SIZES:
   - Start with 14pt and only reduce if text won't fit
   - NEVER use less than 9pt unless absolutely necessary
   - Address fields: aim for 11-13pt minimum
   - Short fields (IDs, codes): can use 13-15pt
   - Names/titles: 12-14pt
   
2. SPACE UTILIZATION:
   - Fill the available label space efficiently
   - Don't leave large empty areas
   - Increase field dimensions to use available space
   - Larger fields = larger fonts = better readability

3. PREVENT OVERFLOW WITH BUFFERS:
   - Add 10% height buffer for text fields
   - Address fields need at least 3 lines worth of height
   - Use actual sample data to estimate required space
   - Test with longest sample values

4. SMART MULTI-COLUMN LAYOUT:
   - Use 2-column layout for 5+ fields when width > 50mm
   - Place short fields on left, long fields on right
   - Balance visual weight across columns

5. VISUAL HIERARCHY:
   - Primary fields (names, addresses): Largest fonts (12-15pt)
   - Secondary fields (codes, IDs): Medium fonts (10-12pt)
   - Tertiary info: Smaller fonts (9-10pt) only if needed

6. ANALYSIS OF SAMPLE DATA:
Sample data provided shows:
${sampleData?.slice(0, 3).map((row: any, i: number) => 
  `Row ${i + 1}: ${JSON.stringify(row, null, 2)}`
).join('\n') || 'No sample data'}

Use this data to:
- Identify fields with long content (>50 chars) → need more space
- Identify short fields (<20 chars) → can share horizontal space
- Estimate required dimensions based on actual content

7. PROFESSIONAL SPACING:
- Group related fields (city/state/zip, street/city)
- Consistent alignment and padding

DESIGN PRINCIPLES:
- Balance: Distribute fields evenly
- Readability: Ensure comfortable reading
- Hierarchy: Important info stands out
- Aesthetics: Clean, professional look

Return ONLY valid JSON with this structure:
{
  "fields": [
    {
      "templateField": "field_name",
      "position": { "x": 6, "y": 6 },
      "size": { "width": 45, "height": 15 },
      "style": {
        "fontSize": 10,
        "fontFamily": "Arial",
        "fontWeight": "normal",
        "textAlign": "left"
      }
    }
  ],
  "layoutStrategy": "description of approach used",
  "confidence": 85
}

Coordinates are in millimeters from top-left. Ensure all fields fit within usable area.`;

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'You are a professional label layout designer. Return only valid JSON.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.4,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      throw new Error(`AI API returned ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    let suggestions = aiData.choices[0].message.content;

    // Clean markdown formatting if present
    suggestions = suggestions.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    const layout = JSON.parse(suggestions);

    console.log('AI layout generated:', { 
      fieldsCount: layout.fields?.length, 
      strategy: layout.layoutStrategy,
      confidence: layout.confidence 
    });

    return new Response(
      JSON.stringify(layout),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in suggest-layout:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
