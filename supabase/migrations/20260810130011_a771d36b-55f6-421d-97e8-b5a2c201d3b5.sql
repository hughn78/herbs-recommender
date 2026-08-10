-- Phase 4b — product image storage bucket policies
-- The bucket itself is created via the storage API (public buckets are
-- blocked by workspace policy, so it is private with read policies).

-- Public read of approved product images (manufacturer pack shots).
DROP POLICY IF EXISTS "Public read product images" ON storage.objects;
CREATE POLICY "Public read product images"
ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'product-images');

-- Writes only via the service role (ingestion pipeline).
DROP POLICY IF EXISTS "Service write product images" ON storage.objects;
CREATE POLICY "Service write product images"
ON storage.objects FOR INSERT TO service_role
WITH CHECK (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Service update product images" ON storage.objects;
CREATE POLICY "Service update product images"
ON storage.objects FOR UPDATE TO service_role
USING (bucket_id = 'product-images');