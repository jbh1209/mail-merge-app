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

    const prompt = `You are a professional label designer AI with text measurement capabilities.

LABEL CANVAS:
- Physical dimensions: ${templateSize.width}mm × ${templateSize.height}mm
- Usable area: ${(templateSize.width - 12) * (templateSize.height - 12)} mm² (leave ~6mm margins)

YOUR DATA TO DESIGN WITH:
${dataAnalysis.map((d: any, i: number) => {
  const text = d.sampleText || 'N/A';
  // Show measurements at multiple sizes so AI can explore options
  const sizes = [8, 10, 12, 14, 16, 18];
  const measurements = sizes.map(pt => {
    const m = measureText(text, pointsToPx(pt), mmToPx(templateSize.width - 12));
    return `${pt}pt: ${pxToMm(m.width).toFixed(1)}×${pxToMm(m.height).toFixed(1)}mm (${m.lineCount} lines)`;
  });
  
  return `Field "${d.field}":
   Text: "${text}"
   Character count: ${d.maxLength}
   Contains commas: ${d.hasCommas ? 'Yes (semantic line breaks possible)' : 'No'}
   Measurements at different sizes:
   ${measurements.join('\n   ')}`;
}).join('\n\n')}

YOUR DESIGN PROCESS:
1. ANALYZE THE DATA
   - What is each field? (store name, address, code, identifier, etc.)
   - What is most important to the user reading this label?
   - What deserves visual prominence?
   - What needs multi-line formatting (addresses with commas)?

2. DESIGN PRINCIPLES (Your Goals - Not Rules):
   • VISUAL HIERARCHY: Important information should be larger and more prominent
   • READABILITY: Text must be legible - but size is relative to importance and space
   • EFFICIENT SPACE USE: Use the canvas effectively - no cramping, no excessive gaps
   • SEMANTIC LINE BREAKS: Addresses should break logically (not just wrap), parse comma-separated parts
   • BALANCED LAYOUT: Distribute fields across the canvas, avoid clustering in one corner
   • CLEAR RELATIONSHIPS: Group related information through proximity
   • ZERO OVERLAPS: Fields must not overlap (you have measurements to verify this)

3. YOUR TOOLS:
   - Text measurements at multiple font sizes (shown above)
   - Complete freedom to choose ANY font size that works
   - Complete freedom to position fields anywhere
   - Complete freedom to allocate space as needed
   - Overlap detection (ensure no fields touch)

4. THINK THROUGH YOUR DESIGN:
   - Start with importance ranking: What should catch the eye first?
   - Calculate optimal font sizes: What size makes each field readable and proportional?
   - For addresses: Parse by commas, create semantic line breaks (Shop/Building, Street, City/State/ZIP)
   - Position for flow: Top-to-bottom, left-to-right reading pattern
   - Verify measurements: Use the dimensions I provided to ensure nothing overlaps
   - Balance whitespace: Leave breathing room, don't cluster or spread too thin

5. RENDERING PROPERTIES:
   For each field, choose CSS properties that match your design:
   - whiteSpace: "normal" (multi-line wrapping) or "nowrap" (single line)
   - wordWrap: "break-word" (if multi-line) or "normal" (if single line)
   - lineHeight: "1.2" (multi-line readability) or "1" (compact single line)
   - display: "block" (for multi-line) or "inline" (for compact single line)
   - fontWeight: "normal" or "bold" (for emphasis)
   - textAlign: "left", "center", or "right" (for layout balance)

TECHNICAL CONSTRAINTS (Only Physical Limits):
- All positions/sizes in MILLIMETERS (mm)
- Font sizes in POINTS (pt)
- Stay within label bounds (0 to ${templateSize.width}mm × ${templateSize.height}mm)
- No overlapping fields
- That's it. You decide everything else.

Return JSON with your complete design and explain your reasoning:
{
  "fields": [
    {
      "templateField": "field_name",
      "position": { "x": <mm>, "y": <mm> },
      "size": { "width": <mm>, "height": <mm> },
      "style": {
        "fontSize": <points - your choice>,
        "fontFamily": "Arial",
        "fontWeight": "normal" | "bold",
        "textAlign": "left" | "center" | "right",
        "color": "#000000",
        "whiteSpace": "normal" | "nowrap",
        "wordWrap": "break-word" | "normal",
        "lineHeight": "1.2" | "1",
        "display": "block" | "inline"
      }
    }
  ],
  "layoutStrategy": "Explain your design thinking: What did you make prominent? Why? How did you handle the address? What was your spatial strategy?",
  "confidence": <0-100>
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

    // Validate AI output (only check physical bounds, trust AI's design decisions)
    if (layout.fields) {
      layout.fields = layout.fields.map((field: any) => {
        // Only validate font size is reasonable (not specific range)
        const fontSize = Math.max(5, Math.min(30, field.style.fontSize));
        
        // Only constrain to template bounds (trust AI's calculated dimensions)
        const maxWidth = templateSize.width;
        const width = Math.min(maxWidth, Math.max(0, field.size.width));
        
        const maxHeight = templateSize.height;
        const height = Math.min(maxHeight, Math.max(0, field.size.height));
        
        // Only constrain positions to stay within label
        const x = Math.max(0, Math.min(templateSize.width - width, field.position.x));
        const y = Math.max(0, Math.min(templateSize.height - height, field.position.y));
        
        // Validate CSS rendering properties
        const validWhiteSpace = ['normal', 'nowrap'];
        const validWordWrap = ['break-word', 'normal'];
        const validDisplay = ['block', 'inline', 'flex'];
        const validFontWeight = ['normal', 'bold'];
        const validTextAlign = ['left', 'center', 'right'];
        
        const whiteSpace = validWhiteSpace.includes(field.style.whiteSpace) ? field.style.whiteSpace : 'normal';
        const wordWrap = validWordWrap.includes(field.style.wordWrap) ? field.style.wordWrap : 'normal';
        const lineHeight = field.style.lineHeight || '1.2';
        const display = validDisplay.includes(field.style.display) ? field.style.display : 'block';
        const fontWeight = validFontWeight.includes(field.style.fontWeight) ? field.style.fontWeight : 'normal';
        const textAlign = validTextAlign.includes(field.style.textAlign) ? field.style.textAlign : 'left';
        
        console.log(`Validated ${field.templateField}:`, {
          original: { x: field.position.x, y: field.position.y, w: field.size.width, h: field.size.height, fontSize: field.style.fontSize },
          constrained: { x, y, width, height, fontSize },
          cssProps: { whiteSpace, wordWrap, lineHeight, display, fontWeight, textAlign }
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
            display,
            fontWeight,
            textAlign
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
