import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { TemplateDesignCanvas } from './TemplateDesignCanvas';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface TemplateDesignEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: any;
  projectId: string;
  onSave: (designConfig: any) => void;
}

export function TemplateDesignEditor({
  open,
  onOpenChange,
  template,
  projectId,
  onSave,
}: TemplateDesignEditorProps) {
  // Fetch the latest data source for preview samples
  const { data: dataSource } = useQuery({
    queryKey: ["data-source-for-editor", projectId],
    queryFn: async () => {
      const { data } = await supabase
        .from("data_sources")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      return data;
    },
    enabled: open,
  });

  // Fetch field names from field_mappings if design_config.fields doesn't exist
  const { data: fieldMapping } = useQuery({
    queryKey: ["field-mapping-for-template", template.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("field_mappings")
        .select("mappings")
        .eq("template_id", template.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      return data;
    },
    enabled: open && !template.design_config?.fields,
  });

  // Extract sample data from parsed_fields
  const sampleData = (dataSource?.parsed_fields as any)?.rows || 
                     (dataSource?.parsed_fields as any)?.preview || 
                     [];

  // Extract field names from design_config or field_mappings
  const fieldNames = template.design_config?.fields?.map((f: any) => f.templateField) 
    || (fieldMapping?.mappings ? Object.keys(fieldMapping.mappings) : []);

  const handleSave = (updatedConfig: any) => {
    onSave(updatedConfig);
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] p-0">
        <TemplateDesignCanvas
          templateSize={{
            width: template.width_mm,
            height: template.height_mm
          }}
          templateName={template.name}
          fieldNames={fieldNames}
          sampleData={sampleData}
          initialDesignConfig={template.design_config}
          onSave={handleSave}
          onCancel={() => onOpenChange(false)}
          templateId={template.id}
          projectId={projectId}
        />
      </DialogContent>
    </Dialog>
  );
}
