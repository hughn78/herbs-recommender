// Phase 3 — retrieval helper. Pulls supporting passages from kb_chunks
// for each generated recommendation and returns them as source_references.
// Runs server-side inside createCaseFn (caller passes the authenticated supabase client).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { GeneratedRec } from "./engine";

const TIER_LABEL: Record<number, string> = {
  1: "Australian therapeutic guidelines",
  2: "Australian medicines reference",
  3: "Peer-reviewed reference",
  4: "Patient education",
  5: "Supplementary source",
};

type ChunkRow = {
  chunk_id: string;
  source: string;
  source_name: string | null;
  source_tier: number | null;
  title: string | null;
  section_heading: string | null;
  source_url: string | null;
  text: string;
};

type TgChunkRow = {
  chunk_id: string;
  title: string;
  section_heading: string | null;
  excerpt: string;
  source_url: string;
  topic_area: string;
  topic_area_label: string;
  edition: string;
};

// -----------------------------------------------------------------------
// Therapeutic Guidelines (TG) conservative retrieval.
//
// Gates TG context behind THREE conditions, all of which must hold:
//
//   1. The patient has a relevant clinical concept in symptoms or
//      counselling_goal (allow-list keywords; never free-form soup).
//   2. The tg_chunks table is reachable AND has at least one active
//      row that matches via the ilike paths.
//   3. The retrieved excerpt is from a TG URL (defence in depth —
//      schema-cache fallback could otherwise surface wrong content).
//
// If any condition fails we silently return nothing. TG context is
// additive — it never replaces a deterministic rec, never fires on
// its own without a patient-facing symptom/goal, and never claims
// endorsement of any supplement.
// -----------------------------------------------------------------------

// Curated allow-list of clinical concepts TG is plausibly relevant for.
// Adding to this list is a deliberate editorial decision, not a free
// search over the corpus. If a concept is missing here, no TG context
// will surface for it — by design.
const TG_CONCEPT_KEYWORDS: Array<{ keyword: string; topicArea: string | null }> = [
  { keyword: "antibiotic", topicArea: "antibiotic" },
  { keyword: "infection", topicArea: "antibiotic" },
  { keyword: "uti", topicArea: "antibiotic" },
  { keyword: "cellulitis", topicArea: "antibiotic" },
  { keyword: "pneumonia", topicArea: "antibiotic" },
  { keyword: "asthma", topicArea: "respiratory" },
  { keyword: "copd", topicArea: "respiratory" },
  { keyword: "reflux", topicArea: "gastrointestinal" },
  { keyword: "gerd", topicArea: "gastrointestinal" },
  { keyword: "ibs", topicArea: "gastrointestinal" },
  { keyword: "diarrhoea", topicArea: "gastrointestinal" },
  { keyword: "hypertension", topicArea: "cardiovascular" },
  { keyword: "atrial fibrillation", topicArea: "cardiovascular" },
  { keyword: "stroke", topicArea: "cardiovascular" },
  { keyword: "heart failure", topicArea: "cardiovascular" },
  { keyword: "depression", topicArea: "psychotropic" },
  { keyword: "anxiety", topicArea: "psychotropic" },
  { keyword: "insomnia", topicArea: "psychotropic" },
  { keyword: "epilepsy", topicArea: "neurology" },
  { keyword: "migraine", topicArea: "neurology" },
  { keyword: "diabetes", topicArea: "diabetes" },
  { keyword: "psoriasis", topicArea: "dermatology" },
  { keyword: "eczema", topicArea: "dermatology" },
  { keyword: "acne", topicArea: "dermatology" },
  { keyword: "rheumatoid", topicArea: "rheumatology" },
  { keyword: "gout", topicArea: "rheumatology" },
];

function pickRelevantConcept(symptomBlob: string): { keyword: string; topicArea: string | null } | null {
  for (const c of TG_CONCEPT_KEYWORDS) {
    if (symptomBlob.includes(c.keyword)) return c;
  }
  return null;
}

