-- Create label_overrides table for per-label style customizations
CREATE TABLE IF NOT EXISTS public.label_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.templates(id) ON DELETE CASCADE,
  data_source_id UUID NOT NULL REFERENCES public.data_sources(id) ON DELETE CASCADE,
  label_index INTEGER NOT NULL,
  field_overrides JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(template_id, data_source_id, label_index)
);

-- Enable RLS
ALTER TABLE public.label_overrides ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view label overrides in their workspace"
  ON public.label_overrides
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.templates t
      WHERE t.id = template_id
      AND (t.workspace_id = (SELECT workspace_id FROM public.profiles WHERE id = auth.uid()))
    )
  );

CREATE POLICY "Users can insert label overrides in their workspace"
  ON public.label_overrides
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.templates t
      WHERE t.id = template_id
      AND (t.workspace_id = (SELECT workspace_id FROM public.profiles WHERE id = auth.uid()))
    )
  );

CREATE POLICY "Users can update label overrides in their workspace"
  ON public.label_overrides
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.templates t
      WHERE t.id = template_id
      AND (t.workspace_id = (SELECT workspace_id FROM public.profiles WHERE id = auth.uid()))
    )
  );

CREATE POLICY "Users can delete label overrides in their workspace"
  ON public.label_overrides
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.templates t
      WHERE t.id = template_id
      AND (t.workspace_id = (SELECT workspace_id FROM public.profiles WHERE id = auth.uid()))
    )
  );

-- Create updated_at trigger
CREATE TRIGGER update_label_overrides_updated_at
  BEFORE UPDATE ON public.label_overrides
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for performance
CREATE INDEX idx_label_overrides_template_data_source 
  ON public.label_overrides(template_id, data_source_id);