-- Create public-assets storage bucket for logo and public files
INSERT INTO storage.buckets (id, name, public) 
VALUES ('public-assets', 'public-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to public-assets bucket
CREATE POLICY "Public access to public-assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'public-assets');

-- Allow authenticated users to upload to public-assets
CREATE POLICY "Authenticated users can upload to public-assets"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'public-assets' AND auth.role() = 'authenticated');

-- Allow authenticated users to update their uploads in public-assets
CREATE POLICY "Authenticated users can update in public-assets"
ON storage.objects FOR UPDATE
USING (bucket_id = 'public-assets' AND auth.role() = 'authenticated');

-- Allow authenticated users to delete from public-assets
CREATE POLICY "Authenticated users can delete from public-assets"
ON storage.objects FOR DELETE
USING (bucket_id = 'public-assets' AND auth.role() = 'authenticated');