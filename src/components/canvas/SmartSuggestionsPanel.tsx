import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { BarChart3, QrCode, Hash, Sparkles, X, CheckCircle2, Image } from 'lucide-react';
import { FieldSuggestion, getSuggestionDisplayName } from '@/lib/field-detection-utils';
import { FieldConfig } from '@/lib/canvas-utils';

interface SmartSuggestionsPanelProps {
  suggestions: FieldSuggestion[];
  onAcceptSuggestion: (suggestion: FieldSuggestion) => void;
  onDismiss: () => void;
  templateSize: { width: number; height: number };
}

export function SmartSuggestionsPanel({
  suggestions,
  onAcceptSuggestion,
  onDismiss,
}: SmartSuggestionsPanelProps) {
  const [acceptedSuggestions, setAcceptedSuggestions] = useState<Set<string>>(new Set());

  if (suggestions.length === 0) return null;

  const handleAccept = (suggestion: FieldSuggestion) => {
    onAcceptSuggestion(suggestion);
    setAcceptedSuggestions(prev => new Set(prev).add(suggestion.fieldName));
  };

  const getIcon = (type: 'barcode' | 'qrcode' | 'sequence' | 'image') => {
    switch (type) {
      case 'barcode':
        return <BarChart3 className="h-5 w-5" />;
      case 'qrcode':
        return <QrCode className="h-5 w-5" />;
      case 'sequence':
        return <Hash className="h-5 w-5" />;
      case 'image':
        return <Image className="h-5 w-5" />;
    }
  };

  const getConfidenceBadge = (confidence: 'high' | 'medium' | 'low') => {
    const variants: Record<string, any> = {
      high: 'default',
      medium: 'secondary',
      low: 'outline'
    };
    return (
      <Badge variant={variants[confidence]} className="text-xs">
        {confidence === 'high' ? '✓ High Match' : confidence === 'medium' ? 'Good Match' : 'Possible'}
      </Badge>
    );
  };

  return (
    <Card className="border-primary/50 shadow-lg animate-in slide-in-from-top-4">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base">Smart Field Detection</CardTitle>
              <CardDescription className="text-xs">
                We detected {suggestions.length} field{suggestions.length > 1 ? 's' : ''} that could be enhanced
              </CardDescription>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDismiss}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3">
        {suggestions.map((suggestion, index) => {
          const isAccepted = acceptedSuggestions.has(suggestion.fieldName);
          
          return (
            <Alert
              key={`${suggestion.fieldName}-${index}`}
              className={`${isAccepted ? 'border-green-500/50 bg-green-50 dark:bg-green-950/20' : ''}`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 text-primary">
                  {getIcon(suggestion.suggestedType)}
                </div>
                
                <div className="flex-1 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">
                      {suggestion.fieldName}
                    </span>
                    <span className="text-xs text-muted-foreground">→</span>
                    <span className="text-sm text-muted-foreground">
                      {getSuggestionDisplayName(suggestion.suggestedType)}
                    </span>
                    {getConfidenceBadge(suggestion.confidence)}
                  </div>
                  
                  <AlertDescription className="text-xs text-muted-foreground">
                    {suggestion.reason}
                    {suggestion.recommendedFormat && (
                      <span className="block mt-0.5">
                        Recommended format: <strong>{suggestion.recommendedFormat}</strong>
                      </span>
                    )}
                  </AlertDescription>
                </div>
                
                <div className="flex-shrink-0">
                  {isAccepted ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled
                      className="h-8 gap-1 text-green-600"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Added
                    </Button>
                  ) : (
                    <Button
                      onClick={() => handleAccept(suggestion)}
                      size="sm"
                      className="h-8"
                    >
                      Add
                    </Button>
                  )}
                </div>
              </div>
            </Alert>
          );
        })}
        
        <div className="pt-2 flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onDismiss}
            className="flex-1"
          >
            Dismiss Suggestions
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
