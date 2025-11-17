import { useState, useEffect } from "react";
import { Wand2, Check, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { MappingPreview } from "./MappingPreview";
import { SubscriptionFeatures } from "@/hooks/useSubscription";

interface FieldMapping {
  templateField: string;
  dataColumn: string | null;
  confidence?: number;
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
  const [mappings, setMappings] = useState<FieldMapping[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const usableColumns = dataColumns.filter(c => c && c.trim() !== "" && !/^__EMPTY/i.test(c));
    const normalize = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    const autoMappings = templateFields.map(templateField => {
      const match = usableColumns.find(col => normalize(col) === normalize(templateField));
      return {
        templateField,
        dataColumn: match || null,
        confidence: match ? 95 : undefined
      };
    });
    
    setMappings(autoMappings);
    
    const autoMappedCount = autoMappings.filter(m => m.dataColumn).length;
    console.debug('[FieldMappingWizard] Auto-mapped:', autoMappedCount, 'of', templateFields.length);
    
    if (autoMappedCount > 0) {
      toast({
        title: "Auto-mapped fields",
        description: `Matched ${autoMappedCount} of ${templateFields.length} fields`,
      });
    }
  }, [templateFields, dataColumns]);

  const handleMappingChange = (templateField: string, dataColumn: string) => {
    setMappings(prev =>
      prev.map(m =>
        m.templateField === templateField ? { ...m, dataColumn, confidence: 100 } : m
      )
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const mappingsData = mappings.reduce((acc, m) => {
        if (m.dataColumn) acc[m.templateField] = m.dataColumn;
        return acc;
      }, {} as Record<string, string>);

      const { error } = await supabase
        .from('field_mappings')
        .insert({
          project_id: projectId,
          data_source_id: dataSourceId,
          template_id: templateId,
          mappings: mappingsData,
          user_confirmed: true,
        });

      if (error) throw error;

      toast({ title: "Mappings saved!" });
      onComplete();
    } catch (error: any) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const canSave = mappings.every(m => m.dataColumn !== null);
  const mappedCount = mappings.filter(m => m.dataColumn).length;
  const usableColumns = dataColumns.filter(c => c && c.trim() !== "" && !/^__EMPTY/i.test(c));

  return (
    <Card className="w-full max-w-5xl mx-auto">
      <CardHeader>
        <CardTitle>Map Your Data Fields</CardTitle>
        <CardDescription>Auto-mapped {mappedCount} of {templateFields.length} fields</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          {mappings.map((mapping) => (
            <div key={mapping.templateField} className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border rounded-lg">
              <div className="space-y-1">
                <Badge variant="outline">Template Field</Badge>
                <p className="font-semibold">{mapping.templateField}</p>
              </div>
              <div className="space-y-2">
                <Label>Maps to:</Label>
                <Select
                  value={mapping.dataColumn || ""}
                  onValueChange={(value) => handleMappingChange(mapping.templateField, value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select column..." />
                  </SelectTrigger>
                  <SelectContent>
                    {usableColumns.map((col) => (
                      <SelectItem key={col} value={col}>{col}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-between pt-4 border-t">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={handleSave} disabled={!canSave || saving}>
            {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : <><Check className="mr-2 h-4 w-4" />Save & Continue</>}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
