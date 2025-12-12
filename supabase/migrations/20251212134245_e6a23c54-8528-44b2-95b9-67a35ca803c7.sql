-- Add storage RLS policies for users to upload/delete PDFs in their workspace folder

-- Allow authenticated users to upload PDFs to their workspace folder
CREATE POLICY "Users can upload PDFs to their workspace folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'generated-pdfs' 
  AND (storage.foldername(name))[1] = (public.get_user_workspace_id(auth.uid()))::text
);

-- Allow authenticated users to delete PDFs in their workspace folder (for cleanup)
CREATE POLICY "Users can delete PDFs in their workspace folder"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'generated-pdfs' 
  AND (storage.foldername(name))[1] = (public.get_user_workspace_id(auth.uid()))::text
);

-- Allow authenticated users to read PDFs in their workspace folder
CREATE POLICY "Users can read PDFs in their workspace folder"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'generated-pdfs' 
  AND (storage.foldername(name))[1] = (public.get_user_workspace_id(auth.uid()))::text
);