-- Explicit deny of write/delete on product-images for public roles
DROP POLICY IF EXISTS "product-images no public insert" ON storage.objects;
DROP POLICY IF EXISTS "product-images no public update" ON storage.objects;
DROP POLICY IF EXISTS "product-images no public delete" ON storage.objects;

CREATE POLICY "product-images no public insert"
ON storage.objects FOR INSERT TO anon, authenticated
WITH CHECK (bucket_id = 'product-images' AND false);

CREATE POLICY "product-images no public update"
ON storage.objects FOR UPDATE TO anon, authenticated
USING (bucket_id = 'product-images' AND false)
WITH CHECK (bucket_id = 'product-images' AND false);

CREATE POLICY "product-images no public delete"
ON storage.objects FOR DELETE TO anon, authenticated
USING (bucket_id = 'product-images' AND false);