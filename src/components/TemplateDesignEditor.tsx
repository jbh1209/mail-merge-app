import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DesignEditorWithFabric } from './editor/DesignEditorWithFabric';

interface TemplateDesignEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: any;
  projectId: string;
  onSave: (designConfig: any) => void;
  useLegacyEditor?: boolean;
}

export function TemplateDesignEditor({
  open,
  onOpenChange,
  template,
  projectId,
  onSave,
  useLegacyEditor = false,
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
    onOpenChange(false);
  };

  if (!open) return null;

  // Use the new Polotno-style editor by default
  if (!useLegacyEditor) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[1400px] max-w-[98vw] h-[95vh] max-h-[95vh] p-0 overflow-hidden">
          <DesignEditorWithFabric
            template={{
              id: template.id,
              name: template.name,
              width_mm: template.width_mm,
              height_mm: template.height_mm,
              design_config: template.design_config
            }}
            projectId={projectId}
            sampleData={sampleData}
            availableFields={fieldNames}
            onSave={handleSave}
            onClose={() => onOpenChange(false)}
          />
        </DialogContent>
      </Dialog>
    );
  }

  // Legacy editor - import dynamically to avoid bundle bloat
  const LegacyEditor = require('./TemplateDesignCanvas').TemplateDesignCanvas;
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[1400px] max-w-[98vw] max-h-[95vh] p-0">
        <LegacyEditor
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
