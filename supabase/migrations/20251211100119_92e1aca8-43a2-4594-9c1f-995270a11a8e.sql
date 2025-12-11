-- Create label_templates table for comprehensive Avery/brand label library
CREATE TABLE public.label_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identification
  brand TEXT NOT NULL,
  part_number TEXT NOT NULL,
  equivalent_to TEXT,
  
  -- Paper/Region
  paper_size TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT 'US',
  
  -- Label dimensions (stored in mm)
  label_width_mm NUMERIC NOT NULL,
  label_height_mm NUMERIC NOT NULL,
  label_shape TEXT NOT NULL DEFAULT 'rectangle',
  corner_radius_mm NUMERIC DEFAULT 0,
  
  -- Layout on sheet
  columns INTEGER NOT NULL,
  rows INTEGER NOT NULL,
  margin_left_mm NUMERIC NOT NULL,
  margin_top_mm NUMERIC NOT NULL,
  spacing_x_mm NUMERIC NOT NULL,
  spacing_y_mm NUMERIC NOT NULL,
  
  -- Computed columns
  labels_per_sheet INTEGER GENERATED ALWAYS AS (columns * rows) STORED,
  gap_x_mm NUMERIC GENERATED ALWAYS AS (spacing_x_mm - label_width_mm) STORED,
  gap_y_mm NUMERIC GENERATED ALWAYS AS (spacing_y_mm - label_height_mm) STORED,
  
  -- Metadata
  description TEXT,
  categories TEXT[],
  
  -- System
  created_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(brand, part_number)
);

-- Indexes for searching
CREATE INDEX idx_label_templates_brand ON public.label_templates(brand);
CREATE INDEX idx_label_templates_region ON public.label_templates(region);
CREATE INDEX idx_label_templates_part_number ON public.label_templates(part_number);
CREATE INDEX idx_label_templates_search ON public.label_templates USING gin(
  to_tsvector('english', brand || ' ' || part_number || ' ' || COALESCE(description, ''))
);

-- RLS: Everyone can read label templates
ALTER TABLE public.label_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view label templates" 
ON public.label_templates 
FOR SELECT 
USING (true);

-- Admins can manage label templates
CREATE POLICY "Admins can manage label templates" 
ON public.label_templates 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));