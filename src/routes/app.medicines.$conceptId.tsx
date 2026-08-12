// Medication Intelligence — detail page.
//
// Loads a single medication concept with all related data:
//   medication_concepts + medication_names + medication_class_memberships +
//   medication_classes + medication_assertions + medication_supplement_safety
//
// Shows structured assertions grouped by clinical category with source
// attribution (AMH / eMIMS). Progressive disclosure: summary header first,
// expandable Accordion sections for each assertion group. Related supplement
// safety cautions are shown in a dedicated section.
//
// All Supabase queries gracefully degrade to empty results when the
// medication_intelligence migration has not been applied.

import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { createServerFn, useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  ArrowLeft,
  Pill,
  ShieldAlert,
  Info,
  BookOpen,
  Activity,
} from "lucide-react";
import { publicSupabase } from "@/lib/public-supabase-middleware";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type NameRow = {
  name_id: string;
  concept_id: string;
  name: string;
  name_type: string;
  is_primary: boolean;
  source_code: string | null;
};

type ClassRow = {
  class_id: string;
  class_code: string;
  class_label: string;
  class_category: string | null;
};

type MembershipRow = {
  membership_id: string;
  concept_id: string;
  class_id: string;
  source_code: string | null;
  confidence: string;
};

type AssertionRow = {
  assertion_id: string;
  concept_id: string;
  assertion_type: string;
  assertion_value: string | null;
  statement: string;
  source_code: string;
  source_section: string | null;
  source_document_id: string | null;
  confidence: string;
  review_status: string;
};

type SupplementSafetyRow = {
  rule_id: string;
  concept_id: string | null;
  class_id: string | null;
  supplement_ingredient: string | null;
  product_tags: string[];
  action: string;
  severity_tier: string;
  mechanism: string | null;
  advice: string;
  pharmacist_checks: string[];
  safety_net: string | null;
  source_code: string;
  review_status: string;
};

export type MedicationDetail = {
  conceptId: string;
  canonicalName: string;
  nameNormalised: string;
  atcCode: string | null;
  description: string | null;
  status: string;
  reviewStatus: string;
  brands: string[];
  generics: string[];
  aliases: string[];
  drugClasses: Array<{ code: string; label: string; category: string | null }>;
  assertions: AssertionRow[];
  supplementSafety: SupplementSafetyRow[];
  available: boolean;
};

// ---------------------------------------------------------------------------
// Server function
// ---------------------------------------------------------------------------

function isMissingSchema(message: string): boolean {
  return /schema cache/i.test(message) || /does not exist/i.test(message);
}

