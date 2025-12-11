-- Add missing popular Avery address and shipping label templates
INSERT INTO label_templates (brand, part_number, label_width_mm, label_height_mm, columns, rows, margin_left_mm, margin_top_mm, spacing_x_mm, spacing_y_mm, paper_size, region, description, label_shape, corner_radius_mm)
VALUES 
  -- 5161/8161 family - 1" x 4" (25.4mm x 101.6mm), 20 per sheet
  ('Avery', '5161', 101.6, 25.4, 2, 10, 4.78, 12.7, 3.18, 0, 'US-Letter', 'US', 'Address Labels 1" x 4"', 'rectangle', 0),
  ('Avery', '8161', 101.6, 25.4, 2, 10, 4.78, 12.7, 3.18, 0, 'US-Letter', 'US', 'Easy Peel Address Labels 1" x 4"', 'rectangle', 0),
  
  -- 5162/8162 family - 1-1/3" x 4" (33.87mm x 101.6mm), 14 per sheet
  ('Avery', '5162', 101.6, 33.87, 2, 7, 4.78, 21.59, 3.18, 0, 'US-Letter', 'US', 'Address Labels 1-1/3" x 4"', 'rectangle', 0),
  ('Avery', '8162', 101.6, 33.87, 2, 7, 4.78, 21.59, 3.18, 0, 'US-Letter', 'US', 'Easy Peel Address Labels 1-1/3" x 4"', 'rectangle', 0),
  
  -- 5163/8163 family - 2" x 4" (50.8mm x 101.6mm), 10 per sheet - MOST POPULAR SHIPPING
  ('Avery', '5163', 101.6, 50.8, 2, 5, 4.78, 12.7, 3.18, 0, 'US-Letter', 'US', 'Shipping Labels 2" x 4"', 'rectangle', 0),
  ('Avery', '8163', 101.6, 50.8, 2, 5, 4.78, 12.7, 3.18, 0, 'US-Letter', 'US', 'Easy Peel Shipping Labels 2" x 4"', 'rectangle', 0),
  
  -- 5164/8164 family - 3-1/3" x 4" (84.67mm x 101.6mm), 6 per sheet
  ('Avery', '5164', 101.6, 84.67, 2, 3, 4.78, 12.7, 3.18, 0, 'US-Letter', 'US', 'Shipping Labels 3-1/3" x 4"', 'rectangle', 0),
  ('Avery', '8164', 101.6, 84.67, 2, 3, 4.78, 12.7, 3.18, 0, 'US-Letter', 'US', 'Easy Peel Shipping Labels 3-1/3" x 4"', 'rectangle', 0),
  
  -- 5165/8165 family - 8.5" x 11" (215.9mm x 279.4mm), 1 per sheet - Full Sheet
  ('Avery', '5165', 215.9, 279.4, 1, 1, 0, 0, 0, 0, 'US-Letter', 'US', 'Full Sheet Labels 8.5" x 11"', 'rectangle', 0),
  ('Avery', '8165', 215.9, 279.4, 1, 1, 0, 0, 0, 0, 'US-Letter', 'US', 'Easy Peel Full Sheet Labels 8.5" x 11"', 'rectangle', 0),
  
  -- 5167/8167 family - 0.5" x 1.75" (12.7mm x 44.45mm), 80 per sheet - Return Address
  ('Avery', '5167', 44.45, 12.7, 4, 20, 12.07, 12.7, 6.35, 0, 'US-Letter', 'US', 'Return Address Labels 1/2" x 1-3/4"', 'rectangle', 0),
  ('Avery', '8167', 44.45, 12.7, 4, 20, 12.07, 12.7, 6.35, 0, 'US-Letter', 'US', 'Easy Peel Return Address Labels 1/2" x 1-3/4"', 'rectangle', 0),
  
  -- 5168 family - 3.5" x 5" (88.9mm x 127mm), 4 per sheet
  ('Avery', '5168', 88.9, 127, 2, 2, 19.05, 12.7, 9.53, 0, 'US-Letter', 'US', 'Shipping Labels 3-1/2" x 5"', 'rectangle', 0),
  
  -- 5263/8263 family - 2" x 4" (same as 5163 but TrueBlock)
  ('Avery', '5263', 101.6, 50.8, 2, 5, 4.78, 12.7, 3.18, 0, 'US-Letter', 'US', 'TrueBlock Shipping Labels 2" x 4"', 'rectangle', 0),
  ('Avery', '8263', 101.6, 50.8, 2, 5, 4.78, 12.7, 3.18, 0, 'US-Letter', 'US', 'Easy Peel TrueBlock Shipping Labels 2" x 4"', 'rectangle', 0),
  
  -- 5264/8264 family - 3-1/3" x 4" (TrueBlock version)
  ('Avery', '5264', 101.6, 84.67, 2, 3, 4.78, 12.7, 3.18, 0, 'US-Letter', 'US', 'TrueBlock Shipping Labels 3-1/3" x 4"', 'rectangle', 0),
  ('Avery', '8264', 101.6, 84.67, 2, 3, 4.78, 12.7, 3.18, 0, 'US-Letter', 'US', 'Easy Peel TrueBlock Shipping Labels 3-1/3" x 4"', 'rectangle', 0),
  
  -- 5266 family - File Folder Labels 2/3" x 3-7/16"
  ('Avery', '5266', 87.31, 16.93, 2, 15, 20.32, 12.7, 12.7, 0, 'US-Letter', 'US', 'File Folder Labels 2/3" x 3-7/16"', 'rectangle', 0),
  
  -- 5267 family - Return Address 0.5" x 1.75"
  ('Avery', '5267', 44.45, 12.7, 4, 20, 12.07, 12.7, 6.35, 0, 'US-Letter', 'US', 'Return Address Labels 1/2" x 1-3/4"', 'rectangle', 0),
  
  -- 5351 family - Copier Address Labels 1" x 2-13/16"
  ('Avery', '5351', 71.44, 25.4, 3, 10, 0, 12.7, 0, 0, 'US-Letter', 'US', 'Copier Address Labels 1" x 2-13/16"', 'rectangle', 0),
  
  -- 5352 family - Copier Mailing Labels 2" x 4-1/4"
  ('Avery', '5352', 107.95, 50.8, 2, 5, 0, 12.7, 0, 0, 'US-Letter', 'US', 'Copier Mailing Labels 2" x 4-1/4"', 'rectangle', 0),
  
  -- 5353 family - Copier Mailing Labels 2-11/16" x 4-1/4"  
  ('Avery', '5353', 107.95, 68.26, 2, 4, 0, 6.35, 0, 0, 'US-Letter', 'US', 'Copier Mailing Labels 2-11/16" x 4-1/4"', 'rectangle', 0),
  
  -- 5520 family - Weatherproof Address 1" x 2-5/8"
  ('Avery', '5520', 66.68, 25.4, 3, 10, 4.76, 12.7, 3.18, 0, 'US-Letter', 'US', 'Weatherproof Address Labels 1" x 2-5/8"', 'rectangle', 0),
  
  -- 5523 family - Weatherproof Shipping 2" x 4"
  ('Avery', '5523', 101.6, 50.8, 2, 5, 4.78, 12.7, 3.18, 0, 'US-Letter', 'US', 'Weatherproof Shipping Labels 2" x 4"', 'rectangle', 0),
  
  -- 5524 family - Weatherproof Shipping 3-1/3" x 4"
  ('Avery', '5524', 101.6, 84.67, 2, 3, 4.78, 12.7, 3.18, 0, 'US-Letter', 'US', 'Weatherproof Shipping Labels 3-1/3" x 4"', 'rectangle', 0),
  
  -- 18160 family - Easy Peel Address 1" x 2-5/8"
  ('Avery', '18160', 66.68, 25.4, 3, 10, 4.76, 12.7, 3.18, 0, 'US-Letter', 'US', 'Easy Peel Address Labels 1" x 2-5/8"', 'rectangle', 0),
  
  -- 18163 family - Easy Peel Shipping 2" x 4"
  ('Avery', '18163', 101.6, 50.8, 2, 5, 4.78, 12.7, 3.18, 0, 'US-Letter', 'US', 'Easy Peel Shipping Labels 2" x 4"', 'rectangle', 0)
  
ON CONFLICT (brand, part_number) DO UPDATE SET
  label_width_mm = EXCLUDED.label_width_mm,
  label_height_mm = EXCLUDED.label_height_mm,
  columns = EXCLUDED.columns,
  rows = EXCLUDED.rows,
  margin_left_mm = EXCLUDED.margin_left_mm,
  margin_top_mm = EXCLUDED.margin_top_mm,
  spacing_x_mm = EXCLUDED.spacing_x_mm,
  spacing_y_mm = EXCLUDED.spacing_y_mm,
  description = EXCLUDED.description;