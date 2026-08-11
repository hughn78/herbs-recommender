// Medication Intelligence — search & list page.
//
// Searches medication_names (brands, generics, aliases) and returns
// concept summaries with canonical name, brands, and drug classes.
// Gracefully degrades when the medication_intelligence migration has
// not been applied yet.

import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn, useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Search, Pill, Loader2, Info, ArrowRight } from "lucide-react";
import { publicSupabase } from "@/lib/public-supabase-middleware";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MedicationSearchResult = {
  conceptId: string;
  canonicalName: string;
  matchedName: string;
  matchType: string;
  brands: string[];
  drugClasses: string[];
  assertionCount: number;
};

// ---------------------------------------------------------------------------
// Server function
// ---------------------------------------------------------------------------

function isMissingSchema(message: string): boolean {
  return /schema cache/i.test(message) || /does not exist/i.test(message);
}

export const searchMedicationsFn = createServerFn({ method: "GET" })
  .middleware([publicSupabase])
  .inputValidator((d: { query: string; limit?: number }) => d)
  .handler(async ({ data, context }): Promise<MedicationSearchResult[]> => {
    const db = context.supabase as unknown as SupabaseClient;
    const q = data.query.trim().toLowerCase();
    const limit = Math.min(data.limit ?? 50, 100);
    if (!q) return [];

    // Search medication_names by text — ilike on the name column
    const { data: nameRows, error: nameErr } = await db
      .from("medication_names")
      .select("name_id, concept_id, name, name_type, is_primary")
      .ilike("name", `%${q}%`)
      .limit(limit * 3);

    if (nameErr) {
      if (isMissingSchema(nameErr.message)) return [];
      throw new Error(nameErr.message);
    }
    if (!nameRows?.length) return [];

    // Collect unique concept IDs
    const conceptIds = Array.from(new Set(nameRows.map((r) => r.concept_id as string)));
    if (conceptIds.length === 0) return [];

    // Fetch concepts
    const { data: concepts, error: conceptErr } = await db
      .from("medication_concepts")
      .select("concept_id, canonical_name, name_normalised, review_status")
      .in("concept_id", conceptIds);

    if (conceptErr) {
      if (isMissingSchema(conceptErr.message)) return [];
      throw new Error(conceptErr.message);
    }

    // Fetch all names for these concepts (to get full brand list)
    const { data: allNames, error: allNamesErr } = await db
      .from("medication_names")
      .select("concept_id, name, name_type")
      .in("concept_id", conceptIds);

    if (allNamesErr && !isMissingSchema(allNamesErr.message)) {
      throw new Error(allNamesErr.message);
    }

    // Fetch class memberships
    const { data: memberships, error: memErr } = await db
      .from("medication_class_memberships")
      .select("concept_id, class_id")
      .in("concept_id", conceptIds);

    if (memErr && !isMissingSchema(memErr.message)) {
      throw new Error(memErr.message);
    }

    const classIds = Array.from(new Set((memberships ?? []).map((m) => m.class_id as string)));
    let classMap = new Map<string, string>();
    if (classIds.length > 0) {
      const { data: classes, error: classErr } = await db
        .from("medication_classes")
        .select("class_id, class_code, class_label")
        .in("class_id", classIds);
      if (!classErr && classes) {
        classMap = new Map(classes.map((c) => [c.class_id as string, c.class_code as string]));
      }
    }

    // Fetch assertion counts per concept
    const { data: assertions, error: assertErr } = await db
      .from("medication_assertions")
      .select("concept_id, assertion_id")
      .in("concept_id", conceptIds);

    if (assertErr && !isMissingSchema(assertErr.message)) {
      // Non-fatal — just zero counts
    }

    // Build lookup maps
    const conceptMap = new Map((concepts ?? []).map((c) => [c.concept_id as string, c]));
    const namesByConcept = new Map<string, { brands: string[]; all: string[] }>();
    for (const n of allNames ?? []) {
      const cid = n.concept_id as string;
      if (!namesByConcept.has(cid)) namesByConcept.set(cid, { brands: [], all: [] });
      const entry = namesByConcept.get(cid)!;
      entry.all.push(n.name as string);
      if (n.name_type === "brand") entry.brands.push(n.name as string);
    }

    const classesByConcept = new Map<string, string[]>();
    for (const m of memberships ?? []) {
      const cid = m.concept_id as string;
      if (!classesByConcept.has(cid)) classesByConcept.set(cid, []);
      const code = classMap.get(m.class_id as string);
      if (code) classesByConcept.get(cid)!.push(code);
    }

    const assertionCountByConcept = new Map<string, number>();
    for (const a of assertions ?? []) {
      const cid = a.concept_id as string;
      assertionCountByConcept.set(cid, (assertionCountByConcept.get(cid) ?? 0) + 1);
    }

    // Deduplicate by concept_id, keeping the best match (primary name first)
    const seen = new Set<string>();
    const results: MedicationSearchResult[] = [];
    for (const nr of nameRows) {
      const cid = nr.concept_id as string;
      if (seen.has(cid)) continue;
      seen.add(cid);

      const concept = conceptMap.get(cid);
      if (!concept) continue;

      const nameInfo = namesByConcept.get(cid) ?? { brands: [], all: [] };

      results.push({
        conceptId: cid,
        canonicalName: concept.canonical_name as string,
        matchedName: nr.name as string,
        matchType: nr.name_type as string,
        brands: nameInfo.brands,
        drugClasses: classesByConcept.get(cid) ?? [],
        assertionCount: assertionCountByConcept.get(cid) ?? 0,
      });

      if (results.length >= limit) break;
    }

    return results;
  });

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute("/app/medicines/")({
  component: MedicinesSearchPage,
  errorComponent: ({ error }) => (
    <div className="p-8 text-sm text-destructive">{error.message}</div>
  ),
});

