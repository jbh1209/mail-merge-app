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

    console.log('Data analysis complete:', dataAnalysis.map((d: any) => ({
      field: d.field,
      fieldType: d.fieldType,
      maxLength: d.maxLength,
      maxLineLength: d.maxLineLength,
      suggestedFontSize: d.suggestedFontSize
    })));

    // PRE-ANALYSIS: ADDRESS-FIRST LAYOUT CALCULATION
    // Find ADDRESS field and calculate its optimal size BEFORE allocating budgets
    const addressField = dataAnalysis.find((d: any) => d.fieldType === 'ADDRESS' || d.field.toUpperCase().includes('ADDRESS'));
    let addressFontSize = 10; // default
    let addressHeight = 18; // default
    let addressFieldName = '';
    const availableWidth = templateSize.width - 6; // margins for width calculation
    
    if (addressField) {
      addressFieldName = addressField.field;
      
      // Calculate optimal font size for longest line
      const availableWidth = templateSize.width - 6; // margins
      const longestLine = addressField.maxLineLength;
      const avgCharWidthRatio = 0.55; // pt to mm ratio for character width
      
      // Calculate font size to fit longest line
      let calculatedFontSize = Math.floor(availableWidth / (longestLine * avgCharWidthRatio));
      
      // Clamp to readable range for addresses (8-12pt)
      addressFontSize = Math.max(8, Math.min(12, calculatedFontSize));
      
      // Calculate line count (commas + 1)
      const lineCount = (addressField.sampleText.match(/,/g) || []).length + 1;
      const lineHeight = 1.1; // compact but readable
      
      // Calculate required height for ADDRESS: lineCount × fontSize × lineHeight × pt-to-mm conversion
      addressHeight = Math.ceil(lineCount * addressFontSize * lineHeight * 0.35);
      
      console.log('📍 ADDRESS PRE-CALCULATION:', {
        field: addressFieldName,
        longestLine,
        longestLineLength: longestLine,
        calculatedFontSize,
        clampedFontSize: addressFontSize,
        lineCount,
        lineHeight,
        requiredHeight: addressHeight
      });
    }

    // Phase 1: Calculate Space Budget and Pairings (accounting for fixed ADDRESS)
    const availableHeight = templateSize.height - 6; // margins
    const fieldCount = fieldNames.length;
    
    // Define base space allocation priorities
    // ADDRESS height is now FIXED from pre-calculation, others share remaining space
    const baseAllocation: Record<string, { priority: string; minHeight: number; maxHeight: number }> = {
      'STORE NAME': { priority: 'high', minHeight: 7, maxHeight: 10 },
      'ADDRESS': { priority: 'fixed', minHeight: addressHeight, maxHeight: addressHeight }, // FIXED from pre-calc
      'STORE CODE': { priority: 'high', minHeight: 6, maxHeight: 8 },
      'PROVINCE': { priority: 'medium', minHeight: 6, maxHeight: 8 },
      'A0 POSTER': { priority: 'medium', minHeight: 6, maxHeight: 8 },
      'STORE AREA': { priority: 'low', minHeight: 5, maxHeight: 7 },
      'AREA MANAGER': { priority: 'low', minHeight: 5, maxHeight: 7 }
    };
    
    // Identify horizontal pairing opportunities
    const pairings = [
      { fields: ['STORE NAME', 'A0 POSTER'], saves: 8 },
      { fields: ['STORE CODE', 'PROVINCE'], saves: 7 },
      { fields: ['STORE AREA', 'AREA MANAGER'], saves: 6 }
    ];
    
    // Filter pairings to only those where both fields exist
    const validPairings = pairings.filter(p => 
      p.fields.every(f => fieldNames.includes(f))
    );
    
    // Calculate ideal space needed
    let idealTotal = 0;
    const fieldsInPairs = new Set(validPairings.flatMap(p => p.fields));
    
    for (const field of fieldNames) {
      const allocation = baseAllocation[field] || { minHeight: 6, maxHeight: 8 };
      idealTotal += allocation.maxHeight;
    }
    
    const gapsNeeded = (fieldNames.length - validPairings.length) * 2;
    const spaceSaved = validPairings.reduce((sum, p) => sum + p.saves, 0);
    const adjustedTotal = idealTotal - spaceSaved + gapsNeeded;
    
    // Calculate if we need to scale down
    const needsScaling = adjustedTotal > availableHeight;
    const scaleFactor = needsScaling ? (availableHeight - gapsNeeded) / (idealTotal - spaceSaved) : 1.0;
    
    // Apply scaling to create final budgets
    const calculatedBudgets: Record<string, number> = {};
    for (const field of fieldNames) {
      const allocation = baseAllocation[field] || { minHeight: 6, maxHeight: 8 };
      const budget = Math.max(
        allocation.minHeight,
        Math.floor(allocation.maxHeight * scaleFactor)
      );
      calculatedBudgets[field] = budget;
    }
    
    console.log('Space budget calculation:', {
      availableHeight: `${availableHeight}mm`,
      idealTotal: `${idealTotal}mm`,
      adjustedTotal: `${adjustedTotal}mm`,
      needsScaling,
      scaleFactor: scaleFactor.toFixed(2),
      validPairings: validPairings.map(p => p.fields.join(' + ')),
      budgets: calculatedBudgets
    });

    const prompt = `Generate optimal layout for ${templateSize.width}×${templateSize.height}mm label.

USABLE AREA: ${availableWidth}×${availableHeight}mm (3mm margins)

FIELDS: ${fieldNames.join(', ')}

DATA ANALYSIS:
${dataAnalysis.map((d: any) => `${d.field}: ${d.fieldType}, max ${d.maxLength} chars, suggest ${d.suggestedFontSize}pt`).join('\n')}

${addressFieldName ? `ADDRESS (FIXED): 
- Font: ${addressFontSize}pt (EXACT)
- Height: ${addressHeight}mm (EXACT)
- Lines: ${Math.ceil(addressHeight / (addressFontSize * 1.1 * 0.35))}
- Rendering: whiteSpace='pre-line', transformCommas=true (for multi-line display)
⚠️ DO NOT modify these values. Use exact font/height.
` : ''}

SPACE:
- Available: ${availableHeight}mm
${addressFieldName ? `- ADDRESS: ${addressHeight}mm (FIXED)
- Other ${fieldNames.length - 1} fields: ${(availableHeight - addressHeight - 4).toFixed(1)}mm
` : `- Per field: ${Object.entries(calculatedBudgets).map(([f, b]) => `${f}=${b}mm`).join(', ')}`}

PAIRINGS: ${validPairings.map(p => `${p.fields.join('+')}}`).join(', ')}

CONSTRAINTS:
1. 3mm margins
2. No overlap
3. 2mm gaps between fields
4. Use pairings to save space
5. Total height ≤ ${availableHeight}mm
${addressFieldName ? `6. ADDRESS: ${addressFontSize}pt, ${addressHeight}mm (EXACT)` : ''}

Return ONLY valid JSON:
{
  "fields": [
    {"templateField": "ADDRESS", "position": {"x": 3, "y": 29}, "size": {"width": 95.6, "height": 16}, "style": {"fontSize": 8, "fontWeight": "normal", "textAlign": "left", "whiteSpace": "pre-line", "lineHeight": "1.1", "transformCommas": true}},
    {"templateField": "OTHER", "position": {"x": 3, "y": 3}, "size": {"width": 50, "height": 8}, "style": {"fontSize": 14, "fontWeight": "bold", "textAlign": "left", "whiteSpace": "nowrap", "lineHeight": "1"}}
  ]
}`

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
          model: 'google/gemini-2.5-flash', // Faster model for 3-5x performance improvement
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
        const validWhiteSpace = ['normal', 'nowrap', 'pre-line'];
        const validWordWrap = ['break-word', 'normal'];
        const validDisplay = ['block', 'inline', 'flex'];
        const validFontWeight = ['normal', 'bold'];
        const validTextAlign = ['left', 'center', 'right'];
        
        // Force multi-line rendering for ADDRESS fields (comma-separated data needs line breaks)
        const isAddressField = field.templateField === addressFieldName || 
                               field.templateField.toUpperCase().includes('ADDRESS');
        
        const whiteSpace = isAddressField ? 'pre-line' : 
                           (validWhiteSpace.includes(field.style.whiteSpace) ? field.style.whiteSpace : 'normal');
        const wordWrap = validWordWrap.includes(field.style.wordWrap) ? field.style.wordWrap : 'normal';
        const lineHeight = field.style.lineHeight || '1.2';
        const display = validDisplay.includes(field.style.display) ? field.style.display : 'block';
        const fontWeight = validFontWeight.includes(field.style.fontWeight) ? field.style.fontWeight : 'normal';
        const textAlign = validTextAlign.includes(field.style.textAlign) ? field.style.textAlign : 'left';
        const transformCommas = isAddressField ? true : Boolean(field.style.transformCommas);
        
        console.log(`Validated ${field.templateField}:`, {
          original: { x: field.position.x, y: field.position.y, w: field.size.width, h: field.size.height, fontSize: field.style.fontSize },
          constrained: { x, y, width, height, fontSize },
          cssProps: { whiteSpace, wordWrap, lineHeight, display, fontWeight, textAlign, transformCommas }
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
            textAlign,
            transformCommas
          }
        };
      });
    }

    // Phase 3: Enhanced Validation
    const validationErrors: string[] = [];
    
    // Check all fields present
    const presentFields = new Set(layout.fields.map((f: any) => f.templateField));
    const missingFields = fieldNames.filter((f: string) => !presentFields.has(f));
    if (missingFields.length > 0) {
      validationErrors.push(`Missing fields: ${missingFields.join(', ')}`);
    }
    
    // Check height budgets (with special handling for ADDRESS)
    for (const field of layout.fields) {
      if (field.templateField === addressFieldName) {
        // ADDRESS must match pre-calculated values
        const heightDiff = Math.abs(field.size.height - addressHeight);
        if (heightDiff > 1) {
          validationErrors.push(`ADDRESS height ${field.size.height.toFixed(1)}mm doesn't match pre-calculated ${addressHeight}mm`);
        }
        
        const fontDiff = Math.abs(field.style.fontSize - addressFontSize);
        if (fontDiff > 1) {
          validationErrors.push(`ADDRESS fontSize ${field.style.fontSize}pt doesn't match pre-calculated ${addressFontSize}pt`);
        }
      } else {
        // Other fields checked against budgets
        const budget = calculatedBudgets[field.templateField];
        if (budget && field.size.height > budget + 1) { // 1mm tolerance
          validationErrors.push(`${field.templateField} exceeds height budget: ${field.size.height.toFixed(1)}mm > ${budget}mm`);
        }
      }
    }
    
    // Check required pairings
    for (const pairing of validPairings) {
      const field1 = layout.fields.find((f: any) => f.templateField === pairing.fields[0]);
      const field2 = layout.fields.find((f: any) => f.templateField === pairing.fields[1]);
      
      if (field1 && field2) {
        const yDiff = Math.abs(field1.position.y - field2.position.y);
        if (yDiff > 1) { // 1mm tolerance
          validationErrors.push(`Required pairing not on same row: ${pairing.fields.join(' + ')} (y-diff: ${yDiff.toFixed(1)}mm)`);
        }
      }
    }
    
    // Check total height
    const maxY = Math.max(...layout.fields.map((f: any) => f.position.y + f.size.height));
    if (maxY > availableHeight + 3) { // +3mm for margin
      validationErrors.push(`Total layout height ${maxY.toFixed(1)}mm exceeds available ${availableHeight}mm`);
    }
    
    // Check for overlapping fields
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
          validationErrors.push(`${field1.templateField} overlaps ${field2.templateField}`);
        }
      }
    }

    if (validationErrors.length > 0) {
      console.error('Layout validation failed:', {
        errors: validationErrors,
        budgets: calculatedBudgets,
        pairings: validPairings.map(p => p.fields.join(' + ')),
        fieldHeights: layout.fields.map((f: any) => ({ field: f.templateField, height: f.size.height, y: f.position.y }))
      });
      throw new Error(`Layout validation failed: ${validationErrors.join('; ')}`);
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
