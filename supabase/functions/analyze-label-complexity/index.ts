import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fieldNames, sampleData, templateType } = await req.json();

    console.log('🔍 Analyzing label complexity', {
      fieldCount: fieldNames?.length,
      templateType,
      hasData: !!sampleData
    });

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Build analysis prompt
    const systemPrompt = `You are a label design expert. Analyze label layouts to determine complexity and optimal settings.

Complexity Scoring (0-100):
- SIMPLE (0-30): Standard formats users recognize (address, name tag, shipping)
  → Examples: name, address, city, state, zip, phone, email
  → Labels: NOT needed (users know what fields mean)
  → Layout: COMBINED BLOCK (single stacked text block, no borders)

- MODERATE (31-60): Mix of standard + custom fields
  → Examples: SKU, product code, price, quantity mixed with names/addresses
  → Labels: SELECTIVE (only for non-obvious fields)
  → Layout: SEPARATE FIELDS with selective labels

- COMPLEX (61-100): Unusual business-specific fields
  → Examples: STORE CODE, AREA MANAGER, PROVINCE, DEPT ID, custom codes
  → Labels: NEEDED (users won't know what fields mean)
  → Layout: SEPARATE FIELDS with all labels

Standard Address Pattern Detection:
- Must have 4+ of these field types: name, address/street, city/town, state/county/province, zip/postcode
- Should be rendered as a SINGLE combined text block (like an address on an envelope)
- layoutMode: "combined_address_block" (NOT "separate_fields")

Consider:
1. Field name patterns (standard vs custom/cryptic)
2. User familiarity (everyone knows "address" but not "DEPT CODE")
3. Business specificity (generic vs company-specific terminology)
4. Data format (simple text vs codes/IDs)
5. Whether this is a standard address label (should be single text block)

Respond ONLY with valid JSON matching this structure:
{
  "complexityScore": 25,
  "shouldShowLabels": false,
  "layoutMode": "combined_address_block",
  "isStandardAddress": true,
  "fieldImportance": {
    "name": "critical",
    "address": "critical",
    "city": "supporting"
  },
  "reasoning": "Standard address label - render as single combined text block",
  "dataQualityCheck": {
    "hasRealData": true,
    "missingFields": [],
    "fieldCoverage": 100
  }
}`;

    const userPrompt = `Analyze this label layout:

Template Type: ${templateType || 'custom'}
Fields: ${JSON.stringify(fieldNames)}
Sample Data: ${JSON.stringify(sampleData || {})}

Determine complexity score, whether to show labels, and field importance.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
        temperature: 0.3
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      
      // Fallback to simple heuristic
      const addressFieldPatterns = [
        /^(name|first.*name|last.*name|full.*name)/i,
        /^(address|address.*line|street)/i,
        /^(city|town)/i,
        /^(state|county|province|region)/i,
        /^(zip|postcode|postal)/i
      ];
      
      const matchCount = fieldNames.filter((f: string) => 
        addressFieldPatterns.some(p => p.test(f))
      ).length;
      
      const isStandardAddress = matchCount >= 4 && fieldNames.length <= 7;
      
      return new Response(
        JSON.stringify({
          complexityScore: isStandardAddress ? 20 : 50,
          shouldShowLabels: !isStandardAddress,
          layoutMode: isStandardAddress ? 'combined_address_block' : 'separate_fields',
          isStandardAddress,
          fieldImportance: fieldNames.reduce((acc: any, f: string) => {
            acc[f] = 'critical';
            return acc;
          }, {}),
          reasoning: isStandardAddress 
            ? 'Standard address label - render as single combined text block'
            : 'Fallback analysis (AI unavailable)',
          dataQualityCheck: {
            hasRealData: !!sampleData,
            missingFields: [],
            fieldCoverage: 100
          }
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    // Parse JSON response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('AI response did not contain valid JSON');
    }

    const analysis = JSON.parse(jsonMatch[0]);

    console.log('✓ Complexity analysis complete:', {
      score: analysis.complexityScore,
      showLabels: analysis.shouldShowLabels,
      reasoning: analysis.reasoning
    });

    return new Response(
      JSON.stringify(analysis),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Error in analyze-label-complexity:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        details: error instanceof Error ? error.stack : undefined
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
