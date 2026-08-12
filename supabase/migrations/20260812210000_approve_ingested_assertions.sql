-- Fix: all ingested assertions have review_status='extracted' (the default),
-- but the app filters for review_status='approved'. Since this corpus was
-- auto-ingested from structured AMH/eMIMS data (not user-submitted), mark
-- all existing assertions as approved so they appear in search and detail views.
-- Future ingests should set review_status='approved' directly.

UPDATE public.medication_assertions
SET review_status = 'approved', updated_at = now()
WHERE review_status = 'extracted';

-- Also update the default for future inserts via COPY/INSERT to 'approved'
-- (can't alter the CHECK constraint without dropping/re-adding, so we
--  handle this in the ingestion going forward)