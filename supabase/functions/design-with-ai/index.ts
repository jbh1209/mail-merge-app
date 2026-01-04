import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";
import { corsHeaders } from "../_shared/cors.ts";

// Detect field types for semantic analysis
function detectFieldType(fieldName: string, sampleValues: string[]): string {
  const name = fieldName.toLowerCase();
  const samples = sampleValues.map(v => String(v).toLowerCase());
  
  // Image detection
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'];
  if (name.includes('image') || name.includes('photo') || name.includes('logo') || 
      name.includes('picture') || name.includes('img') || name.includes('avatar')) {
    return 'IMAGE';
  }
  if (samples.some(v => imageExtensions.some(ext => v.endsWith(ext)) || v.startsWith('http'))) {
    return 'IMAGE';
  }
  
  if (name.includes('address') || name.includes('location') || name.includes('street')) return 'ADDRESS';
  if (samples.some(v => v.includes(',') && v.length > 30)) return 'ADDRESS';
  if (name.includes('name') || name.includes('customer') || name.includes('recipient')) return 'NAME';
  if (name.includes('code') || name.includes('sku') || name.includes('barcode') || name.includes('id')) return 'CODE';
  if (name.includes('province') || name.includes('state') || name.includes('region')) return 'PROVINCE';
  if (name.includes('qty') || name.includes('quantity') || name.includes('count')) return 'QUANTITY';
  if (name.includes('price') || name.includes('amount') || name.includes('cost')) return 'PRICE';
  if (name.includes('title') || name.includes('company') || name.includes('org')) return 'TITLE';
  if (name.includes('desc') || name.includes('note')) return 'DESCRIPTION';
  
  return 'GENERAL';
}

