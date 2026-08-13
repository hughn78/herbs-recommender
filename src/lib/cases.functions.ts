// Server functions for CounterPoint.
// Phase 1: deterministic rule engine. Phase 3: KB evidence attachment.
// Phase 5: product recommendations. Phase 13: authenticated clinical flow —
// patient reviews require a staff session; rows are owned by the reviewer
// (RLS owner policies), and a transient mode runs without persistence.
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { publicSupabase } from "./public-supabase-middleware";
import { runEngine, type PatientCtx, type SafetyRuleRow } from "./engine";
import { loadEngineProducts } from "./catalogue-products";
import { loadOntologyTagMaps } from "./ontology";
import type { ProductImageRef } from "./recommend-products";
import { attachEvidence, attachTgContext } from "./retrieval";
import { runAiSenseCheck } from "./ai-sense-check";
import { loadMedicationKnowledge } from "./medication-knowledge";
import { recogniseMedications, buildIndexFromConcepts, type RecognitionResult } from "./medication-parser";

export type ConfirmedMed = {
  generic_name: string;
  brand_name?: string;
  drug_class?: string | null;
};

export type CaseInput = {
  case_label?: string | null;
  age: number | null;
  sex: string | null;
  pregnancy_status: string | null;
  breastfeeding_status: string | null;
  allergies: string;
  medical_history: string;
  medication_text: string;
  symptoms: string;
  counselling_goal: string;
  existing_supplements: string;
  pathology_notes: string;
  pharmacist_notes: string;
  confirmed_medications: ConfirmedMed[];
  /** Phase 13: run the engine and return results WITHOUT persisting any
   *  patient context. Transient reviews never appear in past reviews and
   *  are excluded from analytics/audit tables. */
  transient?: boolean;
};

export const getDictionaryFn = createServerFn({ method: "GET" })
  .middleware([publicSupabase])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("medication_dictionary")
      .select("generic_name, brand_names, drug_class, aliases");
    if (error) throw new Error(error.message);
    return (data ?? []).map((d) => ({
      generic_name: d.generic_name,
      brand_names: d.brand_names ?? [],
      drug_class: d.drug_class ?? null,
      aliases: d.aliases ?? [],
    }));
  });

export type RecogniseMedicationsResult = {
  results: RecognitionResult[];
  source: "medication_intelligence" | "legacy_dictionary" | "none";
  error?: string;
};

/** Server function: recognises medications from free-text input using the
 *  new medication intelligence tables (with legacy dictionary fallback).
 *  The MedIndex uses Map objects that can't cross the server/client
 *  boundary, so recognition must happen server-side. */
