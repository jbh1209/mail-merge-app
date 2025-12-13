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
import { AlertCircle, Check, HelpCircle, Sparkles, TrendingUp, Loader2, ArrowRight, Wand2, Scissors } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScopedAIChat } from "@/components/ScopedAIChat";

interface DataReviewStepProps {
  projectId: string;
  workspaceId: string;
  dataSourceId: string;
  parsedData: {
    columns: string[];
    rows?: Record<string, any>[];  // ✅ Add optional rows
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

interface SplitSuggestion {
  column: string;
  delimiter: string;
  splitInto: string[];
  confidence: number;
  reason: string;
}

interface AnalysisResult {
  columnMappings: ColumnMapping[];
  qualityIssues: string[];
  suggestions: string[];
  splitSuggestions?: SplitSuggestion[];
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
  const [needsStructuring, setNeedsStructuring] = useState(false);
  const [isStructuring, setIsStructuring] = useState(false);
  const [structuredData, setStructuredData] = useState<{ columns: string[], rows: any[] } | null>(null);
  const [isSplittingColumn, setIsSplittingColumn] = useState(false);

  const sanitize = (s: string) => (s ?? '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
  const { columns, preview, rowCount, fileName } = parsedData;
  const emptyColumnsRemoved = (parsedData as any).emptyColumnsRemoved || 0;

  const categorizedIssues = {
    critical: analysis?.qualityIssues.filter(issue => issue.startsWith('CRITICAL:')) || [],
    warning: analysis?.qualityIssues.filter(issue => issue.startsWith('WARNING:')) || [],
    info: analysis?.qualityIssues.filter(issue => issue.startsWith('INFO:')) || []
  };

  useEffect(() => {
    // Detect if data needs structuring (single column with comma-separated values)
    if (columns.length === 1 && preview.length > 0) {
      const firstRow = preview[0];
      const firstColumnValue = firstRow[columns[0]];
      
      if (typeof firstColumnValue === 'string' && firstColumnValue.includes(',')) {
        const parts = firstColumnValue.split(',').length;
        if (parts >= 4) {
          console.log('Detected unstructured data that needs parsing');
          setNeedsStructuring(true);
          setAnalyzing(false);
          return;
        }
      }
    }
    
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

  const handleStructureData = async () => {
    setIsStructuring(true);
    setAnalyzing(true);
    try {
      console.log('Calling structure-data-with-ai function...');
      
      const fullRows = (parsedData as any).rows || preview;
      
      const { data, error } = await supabase.functions.invoke('structure-data-with-ai', {
        body: {
          columns: columns,
          rows: fullRows,
          targetFields: null,
          workspaceId: workspaceId
        }
      });

      if (error) {
        console.error('Structure data error:', error);
        throw error;
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to structure data');
      }

      console.log('Successfully structured data:', {
        originalColumns: columns.length,
        newColumns: data.columns.length,
        confidence: data.confidence
      });

      setStructuredData({
        columns: data.columns,
        rows: data.rows
      });

      setNeedsStructuring(false);
      toast.success(`Structured ${columns.length} column into ${data.columns.length} fields`, {
        description: `Confidence: ${data.confidence}%`
      });

      // Now run AI analysis on structured data
      if (subscriptionFeatures.canUseAICleaning) {
        setTimeout(() => {
          runAnalysisOnStructuredData(data.columns, data.rows);
        }, 500);
      } else {
        setAnalyzing(false);
      }

    } catch (error: any) {
      console.error('Error structuring data:', error);
      toast.error('Failed to structure data', {
        description: error.message || 'Please try again or proceed with original data'
      });
      setAnalyzing(false);
    } finally {
      setIsStructuring(false);
    }
  };

  const runAnalysisOnStructuredData = async (cols: string[], rows: any[]) => {
    try {
      const { data, error } = await supabase.functions.invoke('clean-data-with-ai', {
        body: {
          columns: cols,
          preview: rows.slice(0, 10),
          rowCount: rows.length,
          workspaceId,
          emptyColumnsRemoved: 0
        }
      });

      if (error) throw error;
      setAnalysis(data as AnalysisResult);
      toast.success("AI analysis complete!");
      
    } catch (error: any) {
      console.error('Error analyzing structured data:', error);
      toast.error('Analysis failed', {
        description: error.message
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSplitColumn = async (suggestion: SplitSuggestion) => {
    setIsSplittingColumn(true);
    try {
      const currentRows = structuredData ? structuredData.rows : ((parsedData as any).rows || preview);
      const currentCols = structuredData ? structuredData.columns : columns;

      console.log('Splitting column:', {
        column: suggestion.column,
        delimiter: suggestion.delimiter,
        splitInto: suggestion.splitInto,
        rowCount: currentRows.length
      });

      const { data, error } = await supabase.functions.invoke('split-column-with-ai', {
        body: {
          column: suggestion.column,
          delimiter: suggestion.delimiter,
          splitInto: suggestion.splitInto,
          rows: currentRows,
          columns: currentCols,
          workspaceId
        }
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Failed to split column');

      console.log('Successfully split column:', {
        originalColumn: suggestion.column,
        newColumns: data.newColumns,
        confidence: data.confidence
      });

      // Update structured data with split results
      setStructuredData({
        columns: data.columns,
        rows: data.rows
      });

      // Remove the applied split suggestion from analysis
      if (analysis?.splitSuggestions) {
        setAnalysis({
          ...analysis,
          splitSuggestions: analysis.splitSuggestions.filter(s => s.column !== suggestion.column)
        });
      }

      toast.success(`Split "${suggestion.column}" into ${suggestion.splitInto.length} columns`, {
        description: `Confidence: ${data.confidence}%`
      });

    } catch (error: any) {
      console.error('Error splitting column:', error);
      toast.error('Failed to split column', {
        description: error.message || 'Please try again'
      });
    } finally {
      setIsSplittingColumn(false);
    }
  };

  const handleAcceptAndContinue = async () => {
    if (!dataValidated) {
      toast.error("Please review the data quality checks before proceeding.");
      return;
    }

    // Use structured data if available
    const finalColumns = structuredData ? structuredData.columns : columns;
    const finalRows = structuredData ? structuredData.rows : ((parsedData as any).rows || []);
    const finalPreview = structuredData ? structuredData.rows.slice(0, 10) : preview;

    const finalRenameMap: Record<string, string> = { ...editedColumns };
    const updatedColumns = finalColumns.map(col => sanitize(finalRenameMap[col] || col));
    const updatedPreview = finalPreview.map(row => {
      const newRow: Record<string, any> = {};
      finalColumns.forEach((oldCol) => {
        const newCol = sanitize(finalRenameMap[oldCol] || oldCol);
        newRow[newCol] = row[oldCol];
      });
      return newRow;
    });

    console.debug('[DataReviewStep] Final corrections:', {
      renamedCount: Object.keys(finalRenameMap).length,
      updatedColumns: updatedColumns.slice(0, 5),
      wasStructured: !!structuredData
    });

    try {
      const { error: updateError } = await supabase
        .from('data_sources')
        .update({
          parsed_fields: {
            columns: updatedColumns,
            rows: finalRows,
            rowCount: finalRows.length,
            preview: updatedPreview,
            emptyColumnsRemoved: structuredData ? 0 : emptyColumnsRemoved
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
        rows: finalRows,  // ✅ CRITICAL: Pass rows!
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
  const currentColumns = structuredData ? structuredData.columns : columns;
  const currentPreview = structuredData ? structuredData.rows.slice(0, 10) : preview;
  const currentRowCount = structuredData ? structuredData.rows.length : rowCount;

  return (
    <div className="space-y-6 w-full max-w-6xl mx-auto">
      {needsStructuring && !structuredData && (
        <Alert className="border-orange-500 bg-orange-50 dark:bg-orange-950">
          <Wand2 className="h-4 w-4 text-orange-500" />
          <AlertTitle>Unstructured Data Detected</AlertTitle>
          <AlertDescription className="space-y-3">
            <p className="text-sm">
              Your data appears to be in a single column with comma-separated values. 
              AI can automatically parse this into proper structured columns.
            </p>
            <div className="flex gap-2">
              <Button
                onClick={handleStructureData}
                disabled={isStructuring}
                size="sm"
                className="bg-orange-500 hover:bg-orange-600"
              >
                {isStructuring ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Parsing...
                  </>
                ) : (
                  <>
                    <Wand2 className="mr-2 h-4 w-4" />
                    Parse with AI
                  </>
                )}
              </Button>
              <Button
                onClick={() => setNeedsStructuring(false)}
                variant="outline"
                size="sm"
                disabled={isStructuring}
              >
                Keep Original
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {structuredData && (
        <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
          <Check className="h-4 w-4 text-green-500" />
          <AlertTitle>Data Structured Successfully</AlertTitle>
          <AlertDescription>
            Parsed {columns.length} column into {structuredData.columns.length} structured fields
          </AlertDescription>
        </Alert>
      )}

      {/* Split Column Suggestions */}
      {analysis?.splitSuggestions && analysis.splitSuggestions.length > 0 && (
        <Alert className="border-blue-500 bg-blue-50 dark:bg-blue-950">
          <Scissors className="h-4 w-4 text-blue-500" />
          <AlertTitle>Multi-Value Column Detected</AlertTitle>
          <AlertDescription className="space-y-4">
            {analysis.splitSuggestions.map((suggestion, idx) => (
              <div key={idx} className="space-y-2">
                <p className="text-sm">
                  <span className="font-semibold">"{suggestion.column}"</span> appears to contain multiple values that should be separate columns:
                </p>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {suggestion.splitInto.map((col, colIdx) => (
                    <Badge key={colIdx} variant="secondary" className="text-xs">
                      {col}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{suggestion.reason}</p>
                <div className="flex gap-2 mt-2">
                  <Button
                    onClick={() => handleSplitColumn(suggestion)}
                    disabled={isSplittingColumn}
                    size="sm"
                    className="bg-blue-500 hover:bg-blue-600"
                  >
                    {isSplittingColumn ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Splitting...
                      </>
                    ) : (
                      <>
                        <Scissors className="mr-2 h-4 w-4" />
                        Split into {suggestion.splitInto.length} columns
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </AlertDescription>
        </Alert>
      )}

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
                    <div className="text-2xl font-bold">{currentRowCount.toLocaleString()}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">Columns</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      <div className="text-2xl font-bold">{currentColumns.length}</div>
                      {structuredData && (
                        <Badge variant="secondary" className="text-xs">AI Structured</Badge>
                      )}
                    </div>
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
                      {currentColumns.map((col, idx) => (
                        <TableHead key={idx}>{editedColumns[col] || col}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentPreview.map((row, rowIdx) => (
                      <TableRow key={rowIdx}>
                        {currentColumns.map((col, colIdx) => (
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
