// Global counterpoint search.
//
// A single text input drives categorised results across medicines,
// ingredients, products, indications, warnings, and clinical reference
// excerpts. Every result carries a provenance label and a deep link
// to the relevant detail page. The search honours the existing
// privacy model — no restricted admin tables are queried.
//
// Keyboard:
//   - '/' focuses the search input from anywhere in the app shell
//   - Up/Down navigates between results
//   - Enter opens the highlighted result
//
// Debouncing is implemented client-side; the server function is
// stateless and idempotent.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  globalSearchFn,
  type SearchCategory,
  type SearchHit,
  type SearchResponse,
} from "@/lib/search.functions";
import {
  Search,
  Pill,
  Atom,
  Package,
  Sparkles,
  AlertTriangle,
  BookOpen,
  ArrowRight,
  Loader2,
} from "lucide-react";

export const Route = createFileRoute("/app/search")({
  validateSearch: (raw: Record<string, unknown>) => ({
    q: typeof raw.q === "string" ? raw.q : "",
  }),
  component: SearchPage,
  errorComponent: ({ error }) => (
    <div className="p-8 text-sm text-signal" role="alert">
      Search error: {error.message}
    </div>
  ),
});

const CATEGORIES: Array<{
  key: SearchCategory;
  label: string;
  icon: typeof Pill;
}> = [
  { key: "medicines", label: "Medicines", icon: Pill },
  { key: "ingredients", label: "Ingredients", icon: Atom },
  { key: "products", label: "Products", icon: Package },
  { key: "indications", label: "Indications", icon: Sparkles },
  { key: "warnings", label: "Warnings", icon: AlertTriangle },
  { key: "references", label: "References", icon: BookOpen },
];

