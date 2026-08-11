// Phase 9 — product pack-shot URL helper.
//
// The governed catalogue stores images in the PRIVATE `product-images`
// Supabase Storage bucket (the workspace intentionally blocks public buckets),
// so pack shots are delivered through short-lived signed URLs rather than
// getPublicUrl(). product_images.storage_path is bucket-prefixed
// ("product-images/<sha256>.<ext>") while the storage API expects the object
// key relative to the bucket, so strip the prefix before resolving.

import { supabase } from "@/integrations/supabase/client";
import type { ProductImageRef } from "./recommend-products";

export const PRODUCT_IMAGE_BUCKET = "product-images";

/** Signed URL lifetime. Long enough for a browsing session, short enough that
 *  a leaked URL expires quickly. */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

/** Re-sign a little before expiry so long sessions never render a dead URL. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export function productImageKey(
  storagePath: string | null | undefined,
): string | null {
  if (!storagePath) return null;
  return storagePath.startsWith(`${PRODUCT_IMAGE_BUCKET}/`)
    ? storagePath.slice(PRODUCT_IMAGE_BUCKET.length + 1)
    : storagePath;
}

type CacheEntry = { url: string; expiresAt: number };
const signedUrlCache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<string | null>>();

/** Resolve a signed URL for a private pack shot. Cached per object key so a
 *  catalogue grid signs each image once, not once per re-render. */
export async function signedProductImageUrl(
  storagePath: string | null | undefined,
): Promise<string | null> {
  const key = productImageKey(storagePath);
  if (!key) return null;

  const cached = signedUrlCache.get(key);
  if (cached && cached.expiresAt - REFRESH_MARGIN_MS > Date.now()) {
    return cached.url;
  }

  const existing = inFlight.get(key);
  if (existing) return existing;

  const pending = (async () => {
    const { data, error } = await supabase.storage
      .from(PRODUCT_IMAGE_BUCKET)
      .createSignedUrl(key, SIGNED_URL_TTL_SECONDS);
    if (error || !data?.signedUrl) return null;
    signedUrlCache.set(key, {
      url: data.signedUrl,
      expiresAt: Date.now() + SIGNED_URL_TTL_SECONDS * 1000,
    });
    return data.signedUrl;
  })().finally(() => inFlight.delete(key));

  inFlight.set(key, pending);
  return pending;
}

/** Static parts of the pack-shot <img>. Returns null when the product has no
 *  approved pack shot (HOG-0103 and any unapproved images) so cards never
 *  render a broken image. The `src` is resolved asynchronously — see
 *  <PackShot /> in @/components/pack-shot. */
export function productImageProps(image: ProductImageRef | null | undefined): {
  storagePath: string;
  alt: string;
  width?: number;
  height?: number;
} | null {
  if (!image?.storage_path) return null;
  return {
    storagePath: image.storage_path,
    alt: image.alt_text ?? "Product pack shot",
    ...(image.width ? { width: image.width } : {}),
    ...(image.height ? { height: image.height } : {}),
  };
}
