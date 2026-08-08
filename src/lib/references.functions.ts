// Phase 12 — source-material explorer server functions.
//
// Ordinary authenticated staff can browse the governed provenance chain:
// source_documents (the 5 real corpus files) → source_sections (per-product
// monograph sections) → source_claims (659 extracted claims) →
// claim_citations (page-level evidence). Ingestion controls remain
// admin-only elsewhere; this module is read-only.

import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SourceDocumentRow = {
  documentId: string;
  title: string;
  format: string;
  corpusPath: string;
  sha256: string;
  pageCount: number | null;
  role: string;
  sectionCount: number;
};

export type SourceSectionRow = {
  sectionId: string;
  hogCode: string;
  heading: string | null;
  page: number | null;
  text: string | null;
};

export type ProductClaimRow = {
  claimId: string;
  claimType: string;
  text: string;
  extractionConfidence: string | null;
  reviewStatus: string;
  citations: Array<{
    documentTitle: string;
    page: number | null;
    sectionHeading: string | null;
    excerpt: string | null;
  }>;
};

export const listSourceDocumentsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SourceDocumentRow[]> => {
    const db = context.supabase as unknown as SupabaseClient;
    const { data, error } = await db
      .from("source_documents")
      .select("document_id, title, format, corpus_path, sha256, page_count, role, source_sections(section_id)")
      .order("role", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((d) => ({
      documentId: d.document_id as string,
      title: d.title as string,
      format: d.format as string,
      corpusPath: d.corpus_path as string,
      sha256: d.sha256 as string,
      pageCount: (d.page_count as number | null) ?? null,
      role: d.role as string,
      sectionCount: Array.isArray(d.source_sections) ? d.source_sections.length : 0,
    }));
  });

export const listDocumentSectionsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { documentId: string }) => d)
  .handler(async ({ data, context }): Promise<SourceSectionRow[]> => {
    const db = context.supabase as unknown as SupabaseClient;
    const { data: rows, error } = await db
      .from("source_sections")
      .select("section_id, hog_code, heading, page, text")
      .eq("document_id", data.documentId)
      .order("page", { ascending: true, nullsFirst: false })
      .order("hog_code", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((s) => ({
      sectionId: s.section_id as string,
      hogCode: s.hog_code as string,
      heading: (s.heading as string | null) ?? null,
      page: (s.page as number | null) ?? null,
      text: (s.text as string | null) ?? null,
    }));
  });

/** Extracted claims for one product with their page-level citations. This
 *  powers the "Evidence" view on the product detail page and the References
 *  explorer's per-product mode. */
export const listProductClaimsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { hogCode: string }) => d)
  .handler(async ({ data, context }): Promise<ProductClaimRow[]> => {
    const db = context.supabase as unknown as SupabaseClient;
    const { data: claims, error } = await db
      .from("source_claims")
      .select("claim_id, claim_type, text, extraction_confidence, review_status")
      .eq("hog_code", data.hogCode)
      .order("claim_type", { ascending: true });
    if (error) throw new Error(error.message);
    if (!claims?.length) return [];

    const claimIds = claims.map((c) => c.claim_id as string);
    const { data: citations, error: citErr } = await db
      .from("claim_citations")
      .select("claim_id, page, section_heading, excerpt, source_documents(title)")
      .in("claim_id", claimIds);
    if (citErr) throw new Error(citErr.message);

    const byClaim = new Map<string, ProductClaimRow["citations"]>();
    for (const cit of citations ?? []) {
      const docs = cit.source_documents as
        | { title: string }
        | { title: string }[]
        | null;
      const title = Array.isArray(docs) ? docs[0]?.title : docs?.title;
      const list = byClaim.get(cit.claim_id as string) ?? [];
      list.push({
        documentTitle: title ?? "Source document",
        page: (cit.page as number | null) ?? null,
        sectionHeading: (cit.section_heading as string | null) ?? null,
        excerpt: (cit.excerpt as string | null) ?? null,
      });
      byClaim.set(cit.claim_id as string, list);
    }

    return claims.map((c) => ({
      claimId: c.claim_id as string,
      claimType: c.claim_type as string,
      text: c.text as string,
      extractionConfidence: (c.extraction_confidence as string | null) ?? null,
      reviewStatus: (c.review_status as string | null) ?? "extracted",
      citations: byClaim.get(c.claim_id as string) ?? [],
    }));
  });
