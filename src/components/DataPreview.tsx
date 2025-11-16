import { useState, useEffect } from "react";
import { Check, Loader2, AlertCircle, Sparkles, TrendingUp, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SubscriptionFeatures } from "@/hooks/useSubscription";
import { useNavigate } from "react-router-dom";

interface ColumnMapping {
  original: string;
  suggested: string;
  dataType: string;
  confidence: number;
}

interface DataPreviewProps {
  projectId: string;
  workspaceId: string;
  columns: string[];
  rows: Record<string, any>[];
  rowCount: number;
  preview: Record<string, any>[];
  filePath: string;
  fileName: string;
  subscriptionFeatures?: SubscriptionFeatures;
  onComplete: () => void;
}

export function DataPreview({
  projectId,
  workspaceId,
  columns,
  rows,
  rowCount,
  preview,
  filePath,
  fileName,
  subscriptionFeatures,
  onComplete,
}: DataPreviewProps) {
  const navigate = useNavigate();
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);
  const [qualityIssues, setQualityIssues] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [editedColumns, setEditedColumns] = useState<Record<string, string>>({});

  const canUseAI = subscriptionFeatures?.canUseAICleaning ?? false;

  useEffect(() => {
    if (canUseAI) {
      analyzeData();
    } else {
      // Free tier: use original columns without AI
      const fallbackMappings = columns.map(col => ({
        original: col,
        suggested: col,
        dataType: 'text',
        confidence: 1.0,
      }));
      setColumnMappings(fallbackMappings);
      
      const fallbackEdits: Record<string, string> = {};
      columns.forEach(col => {
        fallbackEdits[col] = col;
      });
      setEditedColumns(fallbackEdits);
    }
  }, [canUseAI]);

  const analyzeData = async () => {
    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('clean-data-with-ai', {
        body: { columns, preview, rowCount, workspaceId }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      setColumnMappings(data.columnMappings || []);
      setQualityIssues(data.qualityIssues || []);
      setSuggestions(data.suggestions || []);

      // Initialize edited columns with AI suggestions
      const initialEdits: Record<string, string> = {};
      data.columnMappings?.forEach((mapping: ColumnMapping) => {
        initialEdits[mapping.original] = mapping.suggested;
      });
      setEditedColumns(initialEdits);

      toast.success("AI analysis complete!");
    } catch (error: any) {
      console.error('Analysis error:', error);
      
      // Parse specific error codes from backend
      const msg = String(error?.message || '');
      const status = (error?.status ?? error?.context?.response?.status) as number | undefined;
      let errorCode = null;
      try {
        if (error?.message) {
          const parsed = JSON.parse(error.message);
          errorCode = parsed?.code;
        }
      } catch {}

      if (errorCode === 'PLAN_REQUIRED' || ((status === 402 || msg.includes('402')) && msg.toLowerCase().includes('requires pro'))) {
        toast.error("AI data cleaning requires Pro or Business plan. Upgrade in Settings → Plans.");
      } else if (errorCode === 'AI_CREDITS_EXHAUSTED' || (status === 402 || msg.includes('402'))) {
        toast.error("AI credits exhausted. Add credits in Settings → Workspace → Usage.");
      } else if (errorCode === 'RATE_LIMITED' || status === 429 || msg.includes('429')) {
        toast.error("Rate limit exceeded. Please wait a minute and try again.");
      } else if (status === 401 || status === 403) {
        toast.error("Authentication error. Please refresh the page.");
      } else {
        toast.error(error instanceof Error ? error.message : "Failed to analyze data");
      }
      
      // Fallback: use original column names
      const fallbackMappings = columns.map(col => ({
        original: col,
        suggested: col,
        dataType: 'text',
        confidence: 1.0,
      }));
      setColumnMappings(fallbackMappings);
      
      const fallbackEdits: Record<string, string> = {};
      columns.forEach(col => {
        fallbackEdits[col] = col;
      });
      setEditedColumns(fallbackEdits);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleColumnEdit = (original: string, newValue: string) => {
    setEditedColumns(prev => ({ ...prev, [original]: newValue }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Prepare cleaned columns
      const cleanedColumns = columnMappings.map(mapping => ({
        original: mapping.original,
        cleaned: editedColumns[mapping.original] || mapping.suggested,
        dataType: mapping.dataType,
      }));

      // Insert into data_sources table
      const { error: insertError } = await supabase
        .from('data_sources')
        .insert([{
          project_id: projectId,
          workspace_id: workspaceId,
          source_type: 'csv' as const,
          file_url: filePath,
          row_count: rowCount,
          parsed_fields: {
            columns: cleanedColumns,
            originalColumns: columns,
          } as any,
          ai_field_analysis: {
            qualityIssues,
            suggestions,
            columnMappings,
          } as any,
        }]);

      if (insertError) throw insertError;

      toast.success("Data source saved successfully!");
      onComplete();
    } catch (error) {
      console.error('Save error:', error);
      toast.error(error instanceof Error ? error.message : "Failed to save data source");
    } finally {
      setSaving(false);
    }
  };

  if (analyzing) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <div className="text-center">
          <p className="font-medium">Analyzing data with AI...</p>
          <p className="text-sm text-muted-foreground mt-1">
            Detecting data types and cleaning column names
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-muted/50 rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Total Rows</p>
          <p className="text-2xl font-bold">{rowCount.toLocaleString()}</p>
        </div>
        <div className="bg-muted/50 rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Columns</p>
          <p className="text-2xl font-bold">{columns.length}</p>
        </div>
        <div className="bg-muted/50 rounded-lg p-4">
          <p className="text-sm text-muted-foreground">File Name</p>
          <p className="text-sm font-medium truncate">{fileName}</p>
        </div>
      </div>

      {/* Quality Issues */}
      {qualityIssues.length > 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <p className="font-medium mb-2">Data Quality Issues:</p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              {qualityIssues.map((issue, idx) => (
                <li key={idx}>{issue}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* AI Suggestions */}
      {suggestions.length > 0 && (
        <Alert className="border-primary/50 bg-primary/5">
          <Sparkles className="h-4 w-4 text-primary" />
          <AlertDescription>
            <p className="font-medium mb-2">AI Suggestions:</p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              {suggestions.map((suggestion, idx) => (
                <li key={idx}>{suggestion}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Column Mappings */}
      <div>
        <h3 className="font-medium mb-3">Column Names (editable)</h3>
        <div className="space-y-2">
          {columnMappings.map((mapping) => (
            <div key={mapping.original} className="flex items-center gap-3">
              <div className="flex-1 grid grid-cols-2 gap-3">
                <div className="text-sm text-muted-foreground">
                  {mapping.original}
                </div>
                <Input
                  value={editedColumns[mapping.original] || mapping.suggested}
                  onChange={(e) => handleColumnEdit(mapping.original, e.target.value)}
                  className="h-9"
                />
              </div>
              <Badge variant="secondary" className="text-xs">
                {mapping.dataType}
              </Badge>
            </div>
          ))}
        </div>
      </div>

      {/* Data Preview Table */}
      <div>
        <h3 className="font-medium mb-3">Data Preview (first 10 rows)</h3>
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto max-h-96">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((col) => (
                    <TableHead key={col} className="whitespace-nowrap">
                      {editedColumns[col] || col}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.map((row, idx) => (
                  <TableRow key={idx}>
                    {columns.map((col) => (
                      <TableCell key={col} className="whitespace-nowrap">
                        {row[col]?.toString() || '-'}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Check className="h-4 w-4 mr-2" />
              Accept & Save
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
