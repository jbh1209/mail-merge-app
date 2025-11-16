import { useState, useEffect } from "react";
import { Wand2, Check, AlertCircle, ArrowRight, Loader2, Lock, TrendingUp, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { MappingPreview } from "./MappingPreview";
import { SubscriptionFeatures } from "@/hooks/useSubscription";
import { useNavigate } from "react-router-dom";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScopedAIChat } from "./ScopedAIChat";

interface FieldMapping {
  templateField: string;
  dataColumn: string | null;
  confidence?: number;
  reasoning?: string;
}

interface FieldMappingWizardProps {
  projectId: string;
  dataSourceId: string;
  templateId: string;
  dataColumns: string[];
  templateFields: string[];
  sampleData: Record<string, any>[];
  subscriptionFeatures?: SubscriptionFeatures;
  onComplete: () => void;
  onCancel: () => void;
}

export function FieldMappingWizard({
  projectId,
  dataSourceId,
  templateId,
  dataColumns,
  templateFields,
  sampleData,
  subscriptionFeatures,
  onComplete,
  onCancel
}: FieldMappingWizardProps) {
  const navigate = useNavigate();
  const [mappings, setMappings] = useState<FieldMapping[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [overallConfidence, setOverallConfidence] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const { toast } = useToast();

  const hasAdvancedAI = subscriptionFeatures?.hasAdvancedAI ?? false;

  useEffect(() => {
    // Initialize with empty mappings
    setMappings(templateFields.map(field => ({
      templateField: field,
      dataColumn: null
    })));
  }, [templateFields]);

  const handleAISuggest = async () => {
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('suggest-field-mappings', {
        body: {
          dataColumns,
          templateFields,
          sampleData: sampleData.slice(0, 3)
        }
      });

      if (error) throw error;

      setMappings(data.mappings);
      setOverallConfidence(data.overallConfidence);
      
      toast({
        title: "AI suggestions ready",
        description: `${data.mappings.length} field mappings suggested with ${data.overallConfidence}% confidence`,
      });
    } catch (error: any) {
      console.error('AI suggestion error:', error);
      toast({
        title: "AI suggestion failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setAiLoading(false);
    }
  };

  const handleMappingChange = (templateField: string, dataColumn: string | null) => {
    setMappings(prev => prev.map(m => 
      m.templateField === templateField 
        ? { ...m, dataColumn, confidence: undefined, reasoning: undefined }
        : m
    ));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const mappingsObject = mappings.reduce((acc, m) => {
        if (m.dataColumn) {
          acc[m.templateField] = m.dataColumn;
        }
        return acc;
      }, {} as Record<string, string>);

      const { error } = await supabase.from('field_mappings').insert({
        project_id: projectId,
        data_source_id: dataSourceId,
        template_id: templateId,
        mappings: mappingsObject,
        ai_confidence_score: overallConfidence,
        user_confirmed: true
      });

      if (error) throw error;

      toast({
        title: "Field mapping saved",
        description: "Your field mappings have been saved successfully",
      });

      onComplete();
    } catch (error: any) {
      console.error('Save error:', error);
      toast({
        title: "Failed to save mappings",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const mappedCount = mappings.filter(m => m.dataColumn).length;
  const isComplete = mappedCount === templateFields.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Map Data Columns to Template Fields</h3>
          <p className="text-sm text-muted-foreground">
            Connect your data columns to the template fields
          </p>
        </div>
        <Button
          onClick={handleAISuggest}
          disabled={aiLoading}
          variant="outline"
        >
          {aiLoading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Wand2 className="h-4 w-4 mr-2" />
              AI Suggest Mappings
            </>
          )}
        </Button>
      </div>

      {overallConfidence > 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            AI confidence: <strong>{overallConfidence}%</strong> - Review suggestions and adjust as needed
          </AlertDescription>
        </Alert>
          )}

          {subscriptionFeatures?.hasAdvancedAI && (
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant="outline" className="w-full gap-2">
                  <HelpCircle className="h-4 w-4" />
                  Need help with mapping?
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-4">
                <ScopedAIChat
                  persona="data-assistant"
                  context={{
                    dataColumns,
                    templateFields,
                    currentMappings: mappings.reduce((acc, m) => {
                      if (m.dataColumn) acc[m.templateField] = m.dataColumn;
                      return acc;
                    }, {} as Record<string, string>),
                    sampleData
                  }}
                  maxHeight="h-[400px]"
                />
              </CollapsibleContent>
            </Collapsible>
          )}

          <Card>
        <CardHeader>
          <CardTitle className="text-base">Field Mappings</CardTitle>
          <CardDescription>
            {mappedCount} of {templateFields.length} fields mapped
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {mappings.map((mapping) => (
            <div key={mapping.templateField} className="flex items-center gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-sm">{mapping.templateField}</span>
                  {mapping.confidence && (
                    <Badge variant="secondary" className="text-xs">
                      {mapping.confidence}% match
                    </Badge>
                  )}
                </div>
                {mapping.reasoning && (
                  <p className="text-xs text-muted-foreground">{mapping.reasoning}</p>
                )}
              </div>

              <ArrowRight className="h-4 w-4 text-muted-foreground" />

              <div className="flex-1">
                <Select
                  value={mapping.dataColumn || "none"}
                  onValueChange={(value) => 
                    handleMappingChange(mapping.templateField, value === "none" ? null : value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select data column" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      <span className="text-muted-foreground">No mapping</span>
                    </SelectItem>
                    {dataColumns.map(col => (
                      <SelectItem key={col} value={col}>{col}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {mappedCount > 0 && (
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowPreview(!showPreview)}
          >
            {showPreview ? "Hide Preview" : "Show Preview"}
          </Button>
        </div>
      )}

      {showPreview && mappedCount > 0 && (
        <MappingPreview
          mappings={mappings.reduce((acc, m) => {
            if (m.dataColumn) acc[m.templateField] = m.dataColumn;
            return acc;
          }, {} as Record<string, string>)}
          sampleData={sampleData.slice(0, 5)}
        />
      )}

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving || mappedCount === 0}>
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Check className="h-4 w-4 mr-2" />
              Save Mapping {!isComplete && `(${mappedCount}/${templateFields.length})`}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
