import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";
import { corsHeaders } from "../_shared/cors.ts";

// Text measurement utility for AI to calculate precise dimensions
interface TextMeasurement {
  width: number;
  height: number;
  lineCount: number;
}

function measureText(
  text: string,
  fontSizePx: number,
  maxWidthPx?: number
): TextMeasurement {
  // Character width estimation (based on typical Arial metrics)
  const avgCharWidthRatio = 0.55; // Average character is ~55% of font size
  const charWidth = fontSizePx * avgCharWidthRatio;
  const lineHeight = fontSizePx * 1.2;
  
  if (!maxWidthPx) {
    // Single line
    return {
      width: text.length * charWidth,
      height: lineHeight,
      lineCount: 1
    };
  }
  
  // Multi-line with wrapping
  const hasCommas = text.includes(',');
  const segments = hasCommas ? text.split(',').map(s => s.trim()) : [text];
  
  let lineCount = 0;
  let maxLineWidth = 0;
  
  for (const segment of segments) {
    const words = segment.split(' ');
    let currentLineWidth = 0;
    
    for (const word of words) {
      const wordWidth = word.length * charWidth;
      const spaceWidth = charWidth;
      
      if (currentLineWidth > 0 && currentLineWidth + spaceWidth + wordWidth > maxWidthPx) {
        // Word doesn't fit, wrap to next line
        maxLineWidth = Math.max(maxLineWidth, currentLineWidth);
        lineCount++;
        currentLineWidth = wordWidth;
      } else {
        // Add word to current line
        currentLineWidth += (currentLineWidth > 0 ? spaceWidth : 0) + wordWidth;
      }
    }
    
    if (currentLineWidth > 0) {
      maxLineWidth = Math.max(maxLineWidth, currentLineWidth);
      lineCount++;
    }
  }
  
  return {
    width: maxLineWidth,
    height: lineCount * lineHeight,
    lineCount
  };
}

function mmToPx(mm: number): number {
  // 96 DPI standard: 1 inch = 25.4mm = 96px
  return (mm / 25.4) * 96;
}

function pxToMm(px: number): number {
  return (px / 96) * 25.4;
}

function pointsToPx(points: number): number {
  return (points / 72) * 96;
}

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

    // Analyze sample data with actual measurements
    const dataAnalysis = fieldNames.map((field: string) => {
      const samples = sampleData?.slice(0, 5).map((row: any) => row[field] || '').filter(Boolean);
      if (!samples || samples.length === 0) return { 
        field, 
        avgLength: 0, 
        maxLength: 0, 
        sampleText: '',
        hasCommas: false
      };
      
      const lengths = samples.map((s: string) => String(s).length);
      const sampleText = String(samples[0] || '');
      
      return {
        field,
        avgLength: Math.round(lengths.reduce((a: number, b: number) => a + b, 0) / lengths.length),
        maxLength: Math.max(...lengths),
        sampleText,
        hasCommas: sampleText.includes(','),
        samples: samples.slice(0, 2)
      };
    });

    const prompt = `You are an AI layout calculator with precise text measurement capabilities.

LABEL SPECIFICATIONS:
- Dimensions: ${templateSize.width}mm × ${templateSize.height}mm
- Usable area (after 6mm padding): ${templateSize.width - 12}mm × ${templateSize.height - 12}mm
- Total area: ${Math.round(templateSize.width * templateSize.height)} mm²

ACTUAL DATA WITH MEASUREMENTS:
${dataAnalysis.map((d: any, i: number) => {
  const text = d.sampleText || 'N/A';
  // Calculate measurements at different font sizes
  const measurements10pt = measureText(text, pointsToPx(10), mmToPx(templateSize.width - 12));
  const measurements12pt = measureText(text, pointsToPx(12), mmToPx(templateSize.width - 12));
  
  return `${i + 1}. Field: "${d.field}"
   - Actual text: "${text}"
   - Length: ${d.avgLength} chars (max: ${d.maxLength})
   - Has commas: ${d.hasCommas ? 'YES - will wrap naturally' : 'NO'}
   - At 10pt: ${pxToMm(measurements10pt.width).toFixed(1)}mm wide × ${pxToMm(measurements10pt.height).toFixed(1)}mm tall (${measurements10pt.lineCount} lines)
   - At 12pt: ${pxToMm(measurements12pt.width).toFixed(1)}mm wide × ${pxToMm(measurements12pt.height).toFixed(1)}mm tall (${measurements12pt.lineCount} lines)`;
}).join('\n\n')}

CRITICAL: YOUR MEASUREMENTS ARE PRE-CALCULATED
I have measured each field at different font sizes for you (shown above).
Use these measurements to allocate PRECISE dimensions. Do not guess.

YOUR TASK:
1. Review the measurements above - these are ACTUAL rendered dimensions
2. Choose appropriate font sizes based on:
   - Short fields (< 20 chars): 12-14pt for prominence
   - Medium fields (20-50 chars): 10-12pt for balance
   - Long fields (> 50 chars): 9-10pt to fit comfortably
3. Allocate field height = measured height + 2mm buffer
4. Allocate field width = measured width (text will wrap naturally)
5. Position fields with 2mm gaps - NO OVERLAPS

SPATIAL RULES (CRITICAL):
• Use the measurements provided - they are pre-calculated and accurate
• Add 2mm buffer to measured dimensions for comfortable spacing
• Verify no overlaps: field1.x + field1.width + 2mm <= field2.x
• Multi-line text (with commas) needs vertical space - use the line count from measurements

LAYOUT STRATEGY:
• Top section: Short, important fields (names, IDs) - larger fonts
• Middle section: Medium content - balanced sizing
• Bottom section: Long fields (addresses) - smaller fonts but adequate height for multiple lines

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

    // Check for overlapping fields
    const overlaps: string[] = [];
    for (let i = 0; i < layout.fields.length; i++) {
      for (let j = i + 1; j < layout.fields.length; j++) {
        const field1 = layout.fields[i];
        const field2 = layout.fields[j];
        
        const overlap = !(
          field1.position.x + field1.size.width <= field2.position.x ||
          field2.position.x + field2.size.width <= field1.position.x ||
          field1.position.y + field1.size.height <= field2.position.y ||
          field2.position.y + field2.size.height <= field1.position.y
        );
        
        if (overlap) {
          overlaps.push(`${field1.templateField} overlaps ${field2.templateField}`);
        }
      }
    }

    if (overlaps.length > 0) {
      console.error('Field overlaps detected:', overlaps);
      throw new Error(`Layout has overlapping fields: ${overlaps.join(', ')}. Please try regenerating the layout.`);
    }

    console.log('AI-calculated layout (with measurements):', {
      fieldsCount: layout.fields?.length, 
      strategy: layout.layoutStrategy,
      confidence: layout.confidence,
      fieldsDetails: layout.fields?.map((f: any) => ({
        name: f.templateField,
        position: `${f.position.x}mm, ${f.position.y}mm`,
        size: `${f.size.width}mm × ${f.size.height}mm`,
        fontSize: `${f.style.fontSize}pt`,
        rendering: `${f.style.whiteSpace}, ${f.style.display}`
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