// Infer image aspect ratio from field name
function inferImageAspectRatio(fieldName: string): { width: number; height: number } {
  const name = fieldName.toLowerCase();
  // Logos, avatars, icons are typically square
  if (name.includes('logo') || name.includes('avatar') || name.includes('icon') || name.includes('qr')) {
    return { width: 1, height: 1 };
  }
  // Photos are typically 3:2 landscape
  return { width: 3, height: 2 };
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

    console.log('🎨 Generating design strategy for:', {
      fields: fieldNames.length,
      template: `${templateSize.width}mm × ${templateSize.height}mm`,
      layoutMode: labelAnalysis?.layoutMode,
      isStandardAddress: labelAnalysis?.isStandardAddress
    });

    // Analyze all fields including images
    const fieldAnalysis = fieldNames.map(fieldName => {
      const samples = sampleData ? sampleData.slice(0, 5).map((row: any) => String(row[fieldName] || '')) : [];
      const type = detectFieldType(fieldName, samples);
      const maxLength = Math.max(...samples.map((s: string) => s.length), 0);
      const avgLength = samples.length > 0 ? samples.reduce((sum: number, s: string) => sum + s.length, 0) / samples.length : 0;
      
      return {
        fieldName,
        type,
        maxLength,
        avgLength,
        sampleValue: samples[0] || fieldName,
        aspectRatio: type === 'IMAGE' ? inferImageAspectRatio(fieldName) : null
      };
    });

    // Separate image fields from text fields
    const imageFields = fieldAnalysis.filter(f => f.type === 'IMAGE');
    const textFields = fieldAnalysis.filter(f => f.type !== 'IMAGE');
    const hasImages = imageFields.length > 0;

    console.log('📊 Field analysis:', {
      total: fieldAnalysis.length,
      images: imageFields.length,
      text: textFields.length
    });

    // Check if this is a standard address label - use combined block layout
    if (labelAnalysis?.isStandardAddress && labelAnalysis?.layoutMode === 'combined_address_block') {
      console.log('📮 Standard address detected - using combined block layout');
      
      const textFieldNames = textFields.map(f => f.fieldName);
      
      return new Response(
        JSON.stringify({
          designStrategy: {
            strategy: 'combined_address_block',
            regions: {
              main: {
                fields: textFieldNames,
                layout: 'stacked_inline',
                verticalAllocation: 1.0,
                priority: 'highest'
              }
            },
            typography: textFieldNames.reduce((acc: any, field: string) => {
              acc[field] = { weight: 'normal', importance: 'high' };
              return acc;
            }, {}),
            // NEW: Structured layout spec for direct client application
            layoutSpec: {
              layoutType: hasImages ? 'split_text_left_image_right' : 'text_only',
              textArea: {
                xPercent: 0.05,
                yPercent: 0.05,
                widthPercent: hasImages ? 0.60 : 0.90,
                heightPercent: 0.90
              },
              imageArea: hasImages ? {
                xPercent: 0.68,
                yPercent: 0.10,
                widthPercent: 0.27,
                heightPercent: 0.80,
                aspectRatio: imageFields[0]?.aspectRatio || { width: 3, height: 2 }
              } : null,
              images: imageFields.map(f => ({
                fieldName: f.fieldName,
                aspectRatio: f.aspectRatio
              })),
              gap: 0.03 // 3% gap between text and image
            }
          }
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    // Build AI prompt (high-level strategy only, NO coordinates)
    const systemPrompt = `You are a professional label design strategist. Your job is to decide the high-level layout structure, NOT to calculate coordinates.

Output a JSON design strategy with:
1. Overall strategy name
2. Regions (header, body, footer) with field allocations
3. Typography hints (weight, importance)
4. A layoutSpec object with percentage-based areas for text and images

CRITICAL: You MUST use the EXACT field names provided. Do NOT change them, simplify them, or use generic labels.
CRITICAL: Image fields should NOT be placed in regions - they are handled separately via layoutSpec.imageArea.

DO NOT output coordinates, font sizes, or measurements. The rules engine handles that.`;

    const userPrompt = `Design a professional label layout strategy:

TEMPLATE SIZE: ${templateSize.width}mm × ${templateSize.height}mm (aspect ratio: ${(templateSize.width / templateSize.height).toFixed(2)})

TEXT FIELDS TO LAYOUT (USE THESE EXACT NAMES):
${textFields.map(f => `- "${f.fieldName}" (type: ${f.type}): sample="${f.sampleValue}" [avg: ${Math.round(f.avgLength)} chars]`).join('\n')}

IMAGE FIELDS (handled separately - DO NOT include in regions):
${imageFields.length > 0 ? imageFields.map(f => `- "${f.fieldName}" (aspect: ${f.aspectRatio?.width}:${f.aspectRatio?.height})`).join('\n') : '(none)'}

DESIGN PRINCIPLES:
1. ${hasImages ? 'TEXT GOES LEFT, IMAGE GOES RIGHT - allocate ~65% width for text, ~30% for image' : 'Use full width for text'}
2. ADDRESS-type fields should dominate (50-60% of vertical space)
3. Important fields (NAME, TITLE, CODE types) should be prominent at top
4. Less important fields (QUANTITY, PROVINCE types) go at bottom
5. Group short, related fields horizontally to save space
6. Use vertical space efficiently - no large gaps
7. FOOTER LAYOUT: Prefer "horizontal_split" or "three_column" for short fields (≤15 chars)

OUTPUT FORMAT (JSON):
{
  "strategy": "professional_${hasImages ? 'with_image' : 'text_only'}",
  "regions": {
    "header": {
      "fields": ["EXACT_FIELD_NAME_1"],
      "layout": "single_dominant",
      "verticalAllocation": 0.25,
      "priority": "high"
    },
    "body": {
      "fields": ["EXACT_FIELD_NAME_2", "EXACT_FIELD_NAME_3"],
      "layout": "stacked",
      "verticalAllocation": 0.50,
      "priority": "highest"
    },
    "footer": {
      "fields": ["EXACT_FIELD_NAME_4"],
      "layout": "horizontal_split",
      "verticalAllocation": 0.25,
      "priority": "low"
    }
  },
  "typography": {
    "EXACT_FIELD_NAME_1": { "weight": "bold", "importance": "high" },
    "EXACT_FIELD_NAME_2": { "weight": "normal", "importance": "highest" }
  },
  "layoutSpec": {
    "layoutType": "${hasImages ? 'split_text_left_image_right' : 'text_only'}",
    "textArea": {
      "xPercent": 0.05,
      "yPercent": 0.05,
      "widthPercent": ${hasImages ? 0.60 : 0.90},
      "heightPercent": 0.90
    },
    ${hasImages ? `"imageArea": {
      "xPercent": 0.68,
      "yPercent": 0.10,
      "widthPercent": 0.27,
      "heightPercent": 0.80,
      "aspectRatio": { "width": ${imageFields[0]?.aspectRatio?.width || 3}, "height": ${imageFields[0]?.aspectRatio?.height || 2} }
    },
    "images": [${imageFields.map(f => `{ "fieldName": "${f.fieldName}", "aspectRatio": { "width": ${f.aspectRatio?.width || 3}, "height": ${f.aspectRatio?.height || 2} } }`).join(', ')}],` : ''}
    "gap": 0.03
  }
}

CRITICAL RULES:
- Use EXACT field names as provided above
- DO NOT include image fields in regions - they go in layoutSpec.images
- verticalAllocation values must sum to ≤ 1.0
- Allocate 50-60% to ADDRESS-type fields if present`;

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
    let designStrategy;
    
    try {
      designStrategy = JSON.parse(aiResult.choices[0].message.content);
    } catch (parseError) {
      console.error('Failed to parse AI response:', aiResult.choices[0].message.content);
      throw new Error('AI returned invalid JSON');
    }

    console.log('📐 Generated design strategy:', designStrategy.strategy);

    // Validate strategy
    if (!designStrategy.regions || !designStrategy.typography) {
      throw new Error('Invalid design strategy from AI');
    }

    // Ensure layoutSpec exists with defaults
    if (!designStrategy.layoutSpec) {
      designStrategy.layoutSpec = {
        layoutType: hasImages ? 'split_text_left_image_right' : 'text_only',
        textArea: {
          xPercent: 0.05,
          yPercent: 0.05,
          widthPercent: hasImages ? 0.60 : 0.90,
          heightPercent: 0.90
        },
        imageArea: hasImages ? {
          xPercent: 0.68,
          yPercent: 0.10,
          widthPercent: 0.27,
          heightPercent: 0.80,
          aspectRatio: imageFields[0]?.aspectRatio || { width: 3, height: 2 }
        } : null,
        images: imageFields.map(f => ({
          fieldName: f.fieldName,
          aspectRatio: f.aspectRatio || { width: 3, height: 2 }
        })),
        gap: 0.03
      };
    }

    // Validate that all fields in the strategy match the input field names (text fields only)
    const inputTextFieldNames = new Set(textFields.map(f => f.fieldName));
    const strategyFieldNames = new Set<string>();
    
    Object.values(designStrategy.regions).forEach((region: any) => {
      if (region.fields && Array.isArray(region.fields)) {
        region.fields.forEach((fieldName: string) => strategyFieldNames.add(fieldName));
      }
    });

    const invalidFields = Array.from(strategyFieldNames).filter(name => !inputTextFieldNames.has(name));
    if (invalidFields.length > 0) {
      console.warn('AI returned field names not in text fields:', invalidFields);
      // Don't throw - just filter them out
      Object.values(designStrategy.regions).forEach((region: any) => {
        if (region.fields && Array.isArray(region.fields)) {
          region.fields = region.fields.filter((f: string) => inputTextFieldNames.has(f));
        }
      });
    }

    // Check vertical allocation sums
    const totalAllocation = Object.values(designStrategy.regions).reduce(
      (sum: number, region: any) => sum + (region.verticalAllocation || 0), 0
    );
    
    if (totalAllocation > 1.05) {
      console.warn('Vertical allocation exceeds 100%, normalizing...');
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
