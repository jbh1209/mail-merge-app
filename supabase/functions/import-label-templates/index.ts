import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// XML template sources from glabels-qt repository
const TEMPLATE_SOURCES = [
  // Avery templates (primary focus)
  { url: 'https://raw.githubusercontent.com/jimevins/glabels-qt/master/templates/avery-us-templates.xml', region: 'US' },
  { url: 'https://raw.githubusercontent.com/jimevins/glabels-qt/master/templates/avery-iso-templates.xml', region: 'EU' },
  { url: 'https://raw.githubusercontent.com/jimevins/glabels-qt/master/templates/avery-other-templates.xml', region: 'Other' },
  
  // Other major brands
  { url: 'https://raw.githubusercontent.com/jimevins/glabels-qt/master/templates/herma-iso-templates.xml', region: 'EU' },
  { url: 'https://raw.githubusercontent.com/jimevins/glabels-qt/master/templates/zweckform-iso-templates.xml', region: 'EU' },
  { url: 'https://raw.githubusercontent.com/jimevins/glabels-qt/master/templates/uline-us-templates.xml', region: 'US' },
  { url: 'https://raw.githubusercontent.com/jimevins/glabels-qt/master/templates/worldlabel-us-templates.xml', region: 'US' },
  { url: 'https://raw.githubusercontent.com/jimevins/glabels-qt/master/templates/maco-us-templates.xml', region: 'US' },
  
  // Additional US sources
  { url: 'https://raw.githubusercontent.com/jimevins/glabels-qt/master/templates/sheetlabels-us-templates.xml', region: 'US' },
  { url: 'https://raw.githubusercontent.com/jimevins/glabels-qt/master/templates/misc-us-templates.xml', region: 'US' },
  
  // Additional EU/ISO sources
  { url: 'https://raw.githubusercontent.com/jimevins/glabels-qt/master/templates/misc-iso-templates.xml', region: 'EU' },
  
  // Label printer brands
  { url: 'https://raw.githubusercontent.com/jimevins/glabels-qt/master/templates/dymo-other-templates.xml', region: 'Other' },
  { url: 'https://raw.githubusercontent.com/jimevins/glabels-qt/master/templates/brother-other-templates.xml', region: 'Other' },
];

// Convert various units to mm
function unitToMm(value: string): number {
  if (!value) return 0;
  const num = parseFloat(value);
  if (isNaN(num)) return 0;
  
  if (value.endsWith('in')) return num * 25.4;
  if (value.endsWith('pt')) return num * 0.3528;
  if (value.endsWith('pc')) return num * 4.2333;
  if (value.endsWith('cm')) return num * 10;
  if (value.endsWith('mm')) return num;
  
  // Default: assume points if no unit
  return num * 0.3528;
}

interface TemplateData {
  brand: string;
  part_number: string;
  equivalent_to: string | null;
  paper_size: string;
  region: string;
  label_width_mm: number;
  label_height_mm: number;
  label_shape: string;
  corner_radius_mm: number;
  columns: number;
  rows: number;
  margin_left_mm: number;
  margin_top_mm: number;
  spacing_x_mm: number;
  spacing_y_mm: number;
  description: string | null;
  categories: string[];
}

// Parse master templates (templates with full Layout data)
function parseMasterTemplates(xml: string, defaultRegion: string): Map<string, TemplateData> {
  const masterTemplates = new Map<string, TemplateData>();
  
  // Match Template elements with content
  const templateRegex = /<Template\s+([^>]+)>([\s\S]*?)<\/Template>/g;
  let templateMatch;
  
  while ((templateMatch = templateRegex.exec(xml)) !== null) {
    const attrs = templateMatch[1];
    const content = templateMatch[2];
    
    // Parse template attributes
    const brand = attrs.match(/brand="([^"]+)"/)?.[1] || 'Unknown';
    const part = attrs.match(/part="([^"]+)"/)?.[1];
    const size = attrs.match(/size="([^"]+)"/)?.[1] || 'US-Letter';
    const description = attrs.match(/_description="([^"]+)"/)?.[1] || 
                        attrs.match(/description="([^"]+)"/)?.[1];
    
    if (!part) continue;
    
    // Parse label-rectangle or label-round
    const labelRectMatch = content.match(/<Label-rectangle\s+([^>\/]+)/);
    const labelRoundMatch = content.match(/<Label-round\s+([^>\/]+)/);
    const labelEllipseMatch = content.match(/<Label-ellipse\s+([^>\/]+)/);
    const labelCdMatch = content.match(/<Label-cd\s+([^>\/]+)/);
    
    let labelAttrs = '';
    let shape = 'rectangle';
    
    if (labelRectMatch) {
      labelAttrs = labelRectMatch[1];
      shape = 'rectangle';
    } else if (labelRoundMatch) {
      labelAttrs = labelRoundMatch[1];
      shape = 'round';
    } else if (labelEllipseMatch) {
      labelAttrs = labelEllipseMatch[1];
      shape = 'ellipse';
    } else if (labelCdMatch) {
      labelAttrs = labelCdMatch[1];
      shape = 'cd';
    }
    
    if (!labelAttrs) continue;
    
    // Parse label dimensions
    const width = labelAttrs.match(/width="([^"]+)"/)?.[1];
    const height = labelAttrs.match(/height="([^"]+)"/)?.[1];
    const radius = labelAttrs.match(/round="([^"]+)"/)?.[1] || '0';
    
    if (!width || !height) continue;
    
    // Parse Layout
    const layoutMatch = content.match(/<Layout\s+([^>\/]+)/);
    if (!layoutMatch) continue;
    
    const layoutAttrs = layoutMatch[1];
    const nx = parseInt(layoutAttrs.match(/nx="([^"]+)"/)?.[1] || '1');
    const ny = parseInt(layoutAttrs.match(/ny="([^"]+)"/)?.[1] || '1');
    const x0 = layoutAttrs.match(/x0="([^"]+)"/)?.[1] || '0';
    const y0 = layoutAttrs.match(/y0="([^"]+)"/)?.[1] || '0';
    const dx = layoutAttrs.match(/dx="([^"]+)"/)?.[1] || width;
    const dy = layoutAttrs.match(/dy="([^"]+)"/)?.[1] || height;
    
    // Determine region from paper size
    let region = defaultRegion;
    if (size.includes('Letter') || size.includes('letter')) {
      region = 'US';
    } else if (size.includes('A4') || size.includes('A5')) {
      region = 'EU';
    }
    
    const templateData: TemplateData = {
      brand,
      part_number: part,
      equivalent_to: null,
      paper_size: size,
      region,
      label_width_mm: unitToMm(width),
      label_height_mm: unitToMm(height),
      label_shape: shape,
      corner_radius_mm: unitToMm(radius),
      columns: nx,
      rows: ny,
      margin_left_mm: unitToMm(x0),
      margin_top_mm: unitToMm(y0),
      spacing_x_mm: unitToMm(dx),
      spacing_y_mm: unitToMm(dy),
      description: description || null,
      categories: ['label'],
    };
    
    masterTemplates.set(part, templateData);
  }
  
  return masterTemplates;
}

