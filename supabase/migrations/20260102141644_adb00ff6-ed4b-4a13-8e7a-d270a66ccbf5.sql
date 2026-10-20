-- Restrict public-assets bucket to admin-only uploads
DROP POLICY IF EXISTS "Authenticated users can upload to public-assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update in public-assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete from public-assets" ON storage.objects;

-- Only admins can upload to public-assets
CREATE POLICY "Admins can upload to public-assets"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'public-assets' AND 
  public.has_role(auth.uid(), 'admin')
);

-- Only admins can update in public-assets
CREATE POLICY "Admins can update in public-assets"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'public-assets' AND 
  public.has_role(auth.uid(), 'admin')
);

-- Only admins can delete from public-assets
CREATE POLICY "Admins can delete from public-assets"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'public-assets' AND 
  public.has_role(auth.uid(), 'admin')
);

-- Add file size limit (5MB) and restrict to image types only
UPDATE storage.buckets 
SET 
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/svg+xml', 'image/webp']::text[]
WHERE id = 'public-assets';