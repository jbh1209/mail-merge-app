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

Design Principles:
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
5. How should each field's text render? (single line vs multi-line)

TECHNICAL REQUIREMENTS (CRITICAL):
• ALL positions and sizes MUST be in MILLIMETERS (mm)
• ALL font sizes MUST be in POINTS (pt)
• Font sizes: Use 9-14pt range (9pt for long text, 14pt for short important fields)
• Field heights: Minimum 6mm, allow 8-15mm for multi-line content
• Field widths: Leave margins, don't use full label width
• Positions: All x,y coordinates are from top-left in mm

CSS RENDERING INSTRUCTIONS (CRITICAL):
For EACH field, you MUST specify complete CSS rendering properties:

• whiteSpace: 
  - "normal" for multi-line text (addresses, long descriptions)
  - "nowrap" for single-line text (IDs, short codes, names)

• wordWrap:
  - "break-word" when whiteSpace is "normal"
  - "normal" when whiteSpace is "nowrap"

• lineHeight:
  - "1.2" for multi-line text (better readability)
  - "1" for single-line text (compact)

• display:
  - "block" for multi-line text
  - "inline" for single-line text

EXAMPLES:
- Address field (long, has commas): whiteSpace "normal", wordWrap "break-word", lineHeight "1.2", display "block"
- Product code (short): whiteSpace "nowrap", wordWrap "normal", lineHeight "1", display "inline"
- Name (medium): depends on length - analyze the sample data

Return a JSON layout with your reasoning documented in "layoutStrategy".

Required JSON structure (ALL NUMBERS IN MILLIMETERS EXCEPT fontSize IN POINTS):
{
  "fields": [
    {
      "templateField": "field_name",
      "position": { "x": <mm>, "y": <mm> },
      "size": { "width": <mm>, "height": <mm> },
      "style": {
        "fontSize": <points, 9-14 range>,
        "fontFamily": "Arial",
        "fontWeight": "normal",
        "textAlign": "left",
        "color": "#000000",
        "whiteSpace": "normal" | "nowrap",
        "wordWrap": "break-word" | "normal",
        "lineHeight": "1.2" | "1",
        "display": "block" | "inline"
      }
    }
  ],
  "layoutStrategy": "explain your design decisions in detail",
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

    // Validate and constrain AI output
    if (layout.fields) {
      layout.fields = layout.fields.map((field: any) => {
        // Constrain font sizes to reasonable range (9-16pt)
        const fontSize = Math.max(9, Math.min(16, field.style.fontSize));
        
        // Constrain widths to usable area
        const maxWidth = templateSize.width - 12; // 6mm padding each side
        const width = Math.max(15, Math.min(maxWidth, field.size.width));
        
        // Constrain heights (min 6mm for readability)
        const maxHeight = templateSize.height - 12;
        const height = Math.max(6, Math.min(maxHeight, field.size.height));
        
        // Constrain positions to label bounds
        const x = Math.max(6, Math.min(templateSize.width - width - 6, field.position.x));
        const y = Math.max(6, Math.min(templateSize.height - height - 6, field.position.y));
        
        // Validate CSS rendering properties
        const validWhiteSpace = ['normal', 'nowrap'];
        const validWordWrap = ['break-word', 'normal'];
        const validDisplay = ['block', 'inline', 'flex'];
        
        const whiteSpace = validWhiteSpace.includes(field.style.whiteSpace) ? field.style.whiteSpace : 'normal';
        const wordWrap = validWordWrap.includes(field.style.wordWrap) ? field.style.wordWrap : 'normal';
        const lineHeight = field.style.lineHeight || '1.2';
        const display = validDisplay.includes(field.style.display) ? field.style.display : 'block';
        
        console.log(`Validated ${field.templateField}:`, {
          original: { x: field.position.x, y: field.position.y, w: field.size.width, h: field.size.height, fontSize: field.style.fontSize },
          constrained: { x, y, width, height, fontSize },
          cssProps: { whiteSpace, wordWrap, lineHeight, display }
        });
        
        return {
          ...field,
          position: { x, y },
          size: { width, height },
          style: {
            ...field.style,
            fontSize,
            whiteSpace,
            wordWrap,
            lineHeight,
            display
          }
        };
      });
    }

    console.log('AI layout generated:', { 
      fieldsCount: layout.fields?.length, 
      strategy: layout.layoutStrategy,
      confidence: layout.confidence,
      fieldsDetails: layout.fields?.map((f: any) => ({
        name: f.templateField,
        position: `${f.position.x}mm, ${f.position.y}mm`,
        size: `${f.size.width}mm × ${f.size.height}mm`,
        fontSize: `${f.style.fontSize}pt`
      }))
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
