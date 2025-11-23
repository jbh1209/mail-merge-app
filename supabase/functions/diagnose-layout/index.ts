import "https://deno.land/x/xhr@0.3.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      failedLayoutImage, // base64 encoded image
      fieldData,         // original field data sent to layout AI
      failedLayout,      // the JSON layout that was generated
      templateSize       // { width: number, height: number }
    } = await req.json();

    console.log('🔍 Starting layout diagnosis...');
    console.log('Field data:', fieldData);
    console.log('Template size:', templateSize);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Build diagnostic prompt
    const diagnosticPrompt = `You are analyzing a FAILED label layout that you (or another AI) previously generated.

CONTEXT:
Template Size: ${templateSize.width}mm × ${templateSize.height}mm
Usable Space: ~95.6mm × 44.8mm (accounting for margins)

FIELDS THAT SHOULD HAVE BEEN LAID OUT:
${fieldData.map((f: any) => `- Field Name: "${f.field}" (EXACT name, must not be changed)
  Sample Value: "${f.sampleValue}"
  Type: ${f.fieldType}
  Max Characters: ${f.maxCharacters}
  ${f.lineCount ? `Lines: ${f.lineCount}` : ''}
  Priority: ${f.priority}`).join('\n')}

THE FAILED LAYOUT (see attached image):
This is what was actually generated and rendered on the label.

FAILED LAYOUT JSON:
${JSON.stringify(failedLayout, null, 2)}

ANALYSIS REQUIRED:
1. **Mystery Fields**: Where did any unexpected field names come from? (e.g., "Mthetheleli", "1", etc.)
2. **ADDRESS Placement**: Why is the ADDRESS field not dominant? It should occupy 50-60% of vertical space.
3. **Space Utilization**: Why is there wasted white space? Where did the calculations go wrong?
4. **Missing Information**: What specific information was MISSING from the original prompt that caused this failure?
5. **Constraint Gaps**: What constraints or examples would have prevented this failure?
6. **Prompt Structure**: What is the OPTIMAL way to structure a prompt for label layout generation?

CRITICAL: Your analysis will be used to redesign the prompt, so be specific about:
- What rules should be ABSOLUTE (e.g., "use ONLY provided field names")
- What spatial constraints should be EXPLICIT (e.g., "ADDRESS must occupy Y: 15-40mm")
- What validation steps the AI should perform BEFORE returning JSON
- What examples or reference structures would help

Return your analysis in this EXACT JSON structure:
{
  "failures": [
    { 
      "issue": "specific problem observed",
      "likely_cause": "why this happened",
      "severity": "critical|high|medium|low"
    }
  ],
  "missing_information": [
    "specific information that was missing from the prompt"
  ],
  "recommended_prompt_structure": {
    "critical_rules": [
      "absolute rules that must be followed (e.g., field name constraints)"
    ],
    "spatial_specifications": [
      "explicit spatial requirements (e.g., ADDRESS Y range: 15-40mm)"
    ],
    "validation_checkpoints": [
      "what the AI should verify before returning JSON"
    ],
    "helpful_context": [
      "additional context that would improve results"
    ]
  },
  "suggested_constraints": {
    "field_naming": "how to ensure correct field names",
    "space_allocation": "how to ensure proper space distribution",
    "priority_enforcement": "how to ensure high-priority fields are prominent",
    "physical_constraints": "how to ensure everything fits within bounds"
  },
  "example_prompt_snippet": "Show an example of a well-structured prompt section"
}`;

    // Call Gemini 2.5 Flash with vision
    console.log('📞 Calling Gemini 2.5 Flash for diagnostic analysis...');
    
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: diagnosticPrompt },
              {
                type: 'image_url',
                image_url: {
                  url: failedLayoutImage.startsWith('data:') 
                    ? failedLayoutImage 
                    : `data:image/png;base64,${failedLayoutImage}`
                }
              }
            ]
          }
        ],
        response_format: { type: 'json_object' }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Gemini API error:', response.status, errorText);
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    const diagnosticText = result.choices[0].message.content;
    
    console.log('✅ Received diagnostic analysis');

    // Parse the JSON response
    let diagnostic;
    try {
      diagnostic = JSON.parse(diagnosticText);
    } catch (parseError) {
      console.error('❌ Failed to parse diagnostic JSON:', diagnosticText);
      throw new Error('AI returned invalid JSON');
    }

    console.log('📋 Diagnostic Summary:');
    console.log(`- Failures identified: ${diagnostic.failures?.length || 0}`);
    console.log(`- Missing information items: ${diagnostic.missing_information?.length || 0}`);
    console.log(`- Critical rules suggested: ${diagnostic.recommended_prompt_structure?.critical_rules?.length || 0}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        diagnostic,
        message: 'Layout diagnosis complete. Review the diagnostic to improve the suggest-layout prompt.'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Diagnostic error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
