// Phase 9 — product pack-shot URL helper.
//
// The governed catalogue stores images in the public `product-images`
// Supabase Storage bucket. product_images.storage_path is bucket-prefixed
// ("product-images/<sha256>.<ext>") while the storage API expects the object
// key relative to the bucket, so strip the prefix before resolving.

import { supabase } from "@/integrations/supabase/client";
import type { ProductImageRef } from "./recommend-products";

export const PRODUCT_IMAGE_BUCKET = "product-images";

export function productImageUrl(
  storagePath: string | null | undefined,
): string | null {
  if (!storagePath) return null;
  const key = storagePath.startsWith(`${PRODUCT_IMAGE_BUCKET}/`)
    ? storagePath.slice(PRODUCT_IMAGE_BUCKET.length + 1)
    : storagePath;
  return supabase.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(key).data
    .publicUrl;
}

/** Shared card thumbnail. Renders nothing when the product has no approved
 *  pack shot (HOG-0103 and any unapproved images) so cards never show a
 *  broken image. */
export function productImageProps(image: ProductImageRef | null | undefined): {
  src: string;
  alt: string;
  width?: number;
  height?: number;
} | null {
  if (!image?.storage_path) return null;
  const src = productImageUrl(image.storage_path);
  if (!src) return null;
  return {
    src,
    alt: image.alt_text ?? "Product pack shot",
    ...(image.width ? { width: image.width } : {}),
    ...(image.height ? { height: image.height } : {}),
  };
}
