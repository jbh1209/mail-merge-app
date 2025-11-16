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
import {
  AlertCircle,
  Check,
  HelpCircle,
  Sparkles,
  TrendingUp,
  MessageSquare,
  RefreshCw,
  Loader2,
} from "lucide-react";
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

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
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
        },
      });

      if (error) throw error;

      setAnalysis(data as AnalysisResult);
      toast.success("AI analysis complete!");
    } catch (error: any) {
      console.error('Analysis error:', error);
      // Parse and display specific error codes from backend
      const msg = String(error?.message || '');
      const status = (error?.status ?? error?.context?.response?.status ?? error?.cause?.status) as number | undefined;
      let errorCode = null;
      try {
        if (error?.message) {
          const parsed = JSON.parse(error.message);
          errorCode = parsed?.code;
        }
      } catch {}

      const lower = msg.toLowerCase();

      if (errorCode === 'PLAN_REQUIRED' || ((status === 402 || msg.includes('402')) && (msg.includes('PLAN_REQUIRED') || lower.includes('requires pro')))) {
        toast.error("AI data cleaning requires Pro or Business plan. Upgrade in Settings → Plans.");
      } else if (errorCode === 'AI_CREDITS_EXHAUSTED' || (status === 402 || msg.includes('402'))) {
        toast.error("AI credits exhausted. Add credits in Settings → Workspace → Usage.");
      } else if (errorCode === 'RATE_LIMITED' || status === 429 || msg.includes('429')) {
        toast.error("Rate limit exceeded. Please wait a minute and try again.");
      } else if (status === 401 || status === 403 || lower.includes('unauthorized')) {
        toast.error("Authentication required. Please sign in again and retry.");
      } else {
        toast.error("AI analysis failed. You can still proceed manually.");
      }
    } finally {
      setAnalyzing(false);
    }
  };

  const handleColumnEdit = (original: string, newValue: string) => {
    setEditedColumns(prev => ({
      ...prev,
      [original]: newValue,
    }));
  };

  const calculateQualityScore = () => {
    if (!analysis) return null;
    const issueCount = analysis.qualityIssues.length;
    const maxIssues = 10;
    return Math.max(0, Math.round(100 - (issueCount / maxIssues) * 100));
  };

  const unnamedColumns = parsedData.columns.filter(col => 
    col.startsWith('Unnamed_Column_')
  );

  const handleAcceptAndContinue = () => {
    setDataValidated(true);
    
    // Apply column edits if any
    const updatedColumns = columns.map(col => editedColumns[col] || col);
    
    onComplete({
      columns: updatedColumns,
      analysis,
    });
  };

  if (analyzing) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <div className="text-center space-y-2">
          <h3 className="font-semibold text-lg">Analyzing Your Data</h3>
          <p className="text-sm text-muted-foreground">
            AI is reviewing data quality and structure...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Review & Validate Data</h2>
        <p className="text-muted-foreground">
          Check your data quality and make any necessary adjustments before proceeding.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="quality">
            Quality
            {analysis && analysis.qualityIssues.length > 0 && (
              <Badge variant="destructive" className="ml-2">
                {analysis.qualityIssues.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="assistant">
            AI Assistant
            {!subscriptionFeatures.hasAdvancedAI && (
              <Badge variant="secondary" className="ml-2">Pro</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {unnamedColumns.length > 0 && (
          <Alert className="mt-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Unnamed Columns Detected</AlertTitle>
            <AlertDescription>
              Your file had {unnamedColumns.length} unnamed column{unnamedColumns.length > 1 ? 's' : ''}. 
              They've been renamed to 'Unnamed_Column_X'. Consider updating your source file with proper column names.
            </AlertDescription>
          </Alert>
        )}

        <TabsContent value="overview" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Data Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
                  <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{rowCount}</p>
                  <p className="text-sm text-muted-foreground">Total Rows</p>
                </div>
                <div className="text-center p-4 bg-green-50 dark:bg-green-950/30 rounded-lg">
                  <p className="text-3xl font-bold text-green-600 dark:text-green-400">{columns.length}</p>
                  <p className="text-sm text-muted-foreground">Columns</p>
                </div>
                <div className="text-center p-4 bg-amber-50 dark:bg-amber-950/30 rounded-lg">
                  <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">
                    {analysis?.qualityIssues?.length || 0}
                  </p>
                  <p className="text-sm text-muted-foreground">Quality Issues</p>
                </div>
                <div className="text-center p-4 bg-purple-50 dark:bg-purple-950/30 rounded-lg">
                  {calculateQualityScore() !== null ? (
                    <>
                      <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                        {calculateQualityScore()}%
                      </p>
                      <p className="text-sm text-muted-foreground">Quality Score</p>
                    </>
                  ) : (
                    <>
                      <p className="text-3xl font-bold text-muted-foreground">
                        N/A
                      </p>
                      <p className="text-sm text-muted-foreground">Quality Score</p>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {analysis?.suggestions && analysis.suggestions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  AI Recommendations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {analysis.suggestions.map((suggestion, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <TrendingUp className="h-4 w-4 text-primary mt-1 shrink-0" />
                      <span className="text-sm">{suggestion}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setActiveTab('quality')}>
              Review Quality Issues
            </Button>
            <Button
              variant="outline"
              onClick={() => setActiveTab('assistant')}
              disabled={!subscriptionFeatures.hasAdvancedAI}
            >
              <MessageSquare className="mr-2 h-4 w-4" />
              Ask AI Assistant
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="preview" className="space-y-4 mt-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Data Preview</h3>
              <p className="text-sm text-muted-foreground">
                Showing first 10 rows of {rowCount}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={runInitialAnalysis}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>

          <div className="border rounded-lg overflow-auto max-h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((col, idx) => (
                    <TableHead key={idx} className="whitespace-nowrap">
                      <div className="space-y-1">
                        <div className="font-semibold">{col}</div>
                        {analysis?.columnMappings?.[idx] && (
                          <Badge variant="secondary" className="text-xs">
                            {analysis.columnMappings[idx].dataType}
                          </Badge>
                        )}
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.slice(0, 10).map((row, rowIdx) => (
                  <TableRow key={rowIdx}>
                    {columns.map((col, colIdx) => (
                      <TableCell key={colIdx}>
                        {row[col] || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="quality" className="space-y-4 mt-6">
          {analysis?.columnMappings && (
            <Card>
              <CardHeader>
                <CardTitle>Column Names & Types</CardTitle>
                <CardDescription>
                  AI-suggested improvements for column names and data types
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {analysis.columnMappings.map((mapping, idx) => (
                    <div key={idx} className="flex flex-col md:flex-row items-start md:items-center gap-3 p-3 border rounded-lg">
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
                        <div>
                          <Label className="text-xs text-muted-foreground">Original</Label>
                          <p className="font-mono text-sm">{mapping.original}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Suggested</Label>
                          <Input
                            value={editedColumns[mapping.original] || mapping.suggested}
                            onChange={(e) => handleColumnEdit(mapping.original, e.target.value)}
                            className="h-8 font-mono text-sm"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Badge 
                          variant={mapping.confidence > 0.8 ? "default" : "secondary"}
                          className="shrink-0"
                        >
                          {Math.round(mapping.confidence * 100)}%
                        </Badge>
                        <Badge variant="outline" className="shrink-0">
                          {mapping.dataType}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {analysis?.qualityIssues && analysis.qualityIssues.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Quality Issues Detected</AlertTitle>
              <AlertDescription>
                <ul className="mt-2 space-y-1 list-disc list-inside">
                  {analysis.qualityIssues.map((issue, idx) => (
                    <li key={idx} className="text-sm">{issue}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {!analysis && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>No AI Analysis Available</AlertTitle>
              <AlertDescription>
                AI data cleaning is available on Pro and Business plans. You can still proceed manually.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex gap-3">
            <Button onClick={handleAcceptAndContinue} variant="default">
              <Check className="mr-2 h-4 w-4" />
              Accept & Continue
            </Button>
            <Button 
              variant="outline" 
              onClick={() => setActiveTab('assistant')}
              disabled={!subscriptionFeatures.hasAdvancedAI}
            >
              <HelpCircle className="mr-2 h-4 w-4" />
              Get Help from AI
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="assistant" className="space-y-4 mt-6">
          {!subscriptionFeatures.hasAdvancedAI ? (
            <Alert>
              <Sparkles className="h-4 w-4" />
              <AlertTitle>Upgrade to Pro</AlertTitle>
              <AlertDescription>
                The AI Data Assistant is available on Pro and Business plans. Upgrade to get personalized help with your data quality and formatting.
              </AlertDescription>
            </Alert>
          ) : (
            <ScopedAIChat
              persona="data-assistant"
              context={{
                fileName: parsedData.fileName,
                rowCount: parsedData.rowCount,
                columns: parsedData.columns,
                qualityIssues: analysis?.qualityIssues || []
              }}
              maxHeight="h-[450px]"
            />
          )}
        </TabsContent>
      </Tabs>

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        {dataValidated && (
          <Button onClick={handleAcceptAndContinue}>
            Continue to Template Selection
          </Button>
        )}
      </div>
    </div>
  );
}
