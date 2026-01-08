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

    const { fieldNames, sampleData, templateSize, templateType, labelAnalysis } = await req.json();

    if (!fieldNames || !Array.isArray(fieldNames) || fieldNames.length === 0) {
      throw new Error('Field names are required');
    }

    if (!templateSize?.width || !templateSize?.height) {
      throw new Error('Template size is required');
    }

    const aspectRatio = templateSize.width / templateSize.height;
    const isWideLabel = aspectRatio > 2;
    const isTallLabel = aspectRatio < 0.6;
    
    // Project type affects layout strategy
    const projectType = templateType || 'label';
    const isBadge = projectType === 'badge';
    const isNameTag = isBadge || projectType === 'card';  // Badges and cards need separate fields
    const isAddressLabel = projectType === 'label' && labelAnalysis?.isStandardAddress;

    console.log('🎨 Generating design strategy for:', {
      fields: fieldNames.length,
      template: `${templateSize.width}mm × ${templateSize.height}mm`,
      aspectRatio: aspectRatio.toFixed(2),
      projectType,
      isBadge,
      isNameTag,
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

    // Build AI prompt - let the AI make REAL layout decisions
    const systemPrompt = `You are an expert label designer. Your job is to create the OPTIMAL layout for a label.

You must return a JSON object with a layoutSpec that the client will use directly. 

CRITICAL: You are making REAL creative decisions. Choose values that make sense for this specific label:
- For wide labels with few fields: use larger text areas, maybe a combined text block
- For labels with images: decide the best split ratio based on content importance
- For text-heavy labels: maximize text area
- Consider the aspect ratio when deciding layout orientation

Your layoutSpec DIRECTLY controls the final layout - choose wisely!`;

    // Build type-specific instructions
    const typeSpecificInstructions = isBadge || isNameTag 
      ? `⚠️ PROJECT TYPE: ${projectType.toUpperCase()} - IMPORTANT RULES:
   - useCombinedTextBlock: FALSE (REQUIRED) - Each field (Name, Title, Company) MUST be a separate text element
   - This allows different styling per field (larger name, smaller title)
   - Stack fields vertically with appropriate hierarchy
   - Typically center-aligned for badges/name tags`
      : isAddressLabel
      ? `ℹ️ PROJECT TYPE: Address Label
   - useCombinedTextBlock: TRUE (recommended) - Combine address lines into one block
   - Left-aligned typically works best for addresses`
      : '';

    const userPrompt = `Design the optimal layout for this ${projectType}:

${typeSpecificInstructions}

LABEL SIZE: ${templateSize.width}mm × ${templateSize.height}mm (aspect ratio: ${aspectRatio.toFixed(2)})
${isWideLabel ? '⚠️ This is a WIDE label - text should fill more horizontal space' : ''}
${isTallLabel ? '⚠️ This is a TALL label - consider vertical stacking' : ''}

TEXT FIELDS (${textFields.length}):
${textFields.map(f => `• "${f.fieldName}" [${f.type}]: "${f.sampleValue}" (avg ${Math.round(f.avgLength)} chars)`).join('\n')}

IMAGE FIELDS (${imageFields.length}):
${imageFields.length > 0 ? imageFields.map(f => `• "${f.fieldName}" (aspect: ${f.aspectRatio?.width}:${f.aspectRatio?.height})`).join('\n') : '(none)'}

DECIDE THE BEST LAYOUT:

1. layoutType: Choose based on content
   - "text_only_combined": ALL text fields in ONE combined block (best for address labels)
   - "text_only_stacked": Separate text fields stacked vertically (best for badges, name tags, cards)
   - "split_text_left_image_right": Text on left, image on right
   - "split_image_left_text_right": Image on left, text on right
   - "hero_image_top": Large image at top, text below (best for badges with photos)

2. useCombinedTextBlock: true/false
   - TRUE = All text fields go in ONE text element with newlines (like an address block)
   - FALSE = Each field gets its own text element (required for badges, name tags)
   - For badges/name tags: ALWAYS use FALSE so each field can be styled differently

3. textArea percentages: YOU DECIDE based on content
   - xPercent, yPercent: margins (typically 0.03-0.08)
   - widthPercent: how much width for text (0.40-0.94 depending on whether images exist)
   - heightPercent: how much height for text (typically 0.85-0.94)
   
4. imageArea (if has images): YOU DECIDE the best size and position
   - Consider the image aspect ratio
   - For badges with photos: hero_image_top with ~40% image height

5. typography: Decide font emphasis
   - baseFontScale: "fill" (scale to fill space), "large" (prominent), "medium", "small"
   - primaryFieldIndex: which text field should be most prominent (0-based index)
   - alignment: "center" for badges/name tags, "left" for address labels

OUTPUT ONLY THIS JSON (no markdown, no explanation):
{
  "strategy": "descriptive_strategy_name",
  "layoutSpec": {
    "layoutType": "text_only_combined|text_only_stacked|split_text_left_image_right|split_image_left_text_right|hero_image_top",
    "useCombinedTextBlock": ${isBadge || isNameTag ? 'false' : 'true'},
    "textArea": {
      "xPercent": 0.04,
      "yPercent": 0.04,
      "widthPercent": 0.92,
      "heightPercent": 0.92
    },
    "imageArea": null,
    "typography": {
      "baseFontScale": "fill",
      "primaryFieldIndex": 0,
      "alignment": "${isBadge || isNameTag ? 'center' : 'left'}"
    }
  }
}

Make smart decisions! For example:
- Badge with Name, Title, Company + Photo → hero_image_top, useCombinedTextBlock: false, center aligned
- Address label with 4 fields → text_only_combined, useCombinedTextBlock: true, left aligned
- 2 text fields + 1 photo → split layout with ~60% text, ~35% image
- Single product name → text_only_stacked with baseFontScale: "fill"`;

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
      const content = aiResult.choices[0].message.content;
      // Strip markdown code blocks if present
      const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      designStrategy = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error('Failed to parse AI response:', aiResult.choices[0].message.content);
      throw new Error('AI returned invalid JSON');
    }

    console.log('📐 AI Design Decision:', {
      strategy: designStrategy.strategy,
      layoutType: designStrategy.layoutSpec?.layoutType,
      useCombined: designStrategy.layoutSpec?.useCombinedTextBlock,
      textWidth: designStrategy.layoutSpec?.textArea?.widthPercent,
      fontScale: designStrategy.layoutSpec?.typography?.baseFontScale
    });

    // Ensure layoutSpec has all required fields with sensible defaults
    const layoutSpec = designStrategy.layoutSpec || {};
    
    // Fill in any missing fields
    if (!layoutSpec.layoutType) {
      layoutSpec.layoutType = hasImages ? 'split_text_left_image_right' : 'text_only_combined';
    }
    
    if (layoutSpec.useCombinedTextBlock === undefined) {
      layoutSpec.useCombinedTextBlock = textFields.length >= 3;
    }
    
    if (!layoutSpec.textArea) {
      layoutSpec.textArea = {
        xPercent: 0.04,
        yPercent: 0.04,
        widthPercent: hasImages ? 0.55 : 0.92,
        heightPercent: 0.92
      };
    }
    
    if (!layoutSpec.typography) {
      layoutSpec.typography = {
        baseFontScale: 'fill',
        primaryFieldIndex: 0,
        alignment: 'left'
      };
    }

    // Add image area if needed
    if (hasImages && !layoutSpec.imageArea) {
      const isImageLeft = layoutSpec.layoutType === 'split_image_left_text_right';
      const isHeroTop = layoutSpec.layoutType === 'hero_image_top';
      
      if (isHeroTop) {
        layoutSpec.imageArea = {
          xPercent: 0.04,
          yPercent: 0.04,
          widthPercent: 0.92,
          heightPercent: 0.45,
          aspectRatio: imageFields[0]?.aspectRatio || { width: 3, height: 2 }
        };
        // Adjust text area for hero top
        layoutSpec.textArea.yPercent = 0.52;
        layoutSpec.textArea.heightPercent = 0.44;
      } else {
        const imageX = isImageLeft ? 0.04 : 0.62;
        const textX = isImageLeft ? 0.40 : 0.04;
        
        layoutSpec.imageArea = {
          xPercent: imageX,
          yPercent: 0.08,
          widthPercent: 0.34,
          heightPercent: 0.84,
          aspectRatio: imageFields[0]?.aspectRatio || { width: 3, height: 2 }
        };
        
        layoutSpec.textArea.xPercent = textX;
        layoutSpec.textArea.widthPercent = 0.52;
      }
    }

    // Add field information for client
    layoutSpec.textFields = textFields.map(f => f.fieldName);
    layoutSpec.images = imageFields.map(f => ({
      fieldName: f.fieldName,
      aspectRatio: f.aspectRatio || { width: 3, height: 2 }
    }));

    designStrategy.layoutSpec = layoutSpec;

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
