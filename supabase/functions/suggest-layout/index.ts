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

    const prompt = `You are an expert label designer with deep understanding of typography and layout.

LABEL SPECIFICATIONS:
- Dimensions: ${templateSize.width}mm × ${templateSize.height}mm
- Usable area (after 6mm padding): ${templateSize.width - 12}mm × ${templateSize.height - 12}mm
- Total area: ${Math.round(templateSize.width * templateSize.height)} mm²

DATA TO LAYOUT:
${dataAnalysis.map((d: any, i: number) => {
  return `${i + 1}. Field: "${d.field}"
   - Sample data: "${d.samples?.[0] || 'N/A'}"
   - Content length: avg ${d.avgLength} chars, max ${d.maxLength} chars`;
}).join('\n\n')}

YOUR MISSION:
Create a professional label layout that maximizes readability and uses space efficiently.

Key principles to consider:
• Maximize font sizes while ensuring all text fits comfortably
• Addresses with commas should display across multiple lines (split naturally at commas)
• Balance visual hierarchy - important fields should be prominent
• Use available space wisely - don't leave large empty areas
• Ensure proper spacing and alignment for professional appearance

Think through:
1. What type of content is each field? (address, name, ID, etc.)
2. What dimensions would make each field readable?
3. What font size works best for each type of content?
4. How should fields be arranged spatially?

Return a JSON layout with your reasoning documented in "layoutStrategy".

Required JSON structure:
{
  "fields": [
    {
      "templateField": "field_name",
      "position": { "x": number, "y": number },
      "size": { "width": number, "height": number },
      "style": {
        "fontSize": number,
        "fontFamily": "Arial",
        "fontWeight": "normal",
        "textAlign": "left"
      }
    }
  ],
  "layoutStrategy": "explain your design decisions",
  "confidence": number (0-100)
}`;

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
        model: 'google/gemini-2.5-pro',
        messages: [
          { role: 'system', content: 'You are a professional label layout designer. Return only valid JSON.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
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