const MATCH_LABEL: Record<string, string> = {
  generic: "Generic",
  brand: "Brand",
  abbreviation: "Abbreviation",
  alias: "Alias",
  spelling_variant: "Spelling variant",
};

function MedicinesSearchPage() {
  const search = useServerFn(searchMedicationsFn);
  const [q, setQ] = useState("");

  const query = useQuery({
    queryKey: ["medication-search", q.trim()],
    queryFn: () => search({ data: { query: q.trim(), limit: 50 } }),
    enabled: q.trim().length >= 2,
    retry: false,
  });

  const results = useMemo(() => query.data ?? [], [query.data]);
  const hasSearched = q.trim().length >= 2;

  return (
    <div className="mx-auto max-w-5xl p-6 md:p-10 space-y-8">
      <header>
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Medicines</p>
        <h1 className="font-display text-3xl mt-1">Medication intelligence</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-prose">
          Search the canonical Australian medication knowledge base — generics, brands, and
          aliases backed by AMH and eMIMS structured assertions. Each concept links to a full
          clinical detail page with contraindications, precautions, interactions, and
          supplement safety rules.
        </p>
      </header>

      {/* Search bar */}
      <form
        onSubmit={(e) => e.preventDefault()}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by generic name, brand, or alias — e.g. metformin, Lipitor, Coversyl…"
            className="pl-9 h-11"
            autoFocus
          />
        </div>
        {query.isFetching && (
          <Button variant="outline" className="h-11 px-4" disabled>
            <Loader2 className="h-4 w-4 animate-spin" />
          </Button>
        )}
      </form>

      {/* Not enough characters */}
      {q.trim().length > 0 && q.trim().length < 2 && (
        <p className="text-sm text-muted-foreground">
          Type at least 2 characters to search.
        </p>
      )}

      {/* Loading */}
      {query.isLoading && hasSearched && (
        <p className="text-sm text-muted-foreground">Searching medications…</p>
      )}

      {/* Error — likely schema not migrated */}
      {query.isError && hasSearched && (
        <Alert className="border-amber-500/30 bg-amber-500/5">
          <Info className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-700 dark:text-amber-400">
            Medication tables not available
          </AlertTitle>
          <AlertDescription className="text-sm text-muted-foreground">
            The medication intelligence migration has not been applied yet
            ({(query.error as Error).message}). Run the migration{" "}
            <span className="font-mono text-xs">
              20260812150000_medication_intelligence.sql
            </span>{" "}
            and the ingestion pipeline to populate these tables.
          </AlertDescription>
        </Alert>
      )}

      {/* No results */}
      {hasSearched && !query.isLoading && !query.isError && results.length === 0 && (
        <Card className="p-10 text-center bg-card/60 backdrop-blur-sm">
          <Pill className="h-8 w-8 mx-auto text-muted-foreground" />
          <div className="font-display text-lg mt-3">No medications found</div>
          <div className="text-sm text-muted-foreground mt-1">
            No concepts match “{q.trim()}”. Try a different spelling or search by active
            ingredient.
          </div>
        </Card>
      )}

      {/* Results grid */}
      {results.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {results.length} medication{results.length === 1 ? "" : "s"} found
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {results.map((r) => (
              <Link
                key={r.conceptId}
                to="/app/medicines/$conceptId"
                params={{ conceptId: r.conceptId }}
                className="block"
              >
                <Card className="p-4 bg-card/60 backdrop-blur-sm hover:bg-card transition space-y-2 h-full">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-base leading-snug">{r.canonicalName}</p>
                      {r.matchedName.toLowerCase() !== r.canonicalName.toLowerCase() && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Matched: <span className="font-medium">{r.matchedName}</span>
                        </p>
                      )}
                    </div>
                    <Badge variant="secondary" className="text-[10px] uppercase tracking-wider shrink-0">
                      {MATCH_LABEL[r.matchType] ?? r.matchType}
                    </Badge>
                  </div>

                  {r.brands.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      <span className="text-[10px] uppercase tracking-wider mr-1">Brands</span>
                      {r.brands.slice(0, 5).join(", ")}
                      {r.brands.length > 5 && (
                        <span className="ml-1 text-muted-foreground/70">
                          +{r.brands.length - 5} more
                        </span>
                      )}
                    </p>
                  )}

                  {r.drugClasses.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {r.drugClasses.slice(0, 4).map((c) => (
                        <span key={c} className="pp-chip text-[10px]">{c}</span>
                      ))}
                      {r.drugClasses.length > 4 && (
                        <span className="text-[10px] text-muted-foreground">
                          +{r.drugClasses.length - 4}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-muted-foreground">
                      {r.assertionCount > 0
                        ? `${r.assertionCount} clinical assertions`
                        : "No assertions yet"}
                    </span>
                    <span className="text-xs text-accent inline-flex items-center gap-1">
                      View detail <ArrowRight className="h-3 w-3" />
                    </span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Initial state — no search yet */}
      {!hasSearched && !query.isLoading && (
        <Card className="p-8 bg-card/40 border-dashed">
          <div className="text-center space-y-2">
            <Search className="h-6 w-6 mx-auto text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              Start typing a medication name above to search the knowledge base.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}