export const getMedicationDetailFn = createServerFn({ method: "GET" })
  .middleware([publicSupabase])
  .inputValidator((d: { conceptId: string }) => d)
  .handler(async ({ data, context }): Promise<MedicationDetail> => {
    const db = context.supabase as unknown as SupabaseClient;
    const conceptId = data.conceptId;

    // 1. Fetch concept
    const { data: concept, error: conceptErr } = await db
      .from("medication_concepts")
      .select("concept_id, canonical_name, name_normalised, atc_code, description, status, review_status")
      .eq("concept_id", conceptId)
      .maybeSingle();

    if (conceptErr) {
      if (isMissingSchema(conceptErr.message)) return emptyDetail(conceptId);
      throw new Error(conceptErr.message);
    }
    if (!concept) return emptyDetail(conceptId);

    // 2. Fetch names, memberships, assertions, supplement safety in parallel
    const [namesRes, membershipsRes, assertionsRes, suppSafetyRes] = await Promise.all([
      db.from("medication_names")
        .select("name_id, concept_id, name, name_type, is_primary, source_code")
        .eq("concept_id", conceptId),
      db.from("medication_class_memberships")
        .select("membership_id, concept_id, class_id, source_code, confidence")
        .eq("concept_id", conceptId),
      db.from("medication_assertions")
        .select("assertion_id, concept_id, assertion_type, assertion_value, statement, source_code, source_section, source_document_id, confidence, review_status")
        .eq("concept_id", conceptId)
        .order("assertion_type", { ascending: true }),
      db.from("medication_supplement_safety")
        .select("rule_id, concept_id, class_id, supplement_ingredient, product_tags, action, severity_tier, mechanism, advice, pharmacist_checks, safety_net, source_code, review_status")
        .or(`concept_id.eq.${conceptId}`),
    ]);

    // Tolerate missing-schema on secondary queries
    if (namesRes.error && !isMissingSchema(namesRes.error.message)) throw new Error(namesRes.error.message);
    if (membershipsRes.error && !isMissingSchema(membershipsRes.error.message)) throw new Error(membershipsRes.error.message);
    if (assertionsRes.error && !isMissingSchema(assertionsRes.error.message)) throw new Error(assertionsRes.error.message);
    if (suppSafetyRes.error && !isMissingSchema(suppSafetyRes.error.message)) throw new Error(suppSafetyRes.error.message);

    // 3. Fetch class details for memberships
    const classIds = Array.from(new Set((membershipsRes.data ?? []).map((m) => m.class_id as string)));
    let classMap = new Map<string, ClassRow>();
    if (classIds.length > 0) {
      const { data: classes, error: classErr } = await db
        .from("medication_classes")
        .select("class_id, class_code, class_label, class_category")
        .in("class_id", classIds);
      if (!classErr && classes) {
        classMap = new Map(classes.map((c) => [c.class_id as string, c as unknown as ClassRow]));
      }
    }

    // 4. Build structured result
    const names = (namesRes.data ?? []) as NameRow[];
    const brands: string[] = [];
    const generics: string[] = [];
    const aliases: string[] = [];
    for (const n of names) {
      switch (n.name_type) {
        case "brand": brands.push(n.name); break;
        case "generic": generics.push(n.name); break;
        case "alias":
        case "abbreviation":
        case "spelling_variant": aliases.push(n.name); break;
      }
    }

    const drugClasses: Array<{ code: string; label: string; category: string | null }> = [];
    for (const m of (membershipsRes.data ?? []) as MembershipRow[]) {
      const cls = classMap.get(m.class_id);
      if (cls) {
        drugClasses.push({
          code: cls.class_code,
          label: cls.class_label,
          category: cls.class_category,
        });
      }
    }

    return {
      conceptId: concept.concept_id as string,
      canonicalName: concept.canonical_name as string,
      nameNormalised: concept.name_normalised as string,
      atcCode: (concept.atc_code as string | null) ?? null,
      description: (concept.description as string | null) ?? null,
      status: concept.status as string,
      reviewStatus: concept.review_status as string,
      brands,
      generics,
      aliases,
      drugClasses,
      assertions: (assertionsRes.data ?? []) as AssertionRow[],
      supplementSafety: (suppSafetyRes.data ?? []) as SupplementSafetyRow[],
      available: true,
    };
  });

