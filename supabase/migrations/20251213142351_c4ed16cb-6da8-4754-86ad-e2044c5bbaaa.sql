-- Create project-assets storage bucket for VDP images
INSERT INTO storage.buckets (id, name, public) 
VALUES ('project-assets', 'project-assets', false);

-- RLS policy: Users can view assets in their workspace
CREATE POLICY "Users can view their workspace assets"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'project-assets' 
  AND (storage.foldername(name))[1] = get_user_workspace_id(auth.uid())::text
);

-- RLS policy: Users can upload assets to their workspace
CREATE POLICY "Users can upload to their workspace"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'project-assets' 
  AND (storage.foldername(name))[1] = get_user_workspace_id(auth.uid())::text
);

-- RLS policy: Users can delete assets in their workspace
CREATE POLICY "Users can delete their workspace assets"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'project-assets' 
  AND (storage.foldername(name))[1] = get_user_workspace_id(auth.uid())::text
);