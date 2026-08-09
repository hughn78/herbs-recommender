// Phase 14 — clinical content governance server functions.
//
// Reviewers (any authenticated staff member) transition review_status on
// governed entities. Every transition is audited in
// catalogue_review_actions with reviewer, previous → new value, reason and
// timestamp. Write capability is limited by the Phase 14 migration to
// review-status columns only.

import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { publicSupabase } from "./public-supabase-middleware";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ReviewQueueSummary = {
  productsNeedingReview: number;
  claimsNeedingReview: number;
  warningsNeedingReview: number;
  imagesNeedingReview: number;
  unapprovedSynonyms: number;
  openDataQualityIssues: number;
  openExtractionConflicts: number;
};

export type ReviewQueueProduct = {
  productId: string;
  hogCode: string;
  name: string;
  brand: string | null;
  reviewStatus: string;
  extractionConfidence: string | null;
  sourcePage: number | null;
};

export type DataQualityIssueRow = {
  issueId: string;
  hogCode: string | null;
  issueType: string;
  description: string | null;
  severity: string | null;
  status: string;
};

export type ReviewQueue = {
  summary: ReviewQueueSummary;
  products: ReviewQueueProduct[];
  issues: DataQualityIssueRow[];
};

type ReviewableEntity = "product" | "claim" | "warning" | "image" | "synonym" | "issue";

const ENTITY_TABLE: Record<
  ReviewableEntity,
  { table: string; idColumn: string; statusColumn: string; approvedValue: string; rejectedValue: string }
> = {
  product: {
    table: "catalogue_products",
    idColumn: "product_id",
    statusColumn: "review_status",
    approvedValue: "approved",
    rejectedValue: "rejected",
  },
  claim: {
    table: "source_claims",
    idColumn: "claim_id",
    statusColumn: "review_status",
    approvedValue: "approved",
    rejectedValue: "rejected",
  },
  warning: {
    table: "product_warnings",
    idColumn: "warning_id",
    statusColumn: "review_status",
    approvedValue: "approved",
    rejectedValue: "rejected",
  },
  image: {
    table: "product_images",
    idColumn: "image_id",
    statusColumn: "review_status",
    approvedValue: "approved",
    rejectedValue: "rejected",
  },
  synonym: {
    table: "ontology_synonyms",
    idColumn: "synonym_id",
    statusColumn: "approved",
    approvedValue: "true",
    rejectedValue: "false",
  },
  issue: {
    table: "data_quality_issues",
    idColumn: "issue_id",
    statusColumn: "status",
    approvedValue: "resolved",
    rejectedValue: "wontfix",
  },
};

// Governance tables ship with the Phase 14 catalogue migration. Until it is
// applied, missing tables/columns must degrade to an empty queue rather than
// crashing the page.
function isMissingSchema(message: string): boolean {
  return (
    /schema cache/i.test(message) ||
    /does not exist/i.test(message) ||
    /relation .* does not exist/i.test(message)
  );
}

async function countWhere(
  db: SupabaseClient,
  table: string,
  column: string,
  value: string,
): Promise<number> {
  const { count, error } = await db
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq(column, value);
  if (error) {
    if (isMissingSchema(error.message)) return 0;
    throw new Error(error.message);
  }
  return count ?? 0;
}