export async function attachTgContext(
  supabase: SupabaseClient,
  ctx: { symptoms: string; counselling_goal: string; medical_history: string },
  recs: GeneratedRec[],
): Promise<GeneratedRec[]> {
  const blob = `${ctx.symptoms} ${ctx.counselling_goal} ${ctx.medical_history}`.toLowerCase();
  const concept = pickRelevantConcept(blob);
  if (!concept) return recs; // No relevant clinical concept — no TG context.

  try {
    const { data, error } = await supabase
      .from("tg_chunks")
      .select("chunk_id, title, section_heading, excerpt, source_url, topic_area, topic_area_label, edition")
      .eq("active", true)
      .or(
        concept.topicArea
          ? `topic_area.eq.${concept.topicArea},excerpt.ilike.%${encodeURIComponent(concept.keyword)}%,title.ilike.%${encodeURIComponent(concept.keyword)}%`
          : `excerpt.ilike.%${encodeURIComponent(concept.keyword)}%,title.ilike.%${encodeURIComponent(concept.keyword)}%`,
      )
      .limit(2);
    if (error || !data) return recs;

    const rows = data as TgChunkRow[];
    if (rows.length === 0) return recs;

    // Defence in depth: every result must be a real TG URL.
    const valid = rows.filter((r) =>
      /^https:\/\/tgldcdp\.tg\.org\.au\//i.test(r.source_url ?? ""),
    );
    if (valid.length === 0) return recs;

    // Find an existing counselling_prompt to attach to (or create one).
    // Conservative: if no counselling_prompt exists, create a single
    // TG-context rec rather than one per chunk.
    const host =
      recs.find((r) => r.recommendation_type === "counselling_prompt") ??
      recs.find((r) => r.recommendation_type === "product_discussion");

    const refs = valid.map((r) => ({
      source: `Therapeutic Guidelines · ${r.topic_area_label || r.topic_area}`,
      tier_label: "Therapeutic Guidelines",
      note: `${r.title}${r.section_heading ? " · " + r.section_heading : ""}`,
      url: r.source_url,
    }));

    if (host) {
      // Attach provenance to the existing counselling rec — never duplicate.
      host.source_references = [...host.source_references, ...refs];
    } else {
      // Create a single TG-context counselling_prompt rec.
      const tgRec: GeneratedRec = {
        recommendation_type: "counselling_prompt",
        title: `Clinical context from Therapeutic Guidelines: ${concept.keyword}`,
        confidence: "Medium",
        confidence_score: 55,
        severity_tier: "minor",
        score: 400,
        rank: 0,
        why_triggered: `Matched TG concept "${concept.keyword}" in patient context.`,
        rationale: {
          confidence: 55,
          evidenceLevel: "high",
          severity: "minor",
          mechanism: "clinical",
          ruleFired: `tg:context:${concept.keyword}`,
          ruleSource: "eTG",
          matchedFactors: [{ factor: "indication", value: concept.keyword, matched: true }],
          alternatives: [],
          safetyNet: "Pharmacist review required. TG context is advisory; final clinical judgement rests with the pharmacist.",
          advice: valid
            .map((r) => `${r.title}${r.section_heading ? " (" + r.section_heading + ")" : ""}: ${r.excerpt}`)
            .join(" · "),
        },
        pharmacist_checks: [
          "Confirm the TG excerpt is relevant to this patient before relying on it.",
          "Open the source URL to read the full section when needed.",
        ],
        talking_points: valid.map((r) => r.excerpt),
        safety_cautions: [],
        interaction_notes: [],
        matched_medicines: [],
        matched_patient_factors: [],
        source_references: refs,
      };
      recs.push(tgRec);
    }
  } catch {
    // swallow — TG is best-effort, deterministic recs remain authoritative
  }
  return recs;
}

function buildQuery(rec: GeneratedRec): string {
  // Combine matched meds + the most informative words from the title and why_triggered.
  const parts: string[] = [];
  if (rec.matched_medicines.length) parts.push(rec.matched_medicines.slice(0, 3).join(" OR "));
  const title = rec.title.replace(/[^a-zA-Z0-9 ]/g, " ").trim();
  if (title) parts.push(title);
  if (rec.matched_patient_factors.length) {
    parts.push(rec.matched_patient_factors.slice(0, 3).map((f) => f.replace(/_/g, " ")).join(" "));
  }
  return parts.join(" ").slice(0, 240);
}

export async function attachEvidence(
  supabase: SupabaseClient,
  recs: GeneratedRec[],
): Promise<GeneratedRec[]> {
  await Promise.all(
    recs.map(async (rec) => {
      const q = buildQuery(rec);
      if (!q.trim()) return;
      try {
        const { data, error } = await supabase
          .from("kb_chunks")
          .select("chunk_id, source, source_name, source_tier, title, section_heading, source_url, text")
          .textSearch("tsv", q, { type: "websearch", config: "english" })
          .order("source_tier", { ascending: true, nullsFirst: false })
          .limit(3);
        if (error || !data) return;
        const refs = (data as ChunkRow[]).map((c) => ({
          source: c.source_name ?? c.source ?? "Knowledge base",
          tier_label: TIER_LABEL[c.source_tier ?? 3] ?? "Reference",
          note: [c.title, c.section_heading].filter(Boolean).join(" · ") || c.text.slice(0, 140),
          url: c.source_url ?? undefined,
          chunk_id: c.chunk_id,
        }));
        if (refs.length) {
          rec.source_references = [...rec.source_references, ...refs];
        }
      } catch {
        // swallow — evidence is best-effort, the built-in rule reference remains
      }
    }),
  );
  return recs;
}
