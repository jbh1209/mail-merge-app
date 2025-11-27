import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";
import { corsHeaders } from "../_shared/cors.ts";

// Detect field types for semantic analysis
function detectFieldType(fieldName: string, sampleValues: string[]): string {
  const name = fieldName.toLowerCase();
  const samples = sampleValues.map(v => String(v).toLowerCase());
  
  if (name.includes('address') || name.includes('location') || name.includes('street')) return 'ADDRESS';
  if (samples.some(v => v.includes(',') && v.length > 30)) return 'ADDRESS';
  if (name.includes('name') || name.includes('customer') || name.includes('recipient')) return 'NAME';
  if (name.includes('code') || name.includes('sku') || name.includes('barcode') || name.includes('id')) return 'CODE';
  if (name.includes('province') || name.includes('state') || name.includes('region')) return 'PROVINCE';
  if (name.includes('qty') || name.includes('quantity') || name.includes('count')) return 'QUANTITY';
  if (name.includes('price') || name.includes('amount') || name.includes('cost')) return 'PRICE';
  
  return 'GENERAL';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) throw new Error('No authorization header');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { fieldNames, sampleData, templateSize, labelAnalysis } = await req.json();

    if (!fieldNames || !Array.isArray(fieldNames) || fieldNames.length === 0) {
      throw new Error('Field names are required');
    }

    if (!templateSize?.width || !templateSize?.height) {
      throw new Error('Template size is required');
    }

    console.log('Generating design strategy for:', {
      fields: fieldNames.length,
      template: `${templateSize.width}mm × ${templateSize.height}mm`,
      layoutMode: labelAnalysis?.layoutMode,
      isStandardAddress: labelAnalysis?.isStandardAddress
    });

    // Check if this is a standard address label - use combined block layout
    if (labelAnalysis?.isStandardAddress && labelAnalysis?.layoutMode === 'combined_address_block') {
      console.log('📮 Standard address detected - using combined block layout');
      
      return new Response(
        JSON.stringify({
          designStrategy: {
            strategy: 'combined_address_block',
            regions: {
              main: {
                fields: fieldNames,
                layout: 'stacked_inline',
                verticalAllocation: 1.0,
                priority: 'highest'
              }
            },
            typography: fieldNames.reduce((acc: any, field: string) => {
              acc[field] = { weight: 'normal', importance: 'high' };
              return acc;
            }, {})
          }
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    // Analyze fields
    const fieldAnalysis = fieldNames.map(fieldName => {
      const samples = sampleData ? sampleData.slice(0, 5).map((row: any) => String(row[fieldName] || '')) : [];
      const type = detectFieldType(fieldName, samples);
      const maxLength = Math.max(...samples.map((s: string) => s.length));
      const avgLength = samples.reduce((sum: number, s: string) => sum + s.length, 0) / samples.length;
      
      return {
        fieldName,
        type,
        maxLength,
        avgLength,
        sampleValue: samples[0] || fieldName
      };
    });

    // Build AI prompt (high-level strategy only, NO coordinates)
    const systemPrompt = `You are a professional label design strategist. Your job is to decide the high-level layout structure, NOT to calculate coordinates.

Output a JSON design strategy with:
1. Overall strategy name
2. Regions (header, body, footer) with field allocations
3. Typography hints (weight, importance)

CRITICAL: You MUST use the EXACT field names provided. Do NOT change them, simplify them, or use generic labels.

DO NOT output coordinates, font sizes, or measurements. The rules engine handles that.`;

    const userPrompt = `Design a professional label layout strategy:

TEMPLATE SIZE: ${templateSize.width}mm × ${templateSize.height}mm

FIELDS TO LAYOUT (USE THESE EXACT NAMES):
${fieldAnalysis.map(f => `- "${f.fieldName}" (type: ${f.type}): sample="${f.sampleValue}" [avg: ${Math.round(f.avgLength)} chars]`).join('\n')}

DESIGN PRINCIPLES:
1. ADDRESS-type fields should dominate (50-60% of vertical space)
2. Important fields (NAME, CODE types) should be prominent in header
3. Less important fields (QUANTITY, PROVINCE types) go in footer
4. Group short, related fields horizontally to save space
5. Use vertical space efficiently - no large gaps
6. FOOTER LAYOUT: Prefer "horizontal_split" or "three_column" for short fields (≤15 chars). Only use "stacked" if many fields (4+) or long content (>20 chars)

OUTPUT FORMAT (JSON):
{
  "strategy": "address_dominant_with_header" | "grid_layout" | "hierarchical",
  "regions": {
    "header": {
      "fields": ["EXACT_FIELD_NAME_1", "EXACT_FIELD_NAME_2"],
      "layout": "horizontal_split" | "single_dominant" | "stacked" | "two_column" | "three_column",
      "verticalAllocation": 0.15,
      "priority": "high" | "medium" | "low"
    },
    "body": {
      "fields": ["EXACT_FIELD_NAME_3"],
      "layout": "single_dominant",
      "verticalAllocation": 0.6,
      "priority": "highest"
    },
    "footer": {
      "fields": ["EXACT_FIELD_NAME_4", "EXACT_FIELD_NAME_5"],
      "layout": "three_column",
      "verticalAllocation": 0.15,
      "priority": "low"
    }
  },
  "typography": {
    "EXACT_FIELD_NAME_1": { "weight": "bold", "importance": "high" },
    "EXACT_FIELD_NAME_2": { "weight": "normal", "importance": "medium" },
    "EXACT_FIELD_NAME_3": { "weight": "normal", "importance": "highest" }
  }
}

CRITICAL RULES:
- Use EXACT field names as provided above (e.g., "STORE NAME", not "NAME")
- verticalAllocation values must sum to ≤ 1.0
- Allocate 50-60% to ADDRESS-type fields if present
- Distribute remaining space proportionally
- Use "horizontal_split" for 2 short fields side-by-side
- Use "three_column" for 3 short fields in footer (preferred over stacked)
- Use "single_dominant" for ADDRESS-type or long text fields
- FOOTER: Default to horizontal layouts ("horizontal_split" or "three_column") unless 4+ fields or long text`;

    // Call Lovable AI
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        response_format: { type: "json_object" }
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', errorText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiResult = await aiResponse.json();
    const designStrategy = JSON.parse(aiResult.choices[0].message.content);

    console.log('Generated design strategy:', designStrategy);

    // Validate strategy
    if (!designStrategy.regions || !designStrategy.typography) {
      throw new Error('Invalid design strategy from AI');
    }

    // Validate that all fields in the strategy match the input field names
    const inputFieldNames = new Set(fieldNames);
    const strategyFieldNames = new Set<string>();
    
    Object.values(designStrategy.regions).forEach((region: any) => {
      if (region.fields && Array.isArray(region.fields)) {
        region.fields.forEach((fieldName: string) => strategyFieldNames.add(fieldName));
      }
    });

    const invalidFields = Array.from(strategyFieldNames).filter(name => !inputFieldNames.has(name));
    if (invalidFields.length > 0) {
      console.error('AI returned invalid field names:', invalidFields);
      console.error('Expected field names:', Array.from(inputFieldNames));
      throw new Error(`AI used incorrect field names: ${invalidFields.join(', ')}. Must use exact names from input.`);
    }

    // Check vertical allocation sums
    const totalAllocation = Object.values(designStrategy.regions).reduce(
      (sum: number, region: any) => sum + region.verticalAllocation, 0
    );
    
    if (totalAllocation > 1.05) {
      console.warn('Vertical allocation exceeds 100%, normalizing...');
      // Normalize allocations
      Object.keys(designStrategy.regions).forEach(key => {
        designStrategy.regions[key].verticalAllocation /= totalAllocation;
      });
    }

    return new Response(
      JSON.stringify({ designStrategy }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Error in design-with-ai:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        details: error instanceof Error ? error.stack : undefined
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
