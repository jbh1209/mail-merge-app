import "https://deno.land/x/xhr@0.1.0/mod.ts";
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
    const { dataColumns, templateFields, sampleData } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const prompt = `You are a data mapping assistant. Analyze the data columns and template fields, then suggest the best mappings.

DATA COLUMNS (from uploaded file):
${JSON.stringify(dataColumns, null, 2)}

TEMPLATE FIELDS (available in template):
${JSON.stringify(templateFields, null, 2)}

SAMPLE DATA (first 3 rows):
${JSON.stringify(sampleData, null, 2)}

TASK:
Create a mapping between data columns and template fields. For each template field, suggest which data column should be used.

RULES:
1. Match based on semantic meaning (e.g., "customer_name" → "name", "email_address" → "email")
2. Consider data types and formats
3. Assign confidence scores (0-100)
4. Some template fields may not have a match (confidence = 0)
5. Multiple data columns can map to the same template field if it makes sense (e.g., first_name + last_name → full_name)

Return a JSON array with this structure:
[
  {
    "templateField": "name",
    "dataColumn": "customer_name",
    "confidence": 95,
    "reasoning": "Direct semantic match for customer name"
  }
]`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a helpful data mapping assistant. Always respond with valid JSON only." },
          { role: "user", content: prompt }
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI API Error:", response.status, errorText);
      throw new Error(`AI API failed: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = data.choices[0].message.content;
    
    // Parse AI response (handle markdown code blocks)
    let mappings;
    try {
      const jsonMatch = aiResponse.match(/```json\s*([\s\S]*?)\s*```/) || 
                       aiResponse.match(/\[[\s\S]*\]/);
      const jsonString = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : aiResponse;
      mappings = JSON.parse(jsonString);
    } catch (parseError) {
      console.error("Failed to parse AI response:", aiResponse);
      throw new Error("AI returned invalid JSON format");
    }

    // Calculate overall confidence score
    const avgConfidence = mappings.length > 0
      ? mappings.reduce((sum: number, m: any) => sum + m.confidence, 0) / mappings.length
      : 0;

    return new Response(
      JSON.stringify({ 
        mappings,
        overallConfidence: Math.round(avgConfidence)
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in suggest-field-mappings:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
