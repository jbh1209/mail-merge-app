import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface DiagnosticResult {
  failures: Array<{
    issue: string;
    likely_cause: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
  }>;
  missing_information: string[];
  recommended_prompt_structure: {
    critical_rules: string[];
    spatial_specifications: string[];
    validation_checkpoints: string[];
    helpful_context: string[];
  };
  suggested_constraints: {
    field_naming: string;
    space_allocation: string;
    priority_enforcement: string;
    physical_constraints: string;
  };
  example_prompt_snippet: string;
}

interface DiagnosticModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  diagnostic: DiagnosticResult | null;
  isLoading?: boolean;
}

export function DiagnosticModal({ open, onOpenChange, diagnostic, isLoading }: DiagnosticModalProps) {
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'destructive';
      case 'high': return 'destructive';
      case 'medium': return 'default';
      case 'low': return 'secondary';
      default: return 'default';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
      case 'high':
        return <AlertTriangle className="h-4 w-4" />;
      case 'medium':
        return <Info className="h-4 w-4" />;
      case 'low':
        return <CheckCircle className="h-4 w-4" />;
      default:
        return <Info className="h-4 w-4" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>🤖 AI Layout Diagnostic Analysis</DialogTitle>
          <DialogDescription>
            Gemini's analysis of what went wrong and how to fix it
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-4">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              <p className="text-sm text-muted-foreground">AI is analyzing the layout...</p>
            </div>
          </div>
        ) : diagnostic ? (
          <ScrollArea className="flex-1 pr-4 max-h-[calc(90vh-200px)]">
            <div className="space-y-6">
              {/* Failures */}
              <div>
                <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  Issues Identified ({diagnostic.failures?.length || 0})
                </h3>
                <div className="space-y-3">
                  {diagnostic.failures?.map((failure, idx) => (
                    <Alert key={idx} variant={getSeverityColor(failure.severity) as any}>
                      <div className="flex items-start gap-3">
                        {getSeverityIcon(failure.severity)}
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium">{failure.issue}</span>
                            <Badge variant={getSeverityColor(failure.severity) as any} className="text-xs">
                              {failure.severity}
                            </Badge>
                          </div>
                          <AlertDescription className="text-sm">
                            {failure.likely_cause}
                          </AlertDescription>
                        </div>
                      </div>
                    </Alert>
                  ))}
                </div>
              </div>

              {/* Missing Information */}
              <div>
                <h3 className="font-semibold text-lg mb-3">📋 Missing Information</h3>
                <ul className="space-y-2">
                  {diagnostic.missing_information?.map((info, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm">
                      <span className="text-muted-foreground">•</span>
                      <span>{info}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Recommended Prompt Structure */}
              <div>
                <h3 className="font-semibold text-lg mb-3">✨ Recommended Prompt Structure</h3>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-2 text-sm text-destructive">Critical Rules (Must Have)</h4>
                    <ul className="space-y-1">
                      {diagnostic.recommended_prompt_structure?.critical_rules?.map((rule, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm">
                          <span className="text-destructive">⚠️</span>
                          <span>{rule}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2 text-sm text-primary">Spatial Specifications</h4>
                    <ul className="space-y-1">
                      {diagnostic.recommended_prompt_structure?.spatial_specifications?.map((spec, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm">
                          <span className="text-primary">📐</span>
                          <span>{spec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2 text-sm">Validation Checkpoints</h4>
                    <ul className="space-y-1">
                      {diagnostic.recommended_prompt_structure?.validation_checkpoints?.map((check, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm">
                          <span>✓</span>
                          <span>{check}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2 text-sm text-muted-foreground">Helpful Context</h4>
                    <ul className="space-y-1">
                      {diagnostic.recommended_prompt_structure?.helpful_context?.map((context, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <span>💡</span>
                          <span>{context}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              {/* Suggested Constraints */}
              <div>
                <h3 className="font-semibold text-lg mb-3">🎯 Implementation Strategies</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border rounded-lg p-3">
                    <h4 className="font-medium text-sm mb-2">Field Naming</h4>
                    <p className="text-sm text-muted-foreground">{diagnostic.suggested_constraints?.field_naming}</p>
                  </div>
                  <div className="border rounded-lg p-3">
                    <h4 className="font-medium text-sm mb-2">Space Allocation</h4>
                    <p className="text-sm text-muted-foreground">{diagnostic.suggested_constraints?.space_allocation}</p>
                  </div>
                  <div className="border rounded-lg p-3">
                    <h4 className="font-medium text-sm mb-2">Priority Enforcement</h4>
                    <p className="text-sm text-muted-foreground">{diagnostic.suggested_constraints?.priority_enforcement}</p>
                  </div>
                  <div className="border rounded-lg p-3">
                    <h4 className="font-medium text-sm mb-2">Physical Constraints</h4>
                    <p className="text-sm text-muted-foreground">{diagnostic.suggested_constraints?.physical_constraints}</p>
                  </div>
                </div>
              </div>

              {/* Example Prompt */}
              <div>
                <h3 className="font-semibold text-lg mb-3">📝 Example Prompt Snippet</h3>
                <pre className="bg-muted p-4 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap">
                  {diagnostic.example_prompt_snippet}
                </pre>
              </div>
            </div>
          </ScrollArea>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