function emptyDetail(conceptId: string): MedicationDetail {
  return {
    conceptId,
    canonicalName: "Unknown",
    nameNormalised: "",
    atcCode: null,
    description: null,
    status: "unknown",
    reviewStatus: "extracted",
    brands: [],
    generics: [],
    aliases: [],
    drugClasses: [],
    assertions: [],
    supplementSafety: [],
    available: false,
  };
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute("/app/medicines/$conceptId")({
  component: MedicationDetailPage,
  errorComponent: ({ error }) => (
    <div className="p-8 text-sm text-destructive">{error.message}</div>
  ),
});

// ---------------------------------------------------------------------------
// Assertion grouping
// ---------------------------------------------------------------------------

type AssertionGroup = {
  key: string;
  label: string;
  tone: "default" | "signal" | "amber";
  assertions: AssertionRow[];
};

const GROUP_ORDER: Array<{ key: string; label: string; types: string[]; tone: "default" | "signal" | "amber" }> = [
  { key: "contraindications", label: "Contraindications", types: ["contraindication"], tone: "signal" },
  { key: "precautions", label: "Precautions", types: ["precaution", "warning", "monitoring"], tone: "amber" },
  { key: "adverse_effects", label: "Adverse Effects", types: ["adverse_effect_common", "adverse_effect_serious"], tone: "amber" },
  { key: "interactions", label: "Interactions", types: ["drug_interaction", "food_interaction", "supplement_interaction"], tone: "amber" },
  { key: "renal", label: "Renal", types: ["renal_consideration"], tone: "default" },
  { key: "hepatic", label: "Hepatic", types: ["hepatic_consideration"], tone: "default" },
  { key: "pregnancy", label: "Pregnancy", types: ["pregnancy"], tone: "default" },
  { key: "breastfeeding", label: "Breastfeeding", types: ["breastfeeding"], tone: "default" },
  { key: "elderly", label: "Elderly", types: ["elderly"], tone: "default" },
  { key: "paediatric", label: "Paediatric", types: ["paediatric"], tone: "default" },
  { key: "dosage", label: "Dosage", types: ["dosage", "duration"], tone: "default" },
  { key: "administration", label: "Administration", types: ["administration", "dose_form", "route_info", "crushing_splitting", "timing", "storage"], tone: "default" },
  { key: "counselling", label: "Counselling", types: ["counselling"], tone: "default" },
  { key: "mechanism", label: "Mechanism", types: ["mechanism"], tone: "default" },
  { key: "pregnancy_category", label: "Pregnancy Category", types: ["pregnancy_category"], tone: "default" },
  { key: "indications", label: "Indications", types: ["indication"], tone: "default" },
  { key: "other", label: "Other Notes", types: ["clinical_note", "mims_class", "amh_chapter"], tone: "default" },
];

function groupAssertions(assertions: AssertionRow[]): AssertionGroup[] {
  const groups: AssertionGroup[] = [];
  const used = new Set<string>();

  for (const def of GROUP_ORDER) {
    const matched = assertions.filter((a) => def.types.includes(a.assertion_type) && !used.has(a.assertion_id));
    if (matched.length > 0) {
      for (const m of matched) used.add(m.assertion_id);
      groups.push({ key: def.key, label: def.label, tone: def.tone, assertions: matched });
    }
  }

  // Catch any assertion types not mapped above
  const leftover = assertions.filter((a) => !used.has(a.assertion_id));
  if (leftover.length > 0) {
    groups.push({ key: "other", label: "Other", tone: "default", assertions: leftover });
  }

  return groups;
}

const SOURCE_LABEL: Record<string, string> = {
  AMH: "AMH",
  eMIMS: "eMIMS",
  curated: "Curated",
};

const REVIEW_BADGE: Record<string, { label: string; classes: string }> = {
  approved: { label: "Approved", classes: "bg-accent/15 text-accent border-accent/30" },
  needs_review: { label: "Needs review", classes: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400" },
  extracted: { label: "Extracted", classes: "bg-foreground/5 text-muted-foreground border-foreground/20" },
  rejected: { label: "Rejected", classes: "bg-signal/10 text-signal border-signal/30" },
  superseded: { label: "Superseded", classes: "bg-foreground/5 text-muted-foreground border-foreground/20" },
};

const SEVERITY_LABEL: Record<string, string> = {
  contraindicated: "Contraindicated",
  major: "Major",
  moderate: "Moderate",
  minor: "Minor",
};

const ACTION_LABEL: Record<string, string> = {
  suppress: "Suppress product",
  downgrade: "Downgrade recommendation",
  require_review: "Require pharmacist review",
  counsel: "Counsel patient",
  admin_timing: "Administration timing",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function MedicationDetailPage() {
  const { conceptId } = useParams({ from: "/app/medicines/$conceptId" });
  const getDetail = useServerFn(getMedicationDetailFn);

  const detailQuery = useQuery({
    queryKey: ["medication-detail", conceptId],
    queryFn: () => getDetail({ data: { conceptId } }),
    retry: false,
  });

  // Memoize assertion groups — must be called before any early returns
  // to respect the Rules of Hooks (no conditional hook calls).
  const m = detailQuery.data;
  const groups = useMemo(
    () => (m && m.available ? groupAssertions(m.assertions) : []),
    [m],
  );

  if (detailQuery.isLoading) {
    return (
      <div className="mx-auto max-w-4xl p-6 md:p-10 text-sm text-muted-foreground">
        Loading medication…
      </div>
    );
  }

  if (!m || !m.available) {
    return (
      <div className="mx-auto max-w-4xl p-6 md:p-10 space-y-4">
        <Link
          to="/app/medicines"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          aria-label="Back to medicines search"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden="true" /> Back to medicines
        </Link>
        <Card className="p-10 text-center">
          <Pill className="h-8 w-8 mx-auto text-muted-foreground" aria-hidden="true" />
          <div className="font-display text-lg mt-3">Medication not found</div>
          <div className="text-sm text-muted-foreground mt-1" role="alert">
            No medication concept with ID <span className="font-mono text-xs">{conceptId}</span>.
            The medication intelligence migration may not be applied yet.
          </div>
        </Card>
      </div>
    );
  }

  // Summary counts for header
  const contraindicationCount = m.assertions.filter((a) => a.assertion_type === "contraindication").length;
  const interactionCount = m.assertions.filter((a) =>
    ["drug_interaction", "food_interaction", "supplement_interaction"].includes(a.assertion_type),
  ).length;
  const pregnancyCat = m.assertions.find((a) => a.assertion_type === "pregnancy_category");
  const pregnancyCategoryValue = pregnancyCat?.assertion_value ?? null;

  return (
    <div className="mx-auto max-w-4xl p-6 md:p-10 space-y-6">
      <Link
        to="/app/medicines"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        aria-label="Back to medicines search"
      >
        <ArrowLeft className="h-3 w-3" aria-hidden="true" /> Back to medicines search
      </Link>

      {/* Summary header */}
      <Card className="p-6 bg-card/60 backdrop-blur-sm">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 shrink-0 rounded-lg border border-hairline bg-foreground/[0.03] flex items-center justify-center">
            <Pill className="h-6 w-6 text-muted-foreground/60" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="font-display text-2xl leading-snug">{m.canonicalName}</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {m.atcCode && <span className="font-mono">ATC {m.atcCode}</span>}
                  {m.atcCode && m.status !== "active" && " · "}
                  {m.status !== "active" && (
                    <span className="text-amber-600 dark:text-amber-400">{m.status}</span>
                  )}
                </p>
              </div>
              <Badge className={`text-[10px] shrink-0 ${REVIEW_BADGE[m.reviewStatus]?.classes ?? REVIEW_BADGE.extracted.classes}`}>
                {REVIEW_BADGE[m.reviewStatus]?.label ?? m.reviewStatus}
              </Badge>
            </div>

            {m.description && (
              <p className="mt-2 text-sm text-foreground/80 leading-relaxed">{m.description}</p>
            )}

            {/* Quick facts row */}
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
              {m.brands.length > 0 && <Meta k="Australian brands" v={m.brands.join(", ")} />}
              {m.generics.length > 0 && <Meta k="Generics" v={m.generics.join(", ")} />}
              {m.aliases.length > 0 && <Meta k="Aliases" v={m.aliases.join(", ")} />}
              {pregnancyCategoryValue && <Meta k="Pregnancy category" v={pregnancyCategoryValue} />}
            </div>

            {/* Drug class badges */}
            {m.drugClasses.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {m.drugClasses.map((c) => (
                  <Badge key={c.code} variant="secondary" className="text-[10px] uppercase tracking-wider">
                    {c.label}
                  </Badge>
                ))}
              </div>
            )}

            {/* Alert summary badges */}
            <div className="mt-3 flex flex-wrap gap-2">
              {contraindicationCount > 0 && (
                <Badge className="text-[10px] bg-signal/10 text-signal border-signal/30">
                  {contraindicationCount} contraindication{contraindicationCount === 1 ? "" : "s"}
                </Badge>
              )}
              {interactionCount > 0 && (
                <Badge className="text-[10px] bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400">
                  {interactionCount} interaction{interactionCount === 1 ? "" : "s"}
                </Badge>
              )}
              {m.supplementSafety.length > 0 && (
                <Badge className="text-[10px] bg-signal/10 text-signal border-signal/30">
                  {m.supplementSafety.length} supplement caution{m.supplementSafety.length === 1 ? "" : "s"}
                </Badge>
              )}
              <Badge variant="secondary" className="text-[10px]">
                {m.assertions.length} total assertions
              </Badge>
            </div>
          </div>
        </div>
      </Card>

      {/* No data fallback */}
      {m.assertions.length === 0 && m.supplementSafety.length === 0 && (
        <Alert className="border-amber-500/30 bg-amber-500/5" role="alert">
          <Info className="h-4 w-4 text-amber-600" aria-hidden="true" />
          <AlertTitle className="text-amber-700 dark:text-amber-400">No clinical data yet</AlertTitle>
          <AlertDescription className="text-sm text-muted-foreground">
            This medication concept exists but has no structured assertions. Run the AMH/eMIMS
            ingestion pipeline to populate clinical assertions.
          </AlertDescription>
        </Alert>
      )}

      {/* Supplement safety cautions */}
      {m.supplementSafety.length > 0 && (
        <Card className="p-5 bg-card/60 backdrop-blur-sm border-signal/20 space-y-3">
          <h2 className="text-xs uppercase tracking-[0.18em] text-muted-foreground flex items-center gap-2">
            <ShieldAlert className="h-3.5 w-3.5 text-signal" aria-hidden="true" />
            Supplement safety cautions · {m.supplementSafety.length}
          </h2>
          <div className="space-y-2">
            {m.supplementSafety.map((rule) => (
              <div
                key={rule.rule_id}
                className={`rounded-md border px-4 py-3 space-y-1.5 ${
                  rule.severity_tier === "contraindicated"
                    ? "border-signal/30 bg-signal/5"
                    : rule.severity_tier === "major"
                      ? "border-amber-500/20 bg-amber-500/5"
                      : "border-hairline bg-foreground/[0.02]"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge
                      className={`text-[10px] ${
                        rule.severity_tier === "contraindicated"
                          ? "bg-signal/15 text-signal border-signal/30"
                          : rule.severity_tier === "major"
                            ? "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-400"
                            : "bg-foreground/5 text-muted-foreground border-foreground/20"
                      }`}
                    >
                      {SEVERITY_LABEL[rule.severity_tier] ?? rule.severity_tier}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {ACTION_LABEL[rule.action] ?? rule.action}
                    </Badge>
                    {rule.supplement_ingredient && (
                      <span className="text-xs text-muted-foreground">
                        Ingredient: <span className="font-medium">{rule.supplement_ingredient}</span>
                      </span>
                    )}
                    {rule.product_tags.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        Tags: {rule.product_tags.join(", ")}
                      </span>
                    )}
                  </div>
                  <Badge variant="secondary" className="text-[9px] uppercase tracking-wider shrink-0">
                    {SOURCE_LABEL[rule.source_code] ?? rule.source_code}
                  </Badge>
                </div>
                <p className="text-sm leading-relaxed">{rule.advice}</p>
                {rule.mechanism && (
                  <p className="text-xs text-muted-foreground">
                    <span className="text-[10px] uppercase tracking-wider mr-1">Mechanism</span>
                    {rule.mechanism}
                  </p>
                )}
                {rule.pharmacist_checks.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {rule.pharmacist_checks.map((check, i) => (
                      <span key={i} className="pp-chip text-[10px]">{check}</span>
                    ))}
                  </div>
                )}
                {rule.safety_net && (
                  <p className="text-xs text-signal/80">
                    <span className="text-[10px] uppercase tracking-wider mr-1">Safety net</span>
                    {rule.safety_net}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Clinical assertions — progressive disclosure via Accordion */}
      {groups.length > 0 && (
        <Card className="p-5 bg-card/60 backdrop-blur-sm">
          <h2 className="text-xs uppercase tracking-[0.18em] text-muted-foreground flex items-center gap-2 mb-4">
            <Activity className="h-3.5 w-3.5" aria-hidden="true" />
            Clinical assertions · {m.assertions.length}
          </h2>
          <Accordion type="multiple" className="w-full">
            {groups.map((group, idx) => (
              <AccordionItem key={group.key} value={`group-${group.key}`} className={idx === 0 ? "" : "border-t"}>
                <AccordionTrigger className="hover:no-underline">
                  <span className="flex items-center gap-2">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${
                        group.tone === "signal"
                          ? "bg-signal"
                          : group.tone === "amber"
                            ? "bg-amber-500"
                            : "bg-foreground/30"
                      }`}
                    />
                    {group.label}
                    <Badge variant="secondary" className="text-[10px] ml-1">
                      {group.assertions.length}
                    </Badge>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2">
                    {group.assertions.map((a) => (
                      <div
                        key={a.assertion_id}
                        className={`rounded-md border px-3 py-2.5 ${
                          group.tone === "signal"
                            ? "border-signal/15 bg-signal/[0.03]"
                            : group.tone === "amber"
                              ? "border-amber-500/15 bg-amber-500/[0.03]"
                              : "border-hairline bg-foreground/[0.02]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="flex items-center gap-1.5">
                            <Badge variant="secondary" className="text-[9px] uppercase tracking-wider">
                              {SOURCE_LABEL[a.source_code] ?? a.source_code}
                            </Badge>
                            {a.source_section && (
                              <span className="text-[10px] text-muted-foreground">
                                {a.source_section}
                              </span>
                            )}
                            {a.confidence !== "high" && (
                              <Badge variant="secondary" className="text-[9px] uppercase tracking-wider">
                                {a.confidence} confidence
                              </Badge>
                            )}
                          </div>
                          {a.review_status !== "approved" && a.review_status !== "extracted" && (
                            <Badge className={`text-[9px] ${REVIEW_BADGE[a.review_status]?.classes ?? ""}`}>
                              {REVIEW_BADGE[a.review_status]?.label ?? a.review_status}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm leading-relaxed text-foreground/90">
                          {a.statement}
                        </p>
                        {a.assertion_value && a.assertion_type === "pregnancy_category" && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Category: <span className="font-mono font-medium">{a.assertion_value}</span>
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Card>
      )}

      {/* Source provenance footer */}
      {m.assertions.length > 0 && (
        <>
          <Separator />
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              Assertions sourced from{" "}
              {Array.from(new Set(m.assertions.map((a) => a.source_code)))
                .map((s) => SOURCE_LABEL[s] ?? s)
                .join(" + ")}
              . Structured extraction only — no raw monograph text displayed.
            </span>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <span>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1.5">{k}</span>
      {v}
    </span>
  );
}