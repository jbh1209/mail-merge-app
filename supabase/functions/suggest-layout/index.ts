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

function detectFieldType(fieldName: string, sampleValues: string[]): string {
  const name = fieldName.toLowerCase();
  const samples = sampleValues.map(v => String(v).toLowerCase());
  
  // ADDRESS detection
  if (name.includes('address') || name.includes('location') || name.includes('street')) {
    return 'ADDRESS';
  }
  if (samples.some(v => v.includes(',') && (v.includes('street') || v.includes('road') || v.includes('avenue') || v.includes('shop') || v.includes('building')))) {
    return 'ADDRESS';
  }
  
  // NAME detection
  if (name.includes('name') || name.includes('customer') || name.includes('recipient') || name.includes('contact')) {
    return 'NAME';
  }
  
  // CODE detection (product code, barcode, SKU, etc.)
  if (name.includes('code') || name.includes('sku') || name.includes('barcode') || name.includes('id') || name.includes('ref')) {
    return 'CODE';
  }
  if (samples.every(v => /^[A-Z0-9-_]+$/i.test(v) && v.length < 20)) {
    return 'CODE';
  }
  
  // PROVINCE/STATE/CITY detection
  if (name.includes('province') || name.includes('state') || name.includes('region') || name.includes('city') || name.includes('town')) {
    return 'PROVINCE';
  }
  
  // DATE detection
  if (name.includes('date') || name.includes('time') || name.includes('expiry') || name.includes('created')) {
    return 'DATE';
  }
  if (samples.some(v => /\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/.test(v))) {
    return 'DATE';
  }
  
  // PRICE/AMOUNT detection
  if (name.includes('price') || name.includes('amount') || name.includes('cost') || name.includes('total') || name.includes('value')) {
    return 'PRICE';
  }
  if (samples.some(v => /^\$?\d+(\.\d{2})?$/.test(v.trim()))) {
    return 'PRICE';
  }
  
  // QUANTITY detection
  if (name.includes('qty') || name.includes('quantity') || name.includes('count') || name.includes('units')) {
    return 'QUANTITY';
  }
  if (samples.every(v => /^\d+$/.test(v.trim()) && parseInt(v) < 10000)) {
    return 'QUANTITY';
  }
  
  // EMAIL detection
  if (name.includes('email') || name.includes('mail')) {
    return 'EMAIL';
  }
  if (samples.some(v => /@/.test(v))) {
    return 'EMAIL';
  }
  
  // PHONE detection
  if (name.includes('phone') || name.includes('tel') || name.includes('mobile') || name.includes('cell')) {
    return 'PHONE';
  }
  if (samples.some(v => /[\d\s()+-]{8,}/.test(v))) {
    return 'PHONE';
  }
  
  // Default to GENERAL for anything else
  return 'GENERAL';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Declare timeout variables at function scope for catch block access
  let controller: AbortController | null = null;
  let timeoutId: number | null = null;

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

    console.log('Generating AI layout for:', { templateSize, fieldNames, templateType, totalRows: sampleData?.length });

    // Helper: Get longest line length after splitting by commas
    function getMaxLineLength(text: string): number {
      if (text.includes(',')) {
        const segments = text.split(',').map(s => s.trim());
        return Math.max(...segments.map(s => s.length));
      }
      return text.length;
    }

    // Helper: Calculate optimal font size based on character length
    function calculateOptimalFontSize(
      maxLineLength: number,
      availableWidthMm: number,
      minSize: number = 8,
      maxSize: number = 18
    ): number {
      let low = minSize;
      let high = maxSize;
      let bestFit = minSize;
      
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const testText = "W".repeat(maxLineLength);
        const measured = measureText(testText, pointsToPx(mid));
        const measuredMm = pxToMm(measured.width);
        
        if (measuredMm <= availableWidthMm) {
          bestFit = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
      
      return bestFit;
    }

    // Analyze ALL data rows for accurate character counts
    const dataAnalysis = fieldNames.map((field: string) => {
      // Get ALL values for this field across ALL rows
      const allValues = sampleData?.map((row: any) => String(row[field] || '')).filter(Boolean) || [];
      
      if (allValues.length === 0) {
        return { 
          field,
          fieldType: 'GENERAL',
          maxLength: 0,
          maxLineLength: 0,
          avgLength: 0, 
          sampleText: '',
          hasCommas: false,
          suggestedFontSize: 12
        };
      }
      
      // Detect semantic field type
      const fieldType = detectFieldType(field, allValues);
      
      // Find max length BEFORE splitting (for reference)
      const maxLength = Math.max(...allValues.map((v: string) => v.length));
      
      // Find max LINE length AFTER splitting (for font sizing)
      const maxLineLength = Math.max(...allValues.map((v: string) => getMaxLineLength(v)));
      
      const avgLength = Math.round(
        allValues.reduce((sum: number, v: string) => sum + v.length, 0) / allValues.length
      );
      
      const sampleText = allValues[0];
      const hasCommas = sampleText.includes(',');
      
      // Calculate optimal font size based on post-split line length
      const usableWidth = templateSize.width * 0.8;
      const suggestedFontSize = calculateOptimalFontSize(
        maxLineLength,
        usableWidth,
        hasCommas ? 8 : 9,
        hasCommas ? 14 : 18
      );
      
      return {
        field,
        fieldType,           // Semantic type (ADDRESS, NAME, CODE, etc.)
        maxLength,           // Full string length (e.g., 68 chars for full address)
        maxLineLength,       // Longest segment after comma-split (e.g., 14 chars)
        avgLength,
        sampleText,
        hasCommas,
        suggestedFontSize,   // Pre-calculated font size
        samples: allValues.slice(0, 2)
      };
    });

    console.log('Data analysis:', dataAnalysis.map((d: any) => ({
      field: d.field,
      type: d.fieldType,
      maxLen: d.maxLength,
      maxLinelen: d.maxLineLength
    })));

    // ============================================================================
    // STEP 1: MINIMAL DATA ANALYSIS - Let AI do the reasoning
    // ============================================================================
    
    console.log('\n=== STEP 1: MINIMAL DATA ANALYSIS ===');
    
    const availableWidth = templateSize.width - 6; // 3mm margins
    const availableHeight = templateSize.height - 6;
    
    // Find ADDRESS field
    const addressField = dataAnalysis.find((d: any) => 
      d.fieldType === 'ADDRESS' || d.field.toUpperCase().includes('ADDRESS')
    );
    
    let addressInfo = null;
    if (addressField) {
      const addressSamples = sampleData?.map((row: any) => String(row[addressField.field] || '')) || [];
      let maxLines = 0;
      let longestLine = '';
      
      for (const address of addressSamples) {
        const lines = address.split(',').map((s: string) => s.trim());
        maxLines = Math.max(maxLines, lines.length);
        for (const line of lines) {
          if (line.length > longestLine.length) longestLine = line;
        }
      }
      
      addressInfo = {
        field: addressField.field,
        type: 'ADDRESS',
        sampleValue: addressSamples[0],
        lineCount: maxLines,
        longestLine: longestLine.length
      };
      
      console.log('📍 ADDRESS:', addressInfo);
    }
    
    // Identify potential pairings (short complementary fields)
    const shortFields = dataAnalysis.filter((d: any) => 
      d.fieldType !== 'ADDRESS' && d.maxLength < 20
    );
    
    const pairingSuggestions = [];
    for (let i = 0; i < shortFields.length - 1; i++) {
      const f1 = shortFields[i];
      const f2 = shortFields[i + 1];
      if ((f1.field.includes('NAME') && f2.field.includes('CODE')) ||
          (f1.field.includes('CODE') && f2.field.includes('PROVINCE')) ||
          (f1.maxLength < 15 && f2.maxLength < 15)) {
        pairingSuggestions.push([f1.field, f2.field]);
      }
    }
    
    console.log('🔗 PAIRING SUGGESTIONS:', pairingSuggestions);
    

    // ============================================================================
    // STEP 2: BUILD CONTEXT-RICH AI PROMPT
    // ============================================================================
    
    console.log('\n=== STEP 2: BUILDING AI PROMPT ===');
    
    // Build field descriptions with context
    const fieldDescriptions = dataAnalysis.map((d: any) => {
      const isAddress = d.field === addressInfo?.field;
      const priority = isAddress ? 'HIGHEST' : 
                       (d.fieldType === 'NAME' || d.fieldType === 'CODE') ? 'HIGH' :
                       d.maxLength > 10 ? 'MEDIUM' : 'LOW';
      
      return `- ${d.field}
  Type: ${d.fieldType}
  Priority: ${priority}
  Sample: "${d.sampleText}"
  Max length: ${d.maxLength} chars${isAddress && addressInfo ? `, ${addressInfo.lineCount} lines` : ''}`;
    }).join('\n\n');
    
    const systemPrompt = `You are an expert label designer with deep understanding of typography and visual hierarchy.

TEMPLATE SPECIFICATIONS:
- Total size: ${templateSize.width}mm × ${templateSize.height}mm
- Margins: 3mm all sides
- Usable area: ${availableWidth}mm × ${availableHeight}mm
- This is an ADDRESS LABEL - the address is the primary content

FIELDS TO LAYOUT:
${fieldDescriptions}

${pairingSuggestions.length > 0 ? `PAIRING OPPORTUNITIES:
${pairingSuggestions.map(p => `- ${p[0]} + ${p[1]} could be side-by-side (each gets ~${((availableWidth-2)/2).toFixed(1)}mm width)`).join('\n')}
` : ''}
DESIGN REQUIREMENTS:
1. ${addressInfo ? `The ${addressInfo.field} is CRITICAL - it has ${addressInfo.lineCount} lines
   - Needs 50-60% of vertical space for readability
   - Use "whiteSpace": "pre-line" and "transformCommas": true
   - Font size: 8-10pt recommended` : 'No address field'}

2. Short fields (< 15 chars) can be paired horizontally to save space

3. Font sizes should reflect importance and content length:
   - HIGH priority: 12-16pt
   - MEDIUM: 10-14pt
   - LOW: 8-12pt
   - ADDRESS: 8-10pt (needs multiple lines)

4. All text MUST fit - no overflow

5. Create balanced, professional appearance

Return ONLY valid JSON:
{
  "fields": [
    {
      "templateField": "EXACT_FIELD_NAME",
      "position": { "x": 3, "y": 3 },
      "size": { "width": 60, "height": 10 },
      "style": {
        "fontSize": 12,
        "fontWeight": "normal",
        "whiteSpace": "pre-line",
        "lineHeight": "1.0",
        "textAlign": "left",
        "transformCommas": false
      }
    }
  ]
}`;

    const userPrompt = `Design the optimal layout for this address label.

Consider the data characteristics and priorities. Make intelligent decisions about:
- Space allocation based on content importance
- Which fields to pair horizontally vs stack vertically
- Appropriate font sizes balancing readability with space
- Vertical positioning creating visual hierarchy

Remember: ${addressInfo ? `${addressInfo.field} is the star - it's an address with ${addressInfo.lineCount} lines needing substantial space.` : 'Focus on balanced layout.'}

Provide a complete, production-ready layout.`;

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Initialize timeout to prevent hanging
    controller = new AbortController();
    timeoutId = setTimeout(() => controller!.abort(), 45000); // 45 second max

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ]
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      if (timeoutId) clearTimeout(timeoutId);
      throw new Error(`AI API returned ${aiResponse.status}`);
    }

    if (timeoutId) clearTimeout(timeoutId);
    const aiData = await aiResponse.json();
    let suggestions = aiData.choices[0].message.content;

    // Clean markdown formatting if present
    suggestions = suggestions.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    console.log('AI response length:', suggestions.length);

    // Parse AI response with error recovery
    let layout;
    try {
      layout = JSON.parse(suggestions);
    } catch (parseError) {
      console.error('JSON parse failed, attempting recovery:', parseError);
      
      // Attempt to clean common AI JSON errors
      let cleaned = suggestions
        .replace(/,(\s*[}\]])/g, '$1')           // Remove trailing commas
        .replace(/'/g, '"')                      // Replace single quotes
        .replace(/([{,]\s*)(\w+):/g, '$1"$2":'); // Quote unquoted keys
      
      try {
        layout = JSON.parse(cleaned);
        console.log('✅ JSON recovered successfully');
      } catch (secondError) {
        console.error('❌ Recovery failed. First 500 chars:', suggestions.substring(0, 500));
        const errorMsg = parseError instanceof Error ? parseError.message : 'Unknown parse error';
        throw new Error(`AI returned invalid JSON: ${errorMsg}`);
      }
    }

    // ============================================================================
    // STEP 3: MINIMAL VALIDATION - Trust AI, check basics only
    // ============================================================================
    
    console.log('\n=== STEP 3: VALIDATING LAYOUT ===');
    
    const validationErrors: string[] = [];
    
    // Check all fields present
    const presentFields = new Set(layout.fields.map((f: any) => f.templateField));
    const missingFields = fieldNames.filter((f: string) => !presentFields.has(f));
    if (missingFields.length > 0) {
      validationErrors.push(`Missing fields: ${missingFields.join(', ')}`);
    }
    
    // Basic validation only
    if (layout.fields) {
      layout.fields = layout.fields.map((field: any) => {
        // Check font size is reasonable
        if (field.style.fontSize < 6 || field.style.fontSize > 20) {
          validationErrors.push(`${field.templateField}: Font ${field.style.fontSize}pt out of range (6-20pt)`);
        }
        
        // Check bounds
        if (field.position.x + field.size.width > templateSize.width) {
          validationErrors.push(`${field.templateField}: Exceeds right edge`);
        }
        if (field.position.y + field.size.height > templateSize.height) {
          validationErrors.push(`${field.templateField}: Exceeds bottom edge`);
        }
        
        // Force ADDRESS properties
        const isAddress = addressInfo && field.templateField === addressInfo.field;
        if (isAddress) {
          if (field.style.whiteSpace !== 'pre-line') {
            validationErrors.push(`${field.templateField}: ADDRESS must use whiteSpace="pre-line"`);
          }
          if (!field.style.transformCommas) {
            validationErrors.push(`${field.templateField}: ADDRESS should use transformCommas=true`);
          }
        }
        
        return field;
      });
    }
    
    if (validationErrors.length > 0) {
      console.error('❌ Validation errors:', validationErrors);
      throw new Error(`Layout validation failed:\n${validationErrors.join('\n')}`);
    }
    
    console.log('✓ Layout validation passed');

    console.log('AI-calculated layout:', {
      fieldsCount: layout.fields?.length,
      fields: layout.fields?.map((f: any) => ({
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
    if (timeoutId) clearTimeout(timeoutId);
    if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') {
      console.error('AI layout generation timed out after 45 seconds');
      return new Response(
        JSON.stringify({ error: 'AI layout generation timed out. Please try again or simplify the template.' }),
        { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    console.error('Error in suggest-layout:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
