import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to parse CSV properly handling quoted fields
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        field += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // Field separator (only when not in quotes)
      fields.push(field.trim());
      field = '';
    } else {
      field += char;
    }
  }
  fields.push(field.trim());
  return fields;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { file_path, file_type } = await req.json();
    
    console.log('📁 Parsing file:', { file_path, file_type });

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Download file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('user-uploads')
      .download(file_path);

    if (downloadError) {
      console.error('❌ Download error:', downloadError);
      throw new Error(`Failed to download file: ${downloadError.message}`);
    }

    let columns: string[] = [];
    let rows: Record<string, any>[] = [];

    if (file_type === 'csv') {
      console.log('📄 Parsing CSV file...');
      const text = await fileData.text();
      
      // Split into lines, handling both CRLF and LF
      const lines = text.split(/\r?\n/).filter(line => line.trim());
      
      if (lines.length === 0) {
        throw new Error('Empty CSV file');
      }

      // Parse headers using proper CSV parsing
      columns = parseCSVLine(lines[0]).map(col => col.replace(/^"|"$/g, ''));
      
      // Filter out empty columns and rename unnamed ones
      columns = columns.map((col, idx) => 
        col && col.trim() !== '' ? col : `Unnamed_Column_${idx + 1}`
      ).filter(col => col && col.trim() !== '');
      
      console.log('📊 Detected columns:', columns);
      console.log('🔢 Column count:', columns.length);
      
      // Parse rows
      for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]).map(val => val.replace(/^"|"$/g, ''));
        
        // Validate row has correct number of fields
        if (values.length !== columns.length) {
          console.warn(`⚠️ Row ${i} has ${values.length} fields, expected ${columns.length}`);
        }
        
        const row: Record<string, any> = {};
        columns.forEach((col, idx) => {
          row[col] = values[idx] || null;
        });
        rows.push(row);
      }
      
      console.log('✅ CSV parsed:', rows.length, 'rows');
      console.log('📈 Sample row 1:', JSON.stringify(rows[0]));
      
    } else if (file_type === 'xlsx' || file_type === 'xls') {
      console.log('📊 Parsing Excel file...');
      const arrayBuffer = await fileData.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      
      // Use first sheet
      const sheetName = workbook.SheetNames[0];
      console.log('📑 Using sheet:', sheetName);
      const sheet = workbook.Sheets[sheetName];
      
      // Convert to JSON with options to preserve data
      const jsonData = XLSX.utils.sheet_to_json(sheet, {
        raw: false, // Convert dates and numbers to strings
        defval: null // Use null for empty cells
      });
      
      if (jsonData.length === 0) {
        throw new Error('Empty Excel file');
      }

      // Extract columns from first row
      columns = Object.keys(jsonData[0] as Record<string, any>);
      
      // Filter out empty columns and rename unnamed ones
      columns = columns.map((col, idx) => 
        col && col.trim() !== '' ? col : `Unnamed_Column_${idx + 1}`
      ).filter(col => col && col.trim() !== '');
      
      // Rebuild rows to exclude empty-named columns
      rows = jsonData.map((row: any) => {
        const cleanRow: Record<string, any> = {};
        columns.forEach(col => {
          if (col && col.trim() !== '') {
            cleanRow[col] = row[col];
          }
        });
        return cleanRow;
      });
      
      console.log('📊 Detected columns:', columns);
      console.log('🔢 Column count:', columns.length);
      console.log('🔢 Row count:', rows.length);
      console.log('📈 Sample row 1:', JSON.stringify(rows[0]));
      
      // Validate data integrity
      const invalidRows = rows.filter(row => {
        const rowKeys = Object.keys(row);
        return rowKeys.length !== columns.length;
      });
      
      if (invalidRows.length > 0) {
        console.warn(`⚠️ Found ${invalidRows.length} rows with mismatched column counts`);
        console.warn('Sample invalid row:', invalidRows[0]);
      }
      
      console.log('✅ Excel parsed successfully');
      
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
