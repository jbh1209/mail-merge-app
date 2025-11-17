import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AlertCircle, Check, HelpCircle, Sparkles, TrendingUp, Loader2, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScopedAIChat } from "@/components/ScopedAIChat";

interface DataReviewStepProps {
  projectId: string;
  workspaceId: string;
  dataSourceId: string;
  parsedData: {
    columns: string[];
    preview: any[];
    rowCount: number;
    filePath: string;
    fileName: string;
  };
  subscriptionFeatures: {
    canUseAICleaning: boolean;
    hasAdvancedAI: boolean;
  };
  onComplete: (updatedData: any) => void;
  onBack: () => void;
}

interface ColumnMapping {
  original: string;
  suggested: string;
  dataType: string;
  confidence: number;
}

interface AnalysisResult {
  columnMappings: ColumnMapping[];
  qualityIssues: string[];
  suggestions: string[];
}

export function DataReviewStep({
  projectId,
  workspaceId,
  dataSourceId,
  parsedData,
  subscriptionFeatures,
  onComplete,
  onBack,
}: DataReviewStepProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'preview' | 'quality' | 'assistant'>('overview');
  const [analyzing, setAnalyzing] = useState(true);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [editedColumns, setEditedColumns] = useState<Record<string, string>>({});
  const [dataValidated, setDataValidated] = useState(false);

  const { columns, preview, rowCount, fileName } = parsedData;
  const emptyColumnsRemoved = (parsedData as any).emptyColumnsRemoved || 0;

  const categorizedIssues = {
    critical: analysis?.qualityIssues.filter(issue => issue.startsWith('CRITICAL:')) || [],
    warning: analysis?.qualityIssues.filter(issue => issue.startsWith('WARNING:')) || [],
    info: analysis?.qualityIssues.filter(issue => issue.startsWith('INFO:')) || []
  };

  useEffect(() => {
    runInitialAnalysis();
  }, []);

  const runInitialAnalysis = async () => {
    if (!subscriptionFeatures.canUseAICleaning) {
      setAnalyzing(false);
      return;
    }

    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('clean-data-with-ai', {
        body: {
          columns,
          preview: preview.slice(0, 10),
          rowCount,
          workspaceId,
          emptyColumnsRemoved: (parsedData as any).emptyColumnsRemoved || 0,
        },
      });

      if (error) throw error;

      setAnalysis(data as AnalysisResult);
      console.debug('[DataReviewStep] Analysis complete:', {
        columnMappings: data.columnMappings?.length || 0,
        qualityIssues: data.qualityIssues?.length || 0
      });

      toast.success("AI analysis complete!");
    } catch (error: any) {
      console.error('Analysis error:', error);
      toast.error('Analysis failed');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleApplyAISuggestions = () => {
    if (!analysis?.columnMappings) return;
    
    const newEdits = { ...editedColumns };
    let appliedCount = 0;
    
    analysis.columnMappings.forEach(mapping => {
      if (mapping.original !== mapping.suggested) {
        newEdits[mapping.original] = mapping.suggested;
        appliedCount++;
      }
    });
    
    setEditedColumns(newEdits);
    toast.success(`Applied ${appliedCount} suggestion${appliedCount !== 1 ? 's' : ''}!`);
  };

  const handleColumnEdit = (original: string, newName: string) => {
    if (newName.trim() === original) {
      const { [original]: _, ...rest } = editedColumns;
      setEditedColumns(rest);
    } else {
      setEditedColumns(prev => ({ ...prev, [original]: newName.trim() }));
    }
  };

  const handleAcceptAndContinue = async () => {
    if (!dataValidated) {
      toast.error("Please review the data quality checks before proceeding.");
      return;
    }

    const finalRenameMap: Record<string, string> = { ...editedColumns };
    const updatedColumns = columns.map(col => finalRenameMap[col] || col);
    const updatedPreview = preview.map(row => {
      const newRow: Record<string, any> = {};
      columns.forEach((oldCol) => {
        const newCol = finalRenameMap[oldCol] || oldCol;
        newRow[newCol] = row[oldCol];
      });
      return newRow;
    });

    console.debug('[DataReviewStep] Final corrections:', {
      renamedCount: Object.keys(finalRenameMap).length,
      updatedColumns: updatedColumns.slice(0, 5)
    });

    try {
      const { error: updateError } = await supabase
        .from('data_sources')
        .update({
          parsed_fields: {
            columns: updatedColumns,
            rows: parsedData.rows || [],
            rowCount: parsedData.rowCount || rowCount,
            preview: updatedPreview,
            emptyColumnsRemoved
          }
        })
        .eq('id', dataSourceId);

      if (updateError) throw updateError;

      const correctionCount = Object.keys(finalRenameMap).length;
      if (correctionCount > 0) {
        toast.success(`Applied ${correctionCount} correction${correctionCount > 1 ? 's' : ''}`);
      }
    } catch (err) {
      console.error('Error persisting corrections:', err);
      toast.error('Error saving corrections');
      return;
    }

    onComplete({
      columns: updatedColumns,
      parsedData: {
        ...parsedData,
        columns: updatedColumns,
        preview: updatedPreview
      },
      analysis
    });
  };

  if (analyzing) {
    return (
      <Card className="w-full max-w-4xl mx-auto">
        <CardContent className="flex flex-col items-center justify-center py-12 space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <h3 className="font-semibold text-lg">Analyzing your data...</h3>
        </CardContent>
      </Card>
    );
  }

  const qualityScore = 100;
  const hasIssues = categorizedIssues.critical.length + categorizedIssues.warning.length > 0;

  return (
    <div className="space-y-6 w-full max-w-6xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Review & Clean Your Data</CardTitle>
          <CardDescription>Validate data quality and apply AI suggestions</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(val: any) => setActiveTab(val)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="preview">Preview</TabsTrigger>
              <TabsTrigger value="quality">Quality</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">Total Rows</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{rowCount.toLocaleString()}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">Columns</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{columns.length}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">Quality</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{qualityScore}%</div>
                  </CardContent>
                </Card>
              </div>

              {analysis?.columnMappings && analysis.columnMappings.length > 0 && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>AI Recommendations</CardTitle>
                        <CardDescription>Suggested improvements</CardDescription>
                      </div>
                      <Button onClick={handleApplyAISuggestions} variant="outline" size="sm">
                        <Sparkles className="h-4 w-4 mr-2" />
                        Apply All
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[400px]">
                      <div className="space-y-3">
                        {analysis.columnMappings.map((mapping, idx) => (
                          <div key={idx} className="flex items-start gap-4 p-3 rounded-lg border">
                            <div className="flex-1 space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-sm">{mapping.original}</span>
                                <ArrowRight className="h-4 w-4" />
                                <span className="font-mono text-sm font-semibold">{editedColumns[mapping.original] || mapping.suggested}</span>
                              </div>
                              <Input
                                value={editedColumns[mapping.original] || mapping.suggested}
                                onChange={(e) => handleColumnEdit(mapping.original, e.target.value)}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="preview">
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {columns.map((col, idx) => (
                        <TableHead key={idx}>{editedColumns[col] || col}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.map((row, rowIdx) => (
                      <TableRow key={rowIdx}>
                        {columns.map((col, colIdx) => (
                          <TableCell key={colIdx}>{row[col]?.toString() || '—'}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="quality">
              <div className="space-y-4">
                {!hasIssues && (
                  <Alert>
                    <Check className="h-4 w-4" />
                    <AlertTitle>Data looks great!</AlertTitle>
                    <AlertDescription>No issues detected</AlertDescription>
                  </Alert>
                )}
                <div className="flex items-center gap-2 pt-4">
                  <input
                    type="checkbox"
                    id="dataValidated"
                    checked={dataValidated}
                    onChange={(e) => setDataValidated(e.target.checked)}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="dataValidated">I have reviewed the data</Label>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={onBack}>Back</Button>
        <Button onClick={handleAcceptAndContinue} disabled={!dataValidated}>Accept & Continue</Button>
      </div>
    </div>
  );
}
