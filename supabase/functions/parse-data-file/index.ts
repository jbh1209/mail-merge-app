import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { file_path, file_type } = await req.json();
    
    console.log('Parsing file:', { file_path, file_type });

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Download file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('user-uploads')
      .download(file_path);

    if (downloadError) {
      console.error('Download error:', downloadError);
      throw new Error(`Failed to download file: ${downloadError.message}`);
    }

    let columns: string[] = [];
    let rows: Record<string, any>[] = [];

    if (file_type === 'csv') {
      // Parse CSV
      const text = await fileData.text();
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length === 0) {
        throw new Error('Empty CSV file');
      }

      // Parse headers
      columns = lines[0].split(',').map(col => col.trim().replace(/^"|"$/g, ''));
      
      // Parse rows
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(val => val.trim().replace(/^"|"$/g, ''));
        const row: Record<string, any> = {};
        columns.forEach((col, idx) => {
          row[col] = values[idx] || null;
        });
        rows.push(row);
      }
    } else if (file_type === 'xlsx' || file_type === 'xls') {
      // Parse Excel
      const arrayBuffer = await fileData.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      
      // Use first sheet
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      
      // Convert to JSON
      const jsonData = XLSX.utils.sheet_to_json(sheet);
      
      if (jsonData.length === 0) {
        throw new Error('Empty Excel file');
      }

      // Extract columns from first row
      columns = Object.keys(jsonData[0] as Record<string, any>);
      rows = jsonData as Record<string, any>[];
    } else {
      throw new Error(`Unsupported file type: ${file_type}`);
    }

    const result = {
      columns,
      rows,
      rowCount: rows.length,
      preview: rows.slice(0, 10), // First 10 rows for preview
    };

    console.log('Parse successful:', { rowCount: result.rowCount, columnCount: columns.length });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Parse error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error parsing file' 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