function highlight(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const lc = text.toLowerCase();
  const q = query.toLowerCase();
  const idx = lc.indexOf(q);
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-amber/30 text-foreground rounded px-0.5">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}

function SearchPage() {
  const initial = Route.useSearch();
  const navigate = Route.useNavigate();
  const [query, setQuery] = useState(initial.q);
  const [debounced, setDebounced] = useState(initial.q);
  const [focusIdx, setFocusIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Update debounced query after 220ms of idleness.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 220);
    return () => clearTimeout(t);
  }, [query]);

  // Reflect query in the URL so search is shareable and back/forward works.
  useEffect(() => {
    navigate({
      to: "/app/search",
      search: { q: query.trim() },
      replace: true,
    } as never);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const runSearch = useServerFn(globalSearchFn);
  const { data, isFetching, isError, error } = useQuery<SearchResponse>({
    queryKey: ["global-search", debounced],
    queryFn: () => runSearch({ data: { query: debounced, limit: 8 } }),
    enabled: debounced.length >= 2,
    staleTime: 30_000,
  });

  // Flatten with stable indices for keyboard navigation.
  const flatHits = useMemo(() => {
    if (!data) return [];
    const out: Array<{ category: SearchCategory; hit: SearchHit }> = [];
    for (const cat of CATEGORIES) {
      for (const h of data.byCategory[cat.key]) out.push({ category: cat.key, hit: h });
    }
    return out;
  }, [data]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // '/' focuses search input from elsewhere
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (e.key === "/" && tag !== "input" && tag !== "textarea") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (flatHits.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusIdx((i) => (i + 1) % flatHits.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusIdx((i) => (i - 1 + flatHits.length) % flatHits.length);
    } else if (e.key === "Enter" && focusIdx >= 0) {
      const target = flatHits[focusIdx];
      if (target?.hit.href) {
        window.location.href = target.hit.href;
      }
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 md:px-10 py-10 space-y-6">
      <header>
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Search</p>
        <h1 className="font-display text-3xl mt-1">Find anything in CounterPoint</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-prose">
          Medicines, ingredients, products, indications, warnings, and clinical references — one
          place. Press <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-hairline">/</kbd> anywhere to focus this search.
        </p>
      </header>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setFocusIdx(-1);
          }}
          onKeyDown={handleKeyDown}
          placeholder="e.g. warfarin, magnesium, sleep, reflux, folic acid"
          className="pl-9 h-11"
          aria-label="Global search"
        />
        {isFetching && debounced.length >= 2 && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
        )}
      </div>

      {debounced.length < 2 && (
        <EmptyHint query={debounced} />
      )}

      {isError && (
        <Card className="p-6 border-signal/30 bg-signal/5 text-sm">
          <p className="text-signal font-medium">Search failed.</p>
          <p className="mt-1 text-muted-foreground">
            {error instanceof Error ? error.message : "Unknown error."}
          </p>
        </Card>
      )}

      {debounced.length >= 2 && data && !data.hasResults && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          <Search className="h-6 w-6 mx-auto text-muted-foreground/50" />
          <p className="mt-2 font-medium text-foreground">No matches for "{debounced}"</p>
          <p className="mt-1">
            Try a generic name, brand name, ingredient, or condition. Search is restricted to
            approved catalogue and medication intelligence data.
          </p>
          {data.warning && (
            <p className="mt-3 text-xs text-muted-foreground/70">{data.warning}</p>
          )}
        </Card>
      )}

      {debounced.length >= 2 && data?.hasResults && (
        <div className="space-y-6">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <p>
              {data.total} result{data.total === 1 ? "" : "s"} for{" "}
              <span className="text-foreground font-medium">"{debounced}"</span>
            </p>
            {data.warning && (
              <p className="text-muted-foreground/70">{data.warning}</p>
            )}
          </div>
          {CATEGORIES.map((cat) => {
            const hits = data.byCategory[cat.key];
            if (hits.length === 0) return null;
            return (
              <section key={cat.key} aria-label={cat.label}>
                <div className="flex items-center gap-2 mb-2">
                  <cat.icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <h2 className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    {cat.label} · {hits.length}
                  </h2>
                </div>
                <ul className="rounded-md border border-hairline divide-y divide-hairline bg-card">
                  {hits.map((h) => {
                    const flatIdx = flatHits.findIndex(
                      (x) => x.hit.id === h.id && x.category === cat.key,
                    );
                    const isFocused = flatIdx === focusIdx;
                    const inner = (
                      <div className="flex items-start gap-3 px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium leading-snug">
                            {highlight(h.title, debounced)}
                          </p>
                          {h.subtitle && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {highlight(h.subtitle, debounced)}
                            </p>
                          )}
                          {h.detail && h.detail !== h.subtitle && (
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {h.detail}
                            </p>
                          )}
                          {h.source && (
                            <Badge variant="secondary" className="mt-1.5 text-[10px] font-normal">
                              {h.source}
                            </Badge>
                          )}
                        </div>
                        {h.href && (
                          <ArrowRight
                            className={`h-4 w-4 shrink-0 mt-1 ${isFocused ? "text-accent" : "text-muted-foreground"}`}
                            aria-hidden="true"
                          />
                        )}
                      </div>
                    );
                    return (
                      <li key={`${cat.key}-${h.id}`}>
                        {h.href ? (
                          <Link
                            to={h.href}
                            className={`block hover:bg-secondary/40 ${isFocused ? "bg-secondary/40" : ""}`}
                            onFocus={() => setFocusIdx(flatIdx)}
                          >
                            {inner}
                          </Link>
                        ) : (
                          <div className={isFocused ? "bg-secondary/40" : ""}>{inner}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EmptyHint({ query }: { query: string }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <Card className="p-5 space-y-2">
        <Pill className="h-5 w-5 text-accent" aria-hidden="true" />
        <p className="font-display text-base">Medicines</p>
        <p className="text-xs text-muted-foreground">
          Search by generic (e.g. <span className="font-mono">metformin</span>) or brand
          (e.g. <span className="font-mono">Glucophage</span>).
        </p>
      </Card>
      <Card className="p-5 space-y-2">
        <Atom className="h-5 w-5 text-accent" aria-hidden="true" />
        <p className="font-display text-base">Ingredients</p>
        <p className="text-xs text-muted-foreground">
          Search ingredients (e.g. <span className="font-mono">magnesium glycinate</span>)
          to see products that contain them.
        </p>
      </Card>
      <Card className="p-5 space-y-2">
        <Package className="h-5 w-5 text-accent" aria-hidden="true" />
        <p className="font-display text-base">Products</p>
        <p className="text-xs text-muted-foreground">
          Herbs of Gold catalogue by name, brand, or HOG code.
        </p>
      </Card>
      <Card className="p-5 space-y-2">
        <Sparkles className="h-5 w-5 text-accent" aria-hidden="true" />
        <p className="font-display text-base">Indications & warnings</p>
        <p className="text-xs text-muted-foreground">
          Search the free-text fields to find products indicated for, or warning
          about, a particular condition or symptom.
        </p>
      </Card>
    </div>
  );
}
