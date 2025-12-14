import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";
import { corsHeaders } from "../_shared/cors.ts";

// Common image file extensions for detection
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.svg'];

// Field type detection for semantic analysis
function detectFieldType(fieldName: string, sampleValues: string[]): string {
  const name = fieldName.toLowerCase();
  const samples = sampleValues.map(v => String(v).toLowerCase());
  
  // IMAGE detection - check for file paths/extensions in values FIRST
  // This handles columns like "Unnamed_Column_2" that contain image paths
  const imageMatches = samples.filter(v => 
    IMAGE_EXTENSIONS.some(ext => v.endsWith(ext)) ||
    (v.includes('\\') && IMAGE_EXTENSIONS.some(ext => v.endsWith(ext))) || // Windows paths
    (v.startsWith('http') && IMAGE_EXTENSIONS.some(ext => v.includes(ext))) // URLs
  );
  if (imageMatches.length >= samples.length / 2 && imageMatches.length > 0) {
    return 'IMAGE';
  }
  // Also check by column name
  if (name.includes('image') || name.includes('photo') || name.includes('picture') || 
      name.includes('logo') || name.includes('avatar') || name.includes('headshot') ||
      name.includes('thumbnail') || name.includes('img')) {
    return 'IMAGE';
  }
  
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

    // ============================================================================
    // STEP 1: MINIMAL DATA ANALYSIS - Only semantics, no pre-calculations
    // ============================================================================
    
    console.log('\n=== STEP 1: MINIMAL DATA ANALYSIS ===');
    
    // Analyze data for semantic context only
    const dataAnalysis = fieldNames.map((field: string) => {
      const allValues = sampleData?.map((row: any) => String(row[field] || '')).filter(Boolean) || [];
      
      if (allValues.length === 0) {
        return { 
          field,
          fieldType: 'GENERAL',
          maxLength: 0,
          sampleText: ''
        };
      }
      
      const fieldType = detectFieldType(field, allValues);
      const maxLength = Math.max(...allValues.map((v: string) => v.length));
      const sampleText = allValues[0];
      
      return {
        field,
        fieldType,
        maxLength,
        sampleText
      };
    });

    console.log('📊 Field Analysis:', dataAnalysis.map((d: any) => ({
      field: d.field,
      type: d.fieldType,
      maxChars: d.maxLength
    })));

    const availableWidth = templateSize.width - 6; // 3mm margins
    const availableHeight = templateSize.height - 6;
    
    // Find ADDRESS field and analyze line structure
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
        sampleValue: addressSamples[0],
        lineCount: maxLines,
        longestLineChars: longestLine.length
      };
      
      console.log('📍 ADDRESS:', { 
        field: addressInfo.field, 
        lines: addressInfo.lineCount,
        longestLine: addressInfo.longestLineChars 
      });
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
    // STEP 2: BUILD CONTEXT-RICH AI PROMPT - Let AI reason about design
    // ============================================================================
    
    console.log('\n=== STEP 2: BUILDING AI PROMPT ===');
    
    // Build field descriptions with raw data context only
    const fieldDescriptions = dataAnalysis.map((d: any) => {
      const isAddress = d.field === addressInfo?.field;
      const priority = isAddress ? 'HIGHEST - Address labels need prominent address display' : 
                       (d.fieldType === 'NAME' || d.fieldType === 'CODE') ? 'HIGH - Important identifiers' :
                       d.maxLength > 20 ? 'MEDIUM - Longer content' : 'LOW - Short metadata';
      
      let desc = `- ${d.field}
  Type: ${d.fieldType}
  Priority: ${priority}
  Sample: "${d.sampleText}"
  Max length: ${d.maxLength} characters`;
      
      if (isAddress && addressInfo) {
        desc += `
  Lines when split by commas: ${addressInfo.lineCount}
  Longest line: ${addressInfo.longestLineChars} characters`;
      }
      
      return desc;
    }).join('\n\n');
    
    const systemPrompt = `You are an expert label layout designer with deep understanding of typography, visual hierarchy, and spatial reasoning.

TEMPLATE SPECIFICATIONS:
- Physical size: ${templateSize.width}mm × ${templateSize.height}mm
- Safe margins: 3mm on all sides
- Usable layout area: ${availableWidth}mm × ${availableHeight}mm
- Label type: ${templateType.toUpperCase()}

CRITICAL RULES (MUST FOLLOW):
1. **Field Names - EXACT MATCHES ONLY**
   ⚠️ AVAILABLE FIELD NAMES (use EXACTLY as written, character-for-character):
   ${fieldNames.map((f: string) => `   - "${f}"`).join('\n')}
   
   ⚠️ WARNING: The "Sample" values below are for SIZE REFERENCE ONLY.
   DO NOT use sample values as field names. DO NOT modify field names.
   
2. **All ${fieldNames.length} fields MUST appear in your layout**
   Missing fields = invalid layout

3. **Physical Constraints**
   - Every field must fit within ${availableWidth}mm × ${availableHeight}mm
   - position.y + size.height must be ≤ ${templateSize.height - 3}mm
   - Font sizes: 8-20pt (readable range)

FIELD METADATA (for sizing context only):
${fieldDescriptions}

${pairingSuggestions.length > 0 ? `\nPAIRING OPPORTUNITIES:
${pairingSuggestions.map(p => `- ${p[0]} and ${p[1]} are both short - could be side-by-side`).join('\n')}
` : ''}
YOUR TASK:
Design an optimal, balanced layout following this EXACT STRATEGY:

1. **Explicit Spatial Constraints for ADDRESS (MANDATORY)**
   ${addressInfo ? `⚠️ CRITICAL: "${addressInfo.field}" (ADDRESS field):
     * MUST occupy Y position: 12mm - 38mm (26mm vertical span)
     * This equals 58% of usable vertical space (${availableHeight}mm)
     * Font size calculation for ${addressInfo.lineCount} lines:
       - Allocated height: 26-28mm
       - Target space per line: ~5.2-5.6mm
       - With line-height 1.3, font size should be: 13-15pt
       - ⚠️ USE LARGER FONTS (13-15pt) to VISUALLY FILL the allocated 26-28mm space
       - The address should FILL its bounding box, not leave huge gaps
     * Line spacing: 1.3 (balance between readability and space utilization)
     * Expected vertical usage: ~25-30mm for ${addressInfo.lineCount} lines
     * MUST include: "whiteSpace": "pre-line" and "transformCommas": true
     * This is THE STAR of the label - allocate space first` : ''}

2. **Space Distribution Strategy (Follow in Order)**
   ${addressInfo ? `STEP 1: Place "${addressInfo.field}" first (Y: 12-38mm, dominant placement)
   STEP 2: Distribute remaining fields in unused spaces:` : 'STEP 1: Distribute fields by priority:'}
     - HIGH priority (Names): Top section (Y: 3-10mm), larger fonts (12-14pt)
     - MEDIUM priority: Available spaces ${addressInfo ? 'around ADDRESS' : '(Y: 10-35mm)'}
     - LOW priority (Codes/IDs): Bottom-right corner (Y: 40-46mm), smaller fonts (8-10pt)
   STEP 3: Maximize font sizes within spatial constraints
   STEP 4: Verify no wasted space >5mm exists

3. **Intelligent Font Sizing**
   - For multi-line fields (ADDRESS):
     * Formula: (allocated height in mm) / (number of lines) / (line-height) = target font size in mm
     * Convert mm to pt: 1mm ≈ 2.83pt
     * Example: 26mm / 5 lines / 1.3 = 4mm per line = ~11.3pt, but ROUND UP to 13-15pt to fill space
     * ⚠️ ALWAYS round UP to fill allocated space, never down (no tiny text in huge boxes!)
   - For single-line fields:
     * Analyze character count vs available width
     * Longer content = smaller fonts to fit
     * Shorter content = larger fonts for readability
   - All text MUST fit within allocated space without overflow

4. **Spatial Optimization**
   - Pair short fields horizontally to save vertical space
   - Stack longer fields vertically for readability
   - Total vertical space used must be < ${availableHeight}mm

5. **Visual Balance**
   - Create clear hierarchy through positioning and sizing
   - Professional, organized appearance
   - Adequate spacing between elements (minimum 2mm)

PRE-RETURN VALIDATION (YOU MUST VERIFY):
☐ All ${fieldNames.length} field names match EXACTLY from available list (not sample values)
☐ No field position.y + size.height exceeds ${templateSize.height - 3}mm
${addressInfo ? `☐ "${addressInfo.field}" occupies Y: 12-38mm range (50-60% vertical space)
☐ "${addressInfo.field}" has whiteSpace: "pre-line" and transformCommas: true` : ''}
☐ Total vertical space used < ${availableHeight}mm
☐ Font sizes are 8-20pt range
☐ No wasted space >5mm exists
☐ No fields overlap (check x/y/width/height combinations)

Return ONLY valid JSON in this exact format:
{
  "fields": [
    {
      "templateField": "EXACT_FIELD_NAME_FROM_LIST",
      "position": { "x": 3, "y": 3 },
      "size": { "width": 60, "height": 10 },
      "style": {
        "fontSize": 12,
        "fontWeight": "normal",
        "whiteSpace": "normal",
        "lineHeight": "1.0",
        "textAlign": "left",
        "transformCommas": false
      }
    }
  ]
}`;

    const userPrompt = `Design the optimal layout for this ${templateType} label.

Follow the EXACT STRATEGY outlined above:
${addressInfo ? `1. Place "${addressInfo.field}" at Y: 12-38mm FIRST (${addressInfo.lineCount} lines, ${addressInfo.longestLineChars} char longest line)
2. Distribute remaining fields in unused vertical spaces` : '1. Distribute fields by priority (HIGH at top, LOW at bottom)'}
3. Maximize font sizes within constraints
4. Ensure no wasted space >5mm

${addressInfo ? `⚠️ CRITICAL: "${addressInfo.field}" must occupy 50-60% of vertical space (Y: 12-38mm).
This is an address label - the address is THE STAR and must dominate the layout.` : ''}

⚠️ REMEMBER: 
- Use ONLY the EXACT field names from the "AVAILABLE FIELD NAMES" list
- Sample values are for SIZE REFERENCE ONLY - DO NOT use them as field names
- Verify all spatial constraints in the validation checklist before returning JSON

Design a complete, production-ready layout within ${availableWidth}mm × ${availableHeight}mm.`;

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
    // STEP 3: MINIMAL VALIDATION - Trust AI's reasoning, verify basics only
    // ============================================================================
    
    console.log('\n=== STEP 3: VALIDATING LAYOUT ===');
    
    const validationErrors: string[] = [];
    
    // 1. Check all fields are present
    const presentFields = new Set(layout.fields.map((f: any) => f.templateField));
    const missingFields = fieldNames.filter((f: string) => !presentFields.has(f));
    if (missingFields.length > 0) {
      validationErrors.push(`Missing fields: ${missingFields.join(', ')}`);
    }
    
    // 2. Validate physical constraints and ADDRESS requirements
    if (layout.fields) {
      for (const field of layout.fields) {
        // Check font size is sane (wider range to allow AI flexibility)
        if (field.style.fontSize < 6 || field.style.fontSize > 24) {
          validationErrors.push(
            `${field.templateField}: Font size ${field.style.fontSize}pt out of reasonable range (6-24pt)`
          );
        }
        
        // Check field fits within template bounds
        const rightEdge = field.position.x + field.size.width;
        const bottomEdge = field.position.y + field.size.height;
        
        if (rightEdge > templateSize.width) {
          const overflow = (rightEdge - templateSize.width).toFixed(1);
          validationErrors.push(
            `${field.templateField}: Exceeds right edge by ${overflow}mm (position ${field.position.x}mm + width ${field.size.width}mm = ${rightEdge.toFixed(1)}mm > ${templateSize.width}mm)`
          );
        }
        
        if (bottomEdge > templateSize.height) {
          const overflow = (bottomEdge - templateSize.height).toFixed(1);
          validationErrors.push(
            `${field.templateField}: Exceeds bottom edge by ${overflow}mm (position ${field.position.y}mm + height ${field.size.height}mm = ${bottomEdge.toFixed(1)}mm > ${templateSize.height}mm)`
          );
        }
        
        // Verify ADDRESS field has required formatting properties
        const isAddress = addressInfo && field.templateField === addressInfo.field;
        if (isAddress) {
          if (field.style.whiteSpace !== 'pre-line') {
            validationErrors.push(
              `${field.templateField}: ADDRESS field MUST use whiteSpace="pre-line" for multi-line rendering`
            );
          }
          if (!field.style.transformCommas) {
            validationErrors.push(
              `${field.templateField}: ADDRESS field should use transformCommas=true for comma-based line breaks`
            );
          }
        }
      }
    }
    
    if (validationErrors.length > 0) {
      console.error('❌ Layout validation failed:', validationErrors);
      console.error('📐 Debug - Total vertical space used:', 
        Math.max(...layout.fields.map((f: any) => f.position.y + f.size.height)).toFixed(1) + 'mm',
        'vs available:', availableHeight.toFixed(1) + 'mm'
      );
      throw new Error(`Layout validation failed:\n${validationErrors.join('\n')}`);
    }
    
    console.log('✅ Layout validation passed');

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
