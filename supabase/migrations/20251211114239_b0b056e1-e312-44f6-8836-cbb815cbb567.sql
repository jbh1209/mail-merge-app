-- Add avery_part_number column to templates table to store the label template reference
ALTER TABLE public.templates ADD COLUMN avery_part_number TEXT;

-- Add an index for faster lookups
CREATE INDEX idx_templates_avery_part_number ON public.templates(avery_part_number);