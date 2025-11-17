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
    
    // Normalize with typo handling
    const normalizeHard = (s: string) => {
      const lower = s.toLowerCase();
      // Replace common confusions before stripping
      const replaced = lower
        .replace(/sto+re?/g, "store")      // stoore -> store, storre -> store
        .replace(/syore/g, "store")        // syore -> store
        .replace(/\baddr(ess)?\b/g, "address")
        .replace(/\bmgr\b/g, "manager")
        .replace(/\bprov(ince)?\b/g, "province")
        .replace(/\bcode\b/g, "code")
        .replace(/\bid\b/g, "code");       // code/id synonym
      // Remove non-alphanumeric
      const stripped = replaced.replace(/[^a-z0-9]+/g, "");
      // Collapse repeated letters: stoore -> store
      return stripped.replace(/([a-z0-9])\1+/g, "$1");
    };

    const tokenize = (s: string) =>
      s.toLowerCase().split(/[\s_]+/).filter(Boolean);

    const jaccard = (a: string[], b: string[]) => {
      const A = new Set(a);
      const B = new Set(b);
      const inter = [...A].filter(x => B.has(x)).length;
      const uni = new Set([...a, ...b]).size;
      return uni ? inter / uni : 0;
    };

    const levenshtein = (a: string, b: string) => {
      const m = a.length, n = b.length;
      if (!m) return n;
      if (!n) return m;
      const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
      for (let i = 0; i <= m; i++) dp[i][0] = i;
      for (let j = 0; j <= n; j++) dp[0][j] = j;
      for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
          const cost = a[i - 1] === b[j - 1] ? 0 : 1;
          dp[i][j] = Math.min(
            dp[i - 1][j] + 1,
            dp[i][j - 1] + 1,
            dp[i - 1][j - 1] + cost
          );
        }
      }
      return dp[m][n];
    };

    const similarity = (aRaw: string, bRaw: string) => {
      const a = normalizeHard(aRaw);
      const b = normalizeHard(bRaw);
      if (!a || !b) return 0;
      if (a === b) return 1;

      // Substring score
      const substringScore = (a.includes(b) || b.includes(a)) ? 0.9 : 0;

      // Token similarity
      const tokensA = tokenize(aRaw);
      const tokensB = tokenize(bRaw);
      const tokenScore = jaccard(tokensA, tokensB);

      // Edit distance similarity
      const dist = levenshtein(a, b);
      const maxLen = Math.max(a.length, b.length);
      const editScore = 1 - dist / Math.max(1, maxLen);

      return Math.max(substringScore, tokenScore, editScore);
    };

    const THRESHOLD = 0.72;
    const used = new Set<string>();

    const autoMappings = templateFields.map(tf => {
      let best: { col: string | null; score: number } = { col: null, score: 0 };
      for (const col of usableColumns) {
        if (used.has(col)) continue;
        const s = similarity(tf, col);
        if (s > best.score) best = { col, score: s };
      }
      if (best.col && best.score >= THRESHOLD) {
        used.add(best.col);
        return { 
          templateField: tf, 
          dataColumn: best.col, 
          confidence: Math.round(best.score * 100) 
        };
      }
      return { templateField: tf, dataColumn: null };
    });

    setMappings(autoMappings);
    
    const autoMappedCount = autoMappings.filter(m => m.dataColumn).length;
    console.debug('[FieldMappingWizard] Auto-mapped:', autoMappedCount, 'of', templateFields.length, 'fields');
    
    if (autoMappedCount > 0) {
      toast({
        title: "Auto-mapped fields",
        description: `Matched ${autoMappedCount} of ${templateFields.length} fields`,
      });
    }
  }, [templateFields, dataColumns, toast]);

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
