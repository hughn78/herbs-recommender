// Pack-shot renderer for the PRIVATE `product-images` storage bucket.
// Resolves a short-lived signed URL on the client, then renders the image.
// Renders nothing when the product has no approved pack shot.
import { useEffect, useState } from "react";
import { signedProductImageUrl } from "@/lib/product-images";
import type { ProductImageRef } from "@/lib/recommend-products";

export function PackShot({
  image,
  className,
}: {
  image: ProductImageRef | null | undefined;
  className?: string;
}) {
  const storagePath = image?.storage_path ?? null;
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!storagePath) {
      setSrc(null);
      return;
    }
    let active = true;
    void signedProductImageUrl(storagePath).then((url) => {
      if (active) setSrc(url);
    });
    return () => {
      active = false;
    };
  }, [storagePath]);

  if (!storagePath) return null;
  if (!src) return <div className={className} aria-hidden />;

  return (
    <img
      src={src}
      alt={image?.alt_text ?? "Product pack shot"}
      {...(image?.width ? { width: image.width } : {})}
      {...(image?.height ? { height: image.height } : {})}
      loading="lazy"
      className={className}
    />
  );
}

/** True when the product has an approved pack shot worth rendering. */
export function hasPackShot(image: ProductImageRef | null | undefined): boolean {
  return Boolean(image?.storage_path);
}