async function selectRows<T>(
  run: () => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<T[]> {
  const { data, error } = await run();
  if (error) {
    if (isMissingSchema(error.message)) return [];
    throw new Error(error.message);
  }
  return (data ?? []) as T[];
}

export const getReviewQueueFn = createServerFn({ method: "GET" })
  .middleware([publicSupabase])
  .handler(async ({ context }): Promise<ReviewQueue> => {
    const db = context.supabase as unknown as SupabaseClient;

    const [
      productsNeedingReview,
      claimsNeedingReview,
      warningsNeedingReview,
      imagesNeedingReview,
      unapprovedSynonyms,
      openDataQualityIssues,
      openExtractionConflicts,
      productRows,
      issueRows,
    ] = await Promise.all([
      countWhere(db, "catalogue_products", "review_status", "needs_review"),
      countWhere(db, "source_claims", "review_status", "needs_review"),
      countWhere(db, "product_warnings", "review_status", "needs_review"),
      countWhere(db, "product_images", "review_status", "needs_review"),
      countWhere(db, "ontology_synonyms", "approved", "false"),
      countWhere(db, "data_quality_issues", "status", "open"),
      countWhere(db, "extraction_conflicts", "status", "open"),
      selectRows<Record<string, unknown>>(() =>
        db
          .from("catalogue_products")
          .select("product_id, hog_code, name, brand, review_status, extraction_confidence, source_page")
          .eq("review_status", "needs_review")
          .order("hog_code", { ascending: true }),
      ),
      selectRows<Record<string, unknown>>(() =>
        db
          .from("data_quality_issues")
          .select("issue_id, hog_code, issue_type, description, severity, status")
          .eq("status", "open")
          .order("severity", { ascending: true })
          .limit(100),
      ),
    ]);

    return {
      summary: {
        productsNeedingReview,
        claimsNeedingReview,
        warningsNeedingReview,
        imagesNeedingReview,
        unapprovedSynonyms,
        openDataQualityIssues,
        openExtractionConflicts,
      },
      products: productRows.map((p) => ({
        productId: p.product_id as string,
        hogCode: p.hog_code as string,
        name: p.name as string,
        brand: (p.brand as string | null) ?? null,
        reviewStatus: p.review_status as string,
        extractionConfidence: (p.extraction_confidence as string | null) ?? null,
        sourcePage: (p.source_page as number | null) ?? null,
      })),
      issues: issueRows.map((i) => ({
        issueId: i.issue_id as string,
        hogCode: (i.hog_code as string | null) ?? null,
        issueType: i.issue_type as string,
        description: (i.description as string | null) ?? null,
        severity: (i.severity as string | null) ?? null,
        status: i.status as string,
      })),
    };
  });

async function recordAction(
  db: SupabaseClient,
  reviewer: string,
  entityType: string,
  entityId: string,
  action: "approve" | "reject" | "flag",
  previousValue: unknown,
  newValue: unknown,
  reason: string,
) {
  const { error } = await db.from("catalogue_review_actions").insert({
    entity_type: entityType,
    entity_id: entityId,
    action,
    previous_value: previousValue as never,
    new_value: newValue as never,
    reviewer,
    reason,
  });
  if (error) throw new Error(error.message);
}

/** Transition one governed entity. The audited previous value is read
 *  immediately before the update so the trail reflects reality. */
export const reviewEntityFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { entityType: ReviewableEntity; entityId: string; action: "approve" | "reject" | "flag"; reason: string }) => d,
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as SupabaseClient;
    const reviewer: string = context.userId;
    const spec = ENTITY_TABLE[data.entityType];
    if (!spec) throw new Error(`Unknown entity type: ${data.entityType}`);
    const reason = (data.reason ?? "").trim();
    if (!reason) throw new Error("A review reason is required for the audit trail.");

    const { data: current, error: readErr } = await db
      .from(spec.table)
      .select(`${spec.idColumn}, ${spec.statusColumn}`)
      .eq(spec.idColumn, data.entityId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!current) throw new Error(`${data.entityType} not found: ${data.entityId}`);
    const previousRow = current as unknown as Record<string, unknown>;
    const previous = previousRow[spec.statusColumn];
    const previousStr = previous == null ? null : String(previous);

    const next =
      data.action === "approve"
        ? spec.approvedValue
        : data.action === "reject"
          ? spec.rejectedValue
          : "needs_review";
    const patch: Record<string, unknown> = { [spec.statusColumn]: next };
    if (spec.table === "catalogue_products" || spec.table === "source_claims") {
      patch.reviewer_notes = reason;
    }
    const { error: updateErr } = await db
      .from(spec.table)
      .update(patch)
      .eq(spec.idColumn, data.entityId);
    if (updateErr) throw new Error(updateErr.message);

    await recordAction(
      db,
      reviewer,
      data.entityType,
      data.entityId,
      data.action,
      { [spec.statusColumn]: previousStr },
      { [spec.statusColumn]: next },
      reason,
    );
    return { ok: true, previous: previousStr, next };
  });

/**
 * Safe bulk-approve for the initial ingestion: transitions every
 * needs_review catalogue product to approved in one statement and writes an
 * audit action per product. Claim/warning/image approval remains per-entity
 * so genuinely uncertain content is still eyeballed.
 */
export const bulkApproveProductsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { reason: string }) => d)
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as SupabaseClient;
    const reviewer: string = context.userId;
    const reason = (data.reason ?? "").trim();
    if (!reason) throw new Error("A review reason is required for the audit trail.");

    const { data: pending, error: readErr } = await db
      .from("catalogue_products")
      .select("product_id, hog_code")
      .eq("review_status", "needs_review");
    if (readErr) throw new Error(readErr.message);
    if (!pending?.length) return { approved: 0 };

    const { error: updateErr } = await db
      .from("catalogue_products")
      .update({ review_status: "approved", reviewer_notes: reason })
      .eq("review_status", "needs_review");
    if (updateErr) throw new Error(updateErr.message);

    const actions = pending.map((p) => ({
      entity_type: "product",
      entity_id: p.product_id as string,
      action: "approve",
      previous_value: { review_status: "needs_review" } as never,
      new_value: { review_status: "approved" } as never,
      reviewer,
      reason: `Bulk initial-ingestion approval (${p.hog_code}): ${reason}`,
    }));
    const { error: actionErr } = await db.from("catalogue_review_actions").insert(actions);
    if (actionErr) throw new Error(actionErr.message);

    return { approved: pending.length };
  });
