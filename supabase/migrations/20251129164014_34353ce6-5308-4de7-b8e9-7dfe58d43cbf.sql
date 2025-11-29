-- Clean up duplicate field mappings, keeping only the most recent
DELETE FROM field_mappings a
WHERE a.id NOT IN (
  SELECT DISTINCT ON (data_source_id, template_id) id
  FROM field_mappings
  ORDER BY data_source_id, template_id, created_at DESC
);

-- Add unique constraint to prevent future duplicates
ALTER TABLE field_mappings 
ADD CONSTRAINT unique_datasource_template 
UNIQUE (data_source_id, template_id);