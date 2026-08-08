-- Phase 4b — product image storage bucket
-- Approved pack shots are served from Supabase Storage; the original
-- corpus provenance stays in product_images.original_source.
-- Idempotent: safe to re-run via the SQL editor.

INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

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
