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
  Send,
  RefreshCw,
  User,
  Bot,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
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
        },
      });

      if (error) throw error;

      setAnalysis(data as AnalysisResult);
      toast.success("AI analysis complete!");
    } catch (error: any) {
      console.error('Analysis error:', error);
      toast.error("AI analysis failed. You can still proceed manually.");
    } finally {
      setAnalyzing(false);
    }
  };

  const sendChatMessage = async (message: string) => {
    if (!message.trim() || !subscriptionFeatures.hasAdvancedAI) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: message,
      timestamp: new Date(),
    };

    setChatMessages(prev => [...prev, userMessage]);
    setChatInput('');
    setIsChatLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('data-assistant-chat', {
        body: {
          message,
          chatHistory: chatMessages,
          dataContext: {
            fileName,
            rowCount,
            columns,
            qualityIssues: analysis?.qualityIssues || [],
          },
        },
      });

      if (error) throw error;

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: data.message,
        timestamp: new Date(),
      };

      setChatMessages(prev => [...prev, assistantMessage]);
    } catch (error: any) {
      console.error('Chat error:', error);
      toast.error("Failed to get AI response");
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleColumnEdit = (original: string, newValue: string) => {
    setEditedColumns(prev => ({
      ...prev,
      [original]: newValue,
    }));
  };

  const calculateQualityScore = () => {
    if (!analysis) return 100;
    const issueCount = analysis.qualityIssues.length;
    const maxIssues = 10;
    return Math.max(0, Math.round(100 - (issueCount / maxIssues) * 100));
  };

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
                  <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                    {calculateQualityScore()}%
                  </p>
                  <p className="text-sm text-muted-foreground">Quality Score</p>
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
            <>
              <Alert>
                <Sparkles className="h-4 w-4" />
                <AlertTitle>Data Import Assistant</AlertTitle>
                <AlertDescription>
                  Ask me anything about your data quality, column formatting, missing values, 
                  or data cleaning best practices.
                </AlertDescription>
              </Alert>

              <ScrollArea className="h-[400px] border rounded-lg p-4">
                <div className="space-y-4">
                  {chatMessages.length === 0 && (
                    <div className="text-center py-8">
                      <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground mb-4">
                        Ask me questions about your data quality and formatting
                      </p>
                      
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground">
                          Suggested Questions:
                        </p>
                        {[
                          "What are the main quality issues with my data?",
                          "How should I handle the missing values?",
                          "Are there any duplicate records?",
                          "What's the best way to format these column names?"
                        ].map((q, idx) => (
                          <Button
                            key={idx}
                            variant="ghost"
                            size="sm"
                            className="text-xs w-full justify-start"
                            onClick={() => sendChatMessage(q)}
                          >
                            {q}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {chatMessages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        "flex gap-3 p-3 rounded-lg",
                        msg.role === 'user' 
                          ? "bg-primary/10 ml-8" 
                          : "bg-muted mr-8"
                      )}
                    >
                      <div className="shrink-0 w-8 h-8 rounded-full bg-background border flex items-center justify-center">
                        {msg.role === 'user' ? (
                          <User className="h-4 w-4" />
                        ) : (
                          <Bot className="h-4 w-4" />
                        )}
                      </div>
                      <div className="flex-1 space-y-1">
                        <p className="text-sm font-semibold">
                          {msg.role === 'user' ? 'You' : 'Data Assistant'}
                        </p>
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    </div>
                  ))}
                  
                  {isChatLoading && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Assistant is thinking...
                    </div>
                  )}
                </div>
              </ScrollArea>

              <div className="flex gap-2">
                <Input
                  placeholder="Ask about your data..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendChatMessage(chatInput);
                    }
                  }}
                  disabled={isChatLoading}
                />
                <Button
                  onClick={() => sendChatMessage(chatInput)}
                  disabled={!chatInput.trim() || isChatLoading}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </>
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
