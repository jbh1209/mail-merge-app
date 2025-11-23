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

    // Phase 1: Calculate Space Budget and Pairings
    const availableHeight = templateSize.height - 6; // margins
    const fieldCount = fieldNames.length;
    
    // Define base space allocation priorities
    const baseAllocation: Record<string, { priority: string; minHeight: number; maxHeight: number }> = {
      'STORE NAME': { priority: 'high', minHeight: 7, maxHeight: 10 },
      'ADDRESS': { priority: 'critical', minHeight: 15, maxHeight: 25 },
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

    const prompt = `You are an expert label designer solving a CONSTRAINT SATISFACTION PROBLEM.

HARD CONSTRAINTS:
- Label dimensions: ${templateSize.width}mm × ${templateSize.height}mm
- Available vertical space: ${availableHeight}mm (after margins)
- Number of fields to place: ${fieldCount}
- ALL ${fieldCount} fields MUST appear - NO OMISSIONS ALLOWED
- Coordinate system: (0,0) is top-left corner
- 3mm margins required on all sides

MANDATORY SPACE ALLOCATION:
You have ${availableHeight}mm vertical space to allocate across ${fieldCount} fields.

Each field has been assigned a MAXIMUM HEIGHT BUDGET (includes text + line spacing):
${Object.entries(calculatedBudgets).map(([field, budget]) => 
  `- ${field}: MAX ${budget}mm height`
).join('\n')}

${validPairings.length > 0 ? `
HORIZONTAL PAIRING REQUIREMENTS (MANDATORY):
The following field pairs MUST be placed side-by-side on the same row to save vertical space:
${validPairings.map(p => 
  `- ${p.fields.join(' + ')} on same row (y-coordinates must match, saves ~${p.saves}mm)`
).join('\n')}

By pairing these fields, you save approximately ${validPairings.reduce((s, p) => s + p.saves, 0)}mm of vertical space.
` : ''}

CONSTRAINT SATISFACTION RULES:
1. ALL ${fieldCount} fields MUST appear in the layout
2. Each field MUST fit within its allocated height budget
3. Paired fields MUST share the same y-coordinate (same row)
4. Total layout height MUST NOT exceed ${availableHeight}mm
5. Minimum 2mm gap between all field edges (horizontal and vertical)
6. Fields must not overlap
7. All fields must be within label boundaries (3mm margins)

TO ACHIEVE THIS YOU MUST:
- Adjust font sizes DOWN if needed to fit within height budgets
- Use lineHeight: 1.1 for multi-line ADDRESS fields to save space
- Distribute horizontal space efficiently for paired fields (e.g., 60/40 split for NAME/POSTER)
- Prioritize readability WITHIN the constraints, not at expense of constraints
- Calculate positions carefully to respect all gaps and budgets

THIS IS A HARD CONSTRAINT PROBLEM - you must make everything fit.

FIELD DATA ANALYSIS:
${dataAnalysis.map((d: any, i: number) => {
  const text = d.sampleText || 'N/A';
  const estimatedLines = d.hasCommas ? (text.match(/,/g) || []).length + 1 : 1;
  
  return `Field "${d.field}" [Type: ${d.fieldType}]:
   Sample text: "${text}"
   ${d.hasCommas ? `Full character count: ${d.maxLength} chars
   Longest line after comma-split: ${d.maxLineLength} chars ← USE THIS FOR SIZING
   Estimated line count: ~${estimatedLines} lines ← ALLOCATE VERTICAL SPACE ACCORDINGLY` : `Character count: ${d.maxLength} chars`}
   Contains commas: ${d.hasCommas ? 'Yes - will render as multi-line with semantic breaks' : 'No'}
   **SUGGESTED FONT SIZE: ${d.suggestedFontSize}pt** (pre-calculated to fit ALL ${sampleData?.length || 0} data rows)
   ${d.hasCommas ? `⚠️ MULTI-LINE FIELD: Requires ~${Math.ceil(estimatedLines * d.suggestedFontSize * 1.2 * 0.35)}mm vertical space` : ''}`;
}).join('\n\n')}

FONT SIZE & SEMANTIC GUIDANCE:
${dataAnalysis.map((d: any) => 
  `- "${d.field}" [${d.fieldType}]: ${d.suggestedFontSize}pt (calculated for ${d.hasCommas ? 'longest line (' + d.maxLineLength + ' chars)' : 'full text (' + d.maxLength + ' chars)'})`
).join('\n')}

SPACE CONSTRAINT ANALYSIS:
Label dimensions: ${templateSize.width}mm × ${templateSize.height}mm
Total fields to place: ${fieldNames.length}
Available vertical space: ${templateSize.height - 4}mm (after margins)
Estimated minimum vertical space needed: Calculate sum of all field heights + gaps
If total exceeds label height → Apply space-saving strategies below

FIELD TYPE DESIGN PRINCIPLES:
- ADDRESS: Multi-line content with comma breaks (5+ lines common), requires SIGNIFICANT vertical space allocation
  **CRITICAL: ADDRESS fields MUST use whiteSpace: 'pre-line' and transformCommas: true to enable semantic line breaks**
  Font size: 9-13pt (calculated per longest line, NOT artificially reduced)
  Space priority: HIGH - allocate vertical space proportional to line count
  Positioning: Middle area with clear breathing room above/below
- NAME: Primary identifier, should be prominent and eye-catching (12-16pt), top placement preferred
- CODE: Machine-readable emphasis, often monospace consideration, compact but scannable (10-14pt), high visibility area
- PROVINCE/CITY: Secondary location info, medium prominence (10-13pt), often grouped with address
- DATE: Compact format, typically corner/edge placement (9-12pt), less emphasis unless critical
- PRICE: Bold/prominent for retail contexts, right-aligned common (11-14pt), high visibility
- QUANTITY: Small but clear, paired with units (9-12pt), near related fields
- EMAIL/PHONE: Contact details, small footer text (8-11pt), bottom placement typical
- GENERAL: Balance readability with available context (10-13pt), flexible placement

DESIGN PRIORITIES & PLACEMENT STRATEGY:

**For labels with HEIGHT > 70mm (ample vertical space):**
- Use clear row separation with 2-3mm gaps
- Generous whitespace, larger fonts

**For labels with HEIGHT 40-70mm (moderate space like 50.8mm labels):**

Row 1 (y: 3-10mm): 
  • STORE NAME (left, bold) + A0 POSTER (right corner, bold) [HORIZONTAL PAIR]
  • Total width must fit: NAME_width + 3mm gap + POSTER_width ≤ label width

Row 2 (y: 12-19mm):
  • STORE CODE (left) + PROVINCE (right) [HORIZONTAL PAIR]
  • Clear left-right separation

Row 3 (y: 21-27mm):
  • STORE AREA (full width OR omit if space critical)

Row 4 (y: 29-46mm): **PRIORITY SPACE**
  • ADDRESS (multi-line, significant height allocation)
  • Calculate height: line_count × fontSize × 1.1 lineHeight × 0.35mm
  • Font size: 9-11pt based on longest line length

Row 5 (y: 47-50mm): **IF SPACE PERMITS**
  • AREA MANAGER (compact, 14pt font)
  • If ADDRESS + margins exceed y=45mm, consider omitting this row

**Horizontal Pairing Rules:**
- Two fields can share a row if: field1_width + 3mm + field2_width ≤ label_width
- Always keep 3mm minimum horizontal gap
- Typical pairing: short codes on same row (CODE + PROVINCE, MANAGER + POSTER)

SPACE ALLOCATION FOR MULTI-LINE FIELDS:
When a field will render as multiple lines (e.g., ADDRESS with commas):
1. Calculate required height: (line_count × fontSize × lineHeight) + padding
2. Example: 5-line address at 11pt with lineHeight 1.2 = ~20mm height minimum
3. Allocate proportionally MORE vertical space than single-line fields
4. Do NOT compensate by reducing font size - maintain readability

Multi-line fields are SPACE-INTENSIVE and should be treated as high-priority for area allocation.

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

CRITICAL SPATIAL RULES:
• MINIMUM SPACING: Leave at least 2mm gap between ALL field edges (horizontal and vertical)
• OVERLAP DETECTION: Before finalizing, mentally verify:
  - Does field A's right edge (x + width) stay 2mm left of field B's left edge?
  - Does field A's bottom edge (y + height) stay 2mm above field B's top edge?
  - Or are they vertically/horizontally separated?
• LAYOUT STRATEGY:
  - Use a visual grid: Imagine the label divided into rows (top, upper-middle, middle, lower-middle, bottom)
  - Assign fields to different rows to avoid horizontal collisions
  - For fields in the same row, ensure they don't exceed combined width: sum(widths) + gaps < label width
  
EXAMPLE COLLISION AVOIDANCE:
❌ BAD: NAME (x:3, w:95.6) overlaps POSTER (x:83.6, w:15) → both at y:4, NAME extends to 98.6mm
✅ GOOD: NAME (x:3, w:70) | 2mm gap | POSTER (x:75, w:15) → clear separation at y:4

OR

✅ GOOD: NAME (x:3, w:95.6, y:4) on top row, POSTER (x:80, w:15, y:15) on different row

MANDATORY SPACE ALLOCATION SYSTEM:

ALL fields MUST appear in the final layout - NO OMISSIONS ALLOWED.

When vertical space is constrained, you MUST:
1. Calculate exact space budget for each field
2. Use horizontal pairing to save vertical space
3. Adjust font sizes DOWN to fit within budgets
4. Use compact line heights (1.1) for multi-line fields

The space budget and pairing requirements will be provided in the data section below.
These are HARD CONSTRAINTS that must be satisfied.

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
   - whiteSpace: "pre-line" (ADDRESS fields - preserves newlines) | "normal" (multi-line wrapping) | "nowrap" (single line)
   - wordWrap: "break-word" (if multi-line) or "normal" (if single line)
   - lineHeight: "1.2" (multi-line readability) or "1" (compact single line)
   - display: "block" (for multi-line) or "inline" (for compact single line)
   - fontWeight: "normal" or "bold" (for emphasis)
   - textAlign: "left", "center", or "right" (for layout balance)
   - transformCommas: true (ADDRESS fields ONLY - converts commas to newlines for semantic breaks)

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
        "whiteSpace": "pre-line" | "normal" | "nowrap",
        "wordWrap": "break-word" | "normal",
        "lineHeight": "1.2" | "1",
        "display": "block" | "inline",
        "transformCommas": true | false  // SET TO true FOR ADDRESS FIELDS ONLY
      }
    }
  ],
  "layoutStrategy": "Explain your design thinking: What did you make prominent? Why? How did you handle the address? What was your spatial strategy?",
  "confidence": <0-100>
}
}`;


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
        const validWhiteSpace = ['normal', 'nowrap', 'pre-line'];
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
        const transformCommas = Boolean(field.style.transformCommas);
        
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
    
    // Check height budgets
    for (const field of layout.fields) {
      const budget = calculatedBudgets[field.templateField];
      if (budget && field.size.height > budget + 1) { // 1mm tolerance
        validationErrors.push(`${field.templateField} exceeds height budget: ${field.size.height.toFixed(1)}mm > ${budget}mm`);
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
