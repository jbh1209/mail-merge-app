import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertCircle, ArrowRight, Lightbulb } from 'lucide-react';
import { FieldConfig, mmToPx } from '@/lib/canvas-utils';
import { detectTextOverflow, calculateBestFitFontSize } from '@/lib/text-measurement-utils';

interface OversetLabel {
  absoluteLabelIndex: number;
  pageNumber: number;
  labelOnPage: number;
  fieldName: string;
  overflowPercentage: number;
  currentFontSize: number;
  suggestedFontSize: number;
}

interface OversetAnalysisPanelProps {
  template: any;
  designConfig: any;
  allDataRows: any[];
  fieldMappings: Record<string, string>;
  labelsPerPage: number;
  onJumpToLabel: (labelIndex: number) => void;
  highlightedLabelIndex?: number;
}

export function OversetAnalysisPanel({
  template,
  designConfig,
  allDataRows,
  fieldMappings,
  labelsPerPage,
  onJumpToLabel,
  highlightedLabelIndex
}: OversetAnalysisPanelProps) {
  const fields: FieldConfig[] = designConfig?.fields || [];

  // Analyze all labels for overflow
  const oversetLabels = useMemo<OversetLabel[]>(() => {
    const oversets: OversetLabel[] = [];

    allDataRows.forEach((row, absoluteIndex) => {
      fields.forEach(field => {
        if (field.fieldType !== 'text') return;

        const dataColumn = fieldMappings[field.templateField];
        if (!dataColumn) return;

        const text = String(row[dataColumn] || '');
        if (!text) return;

        const containerWidth = mmToPx(field.size.width, 1);
        const containerHeight = mmToPx(field.size.height, 1);

        const overflow = detectTextOverflow(
          text,
          containerWidth,
          containerHeight,
          field.style.fontSize,
          field.style.fontFamily,
          field.style.fontWeight
        );

        if (overflow.hasOverflow) {
          // Calculate suggested font size
          const fitResult = calculateBestFitFontSize(
            text,
            containerWidth,
            containerHeight,
            field.style.fontSize,
            field.style.fontFamily,
            field.style.fontWeight
          );

          oversets.push({
            absoluteLabelIndex: absoluteIndex,
            pageNumber: Math.floor(absoluteIndex / labelsPerPage) + 1,
            labelOnPage: (absoluteIndex % labelsPerPage) + 1,
            fieldName: field.templateField,
            overflowPercentage: overflow.overflowPercentage,
            currentFontSize: field.style.fontSize,
            suggestedFontSize: fitResult.fontSize
          });
        }
      });
    });

    return oversets;
  }, [allDataRows, fields, fieldMappings, labelsPerPage]);

  const groupedByLabel = useMemo(() => {
    const groups = new Map<number, OversetLabel[]>();
    
    oversetLabels.forEach(overset => {
      const existing = groups.get(overset.absoluteLabelIndex) || [];
      existing.push(overset);
      groups.set(overset.absoluteLabelIndex, existing);
    });

    return groups;
  }, [oversetLabels]);

  if (oversetLabels.length === 0) {
    return (
      <Card className="w-[350px]">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-green-600" />
            Analysis Complete
          </CardTitle>
          <CardDescription>
            All labels fit perfectly!
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
            <p className="text-sm text-green-800">
              ✓ No text overflow detected in {allDataRows.length} labels
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-[400px] flex flex-col">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-destructive" />
          Overset Detection
        </CardTitle>
        <CardDescription>
          {groupedByLabel.size} labels with text overflow found
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden">
        <ScrollArea className="h-[500px] pr-4">
          <div className="space-y-4">
            {Array.from(groupedByLabel.entries()).map(([labelIndex, oversets]) => {
              const isHighlighted = labelIndex === highlightedLabelIndex;
              const firstOverset = oversets[0];

              return (
                <div
                  key={labelIndex}
                  className={`border rounded-lg p-3 transition-all ${
                    isHighlighted 
                      ? 'border-primary bg-primary/5 shadow-md' 
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="font-medium text-sm">
                        Label #{labelIndex + 1}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Page {firstOverset.pageNumber}, Position {firstOverset.labelOnPage}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onJumpToLabel(labelIndex)}
                    >
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {oversets.map((overset, idx) => (
                      <div key={idx} className="text-xs bg-muted rounded p-2">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium">{overset.fieldName}</span>
                          <Badge variant="destructive" className="text-[10px]">
                            +{overset.overflowPercentage}%
                          </Badge>
                        </div>
                        <div className="text-muted-foreground">
                          Current: {overset.currentFontSize}pt → Suggested: {overset.suggestedFontSize}pt
                        </div>
                      </div>
                    ))}
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full mt-2"
                    disabled
                  >
                    Quick Fix (Coming Soon)
                  </Button>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
