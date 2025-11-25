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

- MODERATE (31-60): Mix of standard + custom fields
  → Examples: SKU, product code, price, quantity mixed with names/addresses
  → Labels: SELECTIVE (only for non-obvious fields)

- COMPLEX (61-100): Unusual business-specific fields
  → Examples: STORE CODE, AREA MANAGER, PROVINCE, DEPT ID, custom codes
  → Labels: NEEDED (users won't know what fields mean)

Consider:
1. Field name patterns (standard vs custom/cryptic)
2. User familiarity (everyone knows "address" but not "DEPT CODE")
3. Business specificity (generic vs company-specific terminology)
4. Data format (simple text vs codes/IDs)

Respond ONLY with valid JSON matching this structure:
{
  "complexityScore": 25,
  "shouldShowLabels": false,
  "fieldImportance": {
    "name": "critical",
    "address": "critical",
    "city": "supporting"
  },
  "reasoning": "Standard address label with familiar fields",
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
      const isSimpleAddress = fieldNames.some((f: string) => 
        /address|city|state|zip|postal|street/i.test(f)
      );
      
      return new Response(
        JSON.stringify({
          complexityScore: isSimpleAddress ? 25 : 50,
          shouldShowLabels: !isSimpleAddress,
          fieldImportance: fieldNames.reduce((acc: any, f: string) => {
            acc[f] = 'critical';
            return acc;
          }, {}),
          reasoning: 'Fallback analysis (AI unavailable)',
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