export const recogniseMedicationsFn = createServerFn({ method: "POST" })
  .middleware([publicSupabase])
  .inputValidator((d: { text: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const load = await loadMedicationKnowledge(supabase);
    if (load.concepts.length === 0) {
      return {
        results: [],
        source: load.source,
        error: load.error,
      } satisfies RecogniseMedicationsResult;
    }
    const index = buildIndexFromConcepts(
      load.concepts.map((c) => ({
        concept_id: c.concept_id,
        canonical_name: c.canonical_name,
        name_normalised: c.name_normalised,
        drug_classes: c.drug_classes,
        brands: c.brands,
        aliases: c.aliases,
      })),
    );
    const results = recogniseMedications(data.text, index);
    return {
      results,
      source: load.source,
      error: load.error,
    } satisfies RecogniseMedicationsResult;
  });

export const listSafetyRulesFn = createServerFn({ method: "GET" })
  .middleware([publicSupabase])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("safety_rules").select("*");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listCasesFn = createServerFn({ method: "GET" })
  .middleware([publicSupabase])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("patient_cases")
      .select("case_id, case_label, age, sex, symptoms, created_at")
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listProductsFn = createServerFn({ method: "GET" })
  .middleware([publicSupabase])
  .handler(async ({ context }) => {
    // Same authoritative product source as the engine: approved governed
    // catalogue first, legacy flat table only as a migration fallback.
    const load = await loadEngineProducts(context.supabase);
    return load.products;
  });

export const getCaseFn = createServerFn({ method: "GET" })
  .middleware([publicSupabase])
  .inputValidator((d: { caseId: string }) => d)
  .handler(async ({ data, context }) => {
    const [caseRes, recsRes, auditRes] = await Promise.all([
      context.supabase.from("patient_cases").select("*").eq("case_id", data.caseId).maybeSingle(),
      context.supabase
        .from("recommendations")
        .select("*")
        .eq("case_id", data.caseId)
        .order("rank", { ascending: true }),
      context.supabase
        .from("sense_check_audits")
        .select(
          "status, model, applied_changes, rejected_changes, error_message, latency_ms, raw_response, created_at",
        )
        .eq("case_id", data.caseId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (caseRes.error) throw new Error(caseRes.error.message);
    if (recsRes.error) throw new Error(recsRes.error.message);
    if (!caseRes.data) throw new Error("Case not found");

    // Phase 8/9: attach primary pack shots to product recommendation rows.
    // Images stay in the governed catalogue (single source of truth) rather
    // than being denormalised into the recommendations table; any catalogue
    // read failure simply means no images on this render.
    const recs = recsRes.data ?? [];
    const hogCodes = Array.from(
      new Set(
        recs
          .filter((r) => r.recommendation_type === "product_recommendation")
          .map((r) => r.product_id)
          .filter((id): id is string => typeof id === "string" && id.startsWith("HOG-")),
      ),
    );
    let imageByHog = new Map<string, ProductImageRef>();
    if (hogCodes.length > 0) {
      try {
        // The generated Database types predate the governed catalogue;
        // query these tables through the untyped client like the catalogue
        // and ontology loaders do.
        const db = context.supabase as unknown as SupabaseClient;
        const { data: prods } = await db
          .from("catalogue_products")
          .select("product_id, hog_code")
          .in("hog_code", hogCodes);
        const uuidToHog = new Map(
          (prods ?? []).map((p) => [p.product_id as string, p.hog_code as string]),
        );
        if (uuidToHog.size > 0) {
          const { data: images } = await db
            .from("product_images")
            .select("product_id, storage_path, alt_text, width, height, is_primary")
            .in("product_id", Array.from(uuidToHog.keys()));
          const byProduct = new Map<string, NonNullable<typeof images>>();
          for (const img of images ?? []) {
            if (!img.storage_path) continue;
            const list = byProduct.get(img.product_id) ?? [];
            list.push(img);
            byProduct.set(img.product_id, list);
          }
          for (const [uuid, imgs] of byProduct) {
            const hog = uuidToHog.get(uuid);
            if (!hog) continue;
            const pick = imgs.find((i) => i.is_primary) ?? imgs[0];
            imageByHog.set(hog, {
              storage_path: pick.storage_path as string,
              alt_text: pick.alt_text,
              width: pick.width,
              height: pick.height,
            });
          }
        }
      } catch {
        imageByHog = new Map(); // catalogue not migrated yet — render without images
      }
    }

    return {
      patientCase: caseRes.data,
      recommendations: recs.map((r) => ({
        ...r,
        image: (r.product_id && imageByHog.get(r.product_id)) ?? null,
      })),
      senseCheck: auditRes.data ?? null,
    };
  });

export const createCaseFn = createServerFn({ method: "POST" })
  .middleware([publicSupabase])
  .inputValidator((d: CaseInput) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // Public access model: no sign-in, no patient identifiers, so cases are
    // stored ownerless and RLS allows anonymous management of null-owner rows.
    const userId: string | null = context.userId;

    // Phase 7: approved governed-catalogue products are authoritative. The
    // loader falls back to the legacy flat table while the new catalogue is
    // being migrated and clinically reviewed.
    const [rulesRes, productLoad, ontologyLoad] = await Promise.all([
      supabase.from("safety_rules").select("*"),
      loadEngineProducts(supabase),
      loadOntologyTagMaps(supabase),
    ]);
    if (rulesRes.error) throw new Error(rulesRes.error.message);
    if (productLoad.catalogueError) {
      console.warn(`[catalogue] falling back to legacy products: ${productLoad.catalogueError}`);
    }
    // Phase 6: ontology tag maps are an enhancement — on any failure the
    // engine falls back to its built-in default maps.
    if (ontologyLoad.error) {
      console.warn(`[ontology] falling back to built-in tag maps: ${ontologyLoad.error}`);
    }
    const rules: SafetyRuleRow[] = (rulesRes.data ?? []).map((r) => ({
      rule_id: r.rule_id,
      name: r.name,
      description: r.description ?? "",
      trigger_drug_classes: r.trigger_drug_classes ?? [],
      trigger_patient_factors: r.trigger_patient_factors ?? [],
      avoid_product_keywords: r.avoid_product_keywords ?? [],
      severity: r.severity ?? "Medium",
      recommendation_type: r.recommendation_type ?? "review_required",
      pharmacist_message: r.pharmacist_message ?? "",
      pharmacist_checks: Array.isArray(r.pharmacist_checks)
        ? (r.pharmacist_checks as string[])
        : [],
      review_required: !!r.review_required,
    }));

    const products = productLoad.products;

    const ctx: PatientCtx = {
      age: data.age,
      sex: data.sex,
      pregnancy_status: data.pregnancy_status,
      breastfeeding_status: data.breastfeeding_status,
      allergies: data.allergies ?? "",
      medical_history: data.medical_history ?? "",
      symptoms: data.symptoms ?? "",
      counselling_goal: data.counselling_goal ?? "",
      existing_supplements: data.existing_supplements ?? "",
      pathology_notes: data.pathology_notes ?? "",
      confirmed_medications: data.confirmed_medications,
    };

    const baseRecs = await attachEvidence(supabase, runEngine(ctx, rules, products, ontologyLoad.maps));
    // Conservative TG context retrieval: only fires when symptoms or
    // counselling_goal contains an allow-listed clinical concept AND the
    // tg_chunks table returns matching active rows. Silent no-op otherwise.
    const withTg = await attachTgContext(supabase, ctx, baseRecs);
    // Transient reviews must not send patient context to the external AI
    // gateway. They receive deterministic results only; no audit row is
    // persisted below either.
    const sense = data.transient
      ? {
          status: "skipped" as const,
          model: "transient-deterministic-only",
          latency_ms: 0,
          recs: withTg,
          applied: [],
          rejected: [],
          error: "AI sense-check disabled for unsaved transient review",
        }
      : await runAiSenseCheck(ctx, withTg);
    const recs = sense.recs;

    // ---- Transient mode: return results without persisting anything ----
    // The patient context never reaches the database and is excluded from
    // audit/analytics tables. The client keeps results in memory only and
    // clearly labels the review as unsaved.
    if (data.transient) {
      return {
        case_id: null,
        transient: true,
        recommendations: recs,
        sense_check: {
          status: sense.status,
          model: sense.model,
          overall_note: sense.overall_note ?? null,
        },
      };
    }

    const { data: caseRow, error: caseErr } = await supabase
      .from("patient_cases")
      .insert({
        user_id: userId,
        case_label: data.case_label ?? null,
        age: data.age,
        sex: data.sex,
        pregnancy_status: data.pregnancy_status,
        breastfeeding_status: data.breastfeeding_status,
        allergies: data.allergies,
        medical_history: data.medical_history,
        medication_text: data.medication_text,
        symptoms: data.symptoms,
        counselling_goal: data.counselling_goal,
        existing_supplements: data.existing_supplements,
        pathology_notes: data.pathology_notes,
        pharmacist_notes: data.pharmacist_notes,
        confirmed_medications: data.confirmed_medications as never,
        detected_drug_classes: Array.from(
          new Set(data.confirmed_medications.map((m) => m.drug_class).filter(Boolean)),
        ) as never,
        detected_patient_factors: Array.from(
          new Set(recs.flatMap((r) => r.matched_patient_factors)),
        ) as never,
      })
      .select("case_id")
      .single();
    if (caseErr) throw new Error(caseErr.message);

    if (recs.length) {
      const rows = recs.map((r) => ({
        case_id: caseRow.case_id,
        user_id: userId,
        recommendation_type: r.recommendation_type,
        title: r.title,
        product_id: r.product_id ?? null,
        product_name: r.product_name ?? null,
        brand: r.brand ?? null,
        confidence: r.confidence,
        score: r.score,
        rank: r.rank,
        why_triggered: r.why_triggered,
        pharmacist_checks: r.pharmacist_checks as never,
        talking_points: r.talking_points as never,
        safety_cautions: r.safety_cautions as never,
        interaction_notes: r.interaction_notes as never,
        matched_medicines: r.matched_medicines as never,
        matched_patient_factors: r.matched_patient_factors as never,
        matched_product_tags: r.matched_product_tags ?? ([] as string[] as never),
        source_references: r.source_references as never,
        // Phase 6 structured rationale
        severity_tier: r.severity_tier,
        confidence_score: r.confidence_score,
        matched_factors: (r.rationale?.matchedFactors ?? []) as never,
        mechanism: r.rationale?.mechanism ?? null,
        advice: r.rationale?.advice ?? null,
        safety_net: r.rationale?.safetyNet ?? null,
        alternatives: (r.rationale?.alternatives ?? []) as never,
        onset: r.rationale?.onset ?? null,
      }));
      const { error: recErr } = await supabase.from("recommendations").insert(rows);
      if (recErr) throw new Error(recErr.message);
    }

    await supabase.from("sense_check_audits").insert({
      case_id: caseRow.case_id,
      user_id: userId,
      model: sense.model,
      status: sense.status,
      input_summary: {
        age: ctx.age,
        sex: ctx.sex,
        medication_count: ctx.confirmed_medications.length,
        rec_count: withTg.length,
      } as never,
      raw_response: (sense.overall_note ? { overall_note: sense.overall_note } : null) as never,
      applied_changes: sense.applied as never,
      rejected_changes: sense.rejected as never,
      error_message: sense.error ?? null,
      latency_ms: sense.latency_ms,
    });

    return { case_id: caseRow.case_id };
  });