// Parse equivalent templates (self-closing templates with equiv attribute)
function parseEquivalentTemplates(xml: string, masterTemplates: Map<string, TemplateData>): TemplateData[] {
  const equivalentTemplates: TemplateData[] = [];
  
  // Match self-closing Template elements with equiv attribute
  // Pattern: <Template brand="X" part="Y" equiv="Z"/>
  const equivRegex = /<Template\s+([^>]*equiv="[^"]+")[^>]*\/>/g;
  let match;
  
  while ((match = equivRegex.exec(xml)) !== null) {
    const attrs = match[1];
    
    const brand = attrs.match(/brand="([^"]+)"/)?.[1];
    const part = attrs.match(/part="([^"]+)"/)?.[1];
    const equiv = attrs.match(/equiv="([^"]+)"/)?.[1];
    
    if (!brand || !part || !equiv) continue;
    
    // Find the master template
    const master = masterTemplates.get(equiv);
    if (!master) {
      console.log(`Master template not found for equiv: ${equiv} (part: ${part})`);
      continue;
    }
    
    // Create equivalent template by copying master specs
    equivalentTemplates.push({
      ...master,
      brand,
      part_number: part,
      equivalent_to: equiv,
    });
  }
  
  return equivalentTemplates;
}

// Main parsing function
function parseTemplates(xml: string, defaultRegion: string): TemplateData[] {
  // First pass: parse master templates
  const masterTemplates = parseMasterTemplates(xml, defaultRegion);
  console.log(`Found ${masterTemplates.size} master templates`);
  
  // Second pass: parse equivalent templates
  const equivalentTemplates = parseEquivalentTemplates(xml, masterTemplates);
  console.log(`Found ${equivalentTemplates.length} equivalent templates`);
  
  // Combine all templates
  return [...masterTemplates.values(), ...equivalentTemplates];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('Starting label template import...');
    
    let totalImported = 0;
    let totalErrors = 0;
    const results: any[] = [];

    for (const source of TEMPLATE_SOURCES) {
      console.log(`Fetching: ${source.url}`);
      
      try {
        const response = await fetch(source.url);
        if (!response.ok) {
          console.error(`Failed to fetch ${source.url}: ${response.status}`);
          results.push({ source: source.url, error: `HTTP ${response.status}` });
          continue;
        }
        
        const xml = await response.text();
        const templates = parseTemplates(xml, source.region);
        
        console.log(`Parsed ${templates.length} total templates from ${source.url}`);
        
        // Insert templates in batches
        const batchSize = 50;
        for (let i = 0; i < templates.length; i += batchSize) {
          const batch = templates.slice(i, i + batchSize);
          
          const { error } = await supabase
            .from('label_templates')
            .upsert(batch, { 
              onConflict: 'brand,part_number',
              ignoreDuplicates: false 
            });
          
          if (error) {
            console.error(`Error inserting batch: ${error.message}`);
            totalErrors += batch.length;
          } else {
            totalImported += batch.length;
          }
        }
        
        results.push({ 
          source: source.url, 
          parsed: templates.length, 
          region: source.region 
        });
        
      } catch (fetchError) {
        console.error(`Error processing ${source.url}:`, fetchError);
        results.push({ source: source.url, error: String(fetchError) });
      }
    }

    // Get final count
    const { count } = await supabase
      .from('label_templates')
      .select('*', { count: 'exact', head: true });

    console.log(`Import complete. Total templates in database: ${count}`);

    return new Response(
      JSON.stringify({
        success: true,
        totalImported,
        totalErrors,
        totalInDatabase: count,
        sources: results,
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Import error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
