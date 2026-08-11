import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GitCompareArrows, Package, Search, X } from "lucide-react";
import {
  getCatalogueProductFn,
  listCatalogueProductsFn,
  type CatalogueProductDetail,
  type CatalogueProductSummary,
} from "@/lib/catalogue.functions";
import { listProductsFn } from "@/lib/cases.functions";
import { PackShot, hasPackShot } from "@/components/pack-shot";

export const Route = createFileRoute("/app/products")({
  component: ProductsPage,
  errorComponent: ({ error }) => (
    <div className="p-8 text-sm text-destructive">{error.message}</div>
  ),
});

const REVIEW_BADGE: Record<string, { label: string; classes: string }> = {
  approved: { label: "Approved", classes: "bg-accent/15 text-accent border-accent/30" },
  needs_review: {
    label: "Needs review",
    classes: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400",
  },
  rejected: { label: "Rejected", classes: "bg-signal/10 text-signal border-signal/30" },
};

function asArr<T>(v: T[] | null | undefined): T[] {
  return Array.isArray(v) ? v : [];
}

const MAX_COMPARE = 3;

function ProductsPage() {
  const listCatalogue = useServerFn(listCatalogueProductsFn);
  const catalogueQuery = useQuery({
    queryKey: ["catalogue-products"],
    queryFn: () => listCatalogue(),
  });

  return (
    <div className="mx-auto max-w-6xl p-6 md:p-10 space-y-6">
      <header>
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Products</p>
        <h1 className="font-display text-3xl mt-1">Herbs of Gold catalogue</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-prose">
          Governed product catalogue from the Herbs of Gold Technical Manual. Every product shows
          its clinical review status; only{" "}
          <span className="font-medium text-foreground">approved</span> products are surfaced in
          patient case reviews.
        </p>
      </header>

      {catalogueQuery.isLoading && (
        <div className="text-sm text-muted-foreground">Loading catalogue…</div>
      )}

      {catalogueQuery.data?.available === false && (
        <LegacyCatalogue reason={catalogueQuery.data.reason} />
      )}

      {catalogueQuery.data?.available === true && (
        <CatalogueBrowser products={catalogueQuery.data.products} />
      )}
    </div>
  );
}

function CatalogueBrowser({ products }: { products: CatalogueProductSummary[] }) {
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [compare, setCompare] = useState<string[]>([]);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    for (const p of products) for (const t of p.clinicalUseTags) s.add(t);
    return Array.from(s).sort();
  }, [products]);

  const statuses = useMemo(
    () => Array.from(new Set(products.map((p) => p.reviewStatus))).sort(),
    [products],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (tagFilter && !p.clinicalUseTags.includes(tagFilter)) return false;
      if (statusFilter && p.reviewStatus !== statusFilter) return false;
      if (!q) return true;
      const hay = [p.name, p.brand ?? "", p.category ?? "", p.dosageForm ?? "", p.hogCode,
        ...p.clinicalUseTags, ...p.packSizes]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [products, query, tagFilter, statusFilter]);

  function toggleCompare(hogCode: string) {
    setCompare((cur) =>
      cur.includes(hogCode)
        ? cur.filter((c) => c !== hogCode)
        : cur.length < MAX_COMPARE
          ? [...cur, hogCode]
          : cur,
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row gap-3 md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, HOG code, tag, or pack size…"
            className="pl-9"
          />
        </div>
        <div className="text-sm text-muted-foreground">
          {filtered.length} / {products.length} products
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">
          Review status
        </span>
        <button
          onClick={() => setStatusFilter(null)}
          className={`pp-chip text-[11px] ${statusFilter === null ? "bg-foreground text-background border-foreground" : ""}`}
        >
          All
        </button>
        {statuses.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s === statusFilter ? null : s)}
            className={`pp-chip text-[11px] ${statusFilter === s ? "bg-foreground text-background border-foreground" : ""}`}
          >
            {REVIEW_BADGE[s]?.label ?? s}
          </button>
        ))}
      </div>

      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setTagFilter(null)}
            className={`pp-chip text-[11px] ${tagFilter === null ? "bg-foreground text-background border-foreground" : ""}`}
          >
            All tags
          </button>
          {allTags.map((t) => (
            <button
              key={t}
              onClick={() => setTagFilter(t === tagFilter ? null : t)}
              className={`pp-chip text-[11px] ${tagFilter === t ? "bg-foreground text-background border-foreground" : ""}`}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {compare.length > 0 && (
        <CompareTray hogCodes={compare} products={products} onClear={() => setCompare([])} />
      )}

      {filtered.length === 0 && (
        <Card className="p-10 text-center bg-card/60 backdrop-blur-sm">
          <Package className="h-8 w-8 mx-auto text-muted-foreground" />
          <div className="font-display text-lg mt-3">No products match</div>
          <div className="text-sm text-muted-foreground mt-1">
            Adjust the search or clear the filters.
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {filtered.map((p) => {
          const badge = REVIEW_BADGE[p.reviewStatus] ?? REVIEW_BADGE.needs_review;
          const img = hasPackShot(p.image);
          const inCompare = compare.includes(p.hogCode);
          return (
            <Card key={p.hogCode} className="p-4 bg-card/60 backdrop-blur-sm space-y-2">
              <div className="flex items-start gap-3">
                {img ? (
                  <PackShot
                    image={p.image}
                    className="h-16 w-16 shrink-0 rounded-md border border-hairline object-contain bg-white"
                  />
                ) : (
                  <div className="h-16 w-16 shrink-0 rounded-md border border-hairline bg-foreground/[0.03] flex items-center justify-center">
                    <Package className="h-5 w-5 text-muted-foreground/50" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        to="/app/products/$hogCode"
                        params={{ hogCode: p.hogCode }}
                        className="font-display text-base leading-snug hover:underline underline-offset-2"
                      >
                        {p.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {p.brand} · <span className="font-mono">{p.hogCode}</span>
                      </p>
                    </div>
                    <Badge className={`text-[10px] shrink-0 ${badge.classes}`}>{badge.label}</Badge>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {[p.dosageForm, p.packSizes.join(" / ")].filter(Boolean).join(" · ") ||
                      "Form and pack sizes not recorded"}
                  </p>
                </div>
              </div>

              {p.clinicalUseTags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {p.clinicalUseTags.slice(0, 5).map((t) => (
                    <span key={t} className="pp-chip text-[10px]">
                      {t}
                    </span>
                  ))}
                  {p.clinicalUseTags.length > 5 && (
                    <span className="text-[10px] text-muted-foreground">
                      +{p.clinicalUseTags.length - 5} more
                    </span>
                  )}
                </div>
              )}

              {p.avoidIfTags.length > 0 && (
                <p className="text-[10px] text-signal/80 line-clamp-1">
                  <span className="uppercase tracking-wider mr-1">Avoid if:</span>
                  {p.avoidIfTags.slice(0, 3).join(" · ")}
                </p>
              )}

              <div className="flex items-center justify-between pt-1">
                <Link
                  to="/app/products/$hogCode"
                  params={{ hogCode: p.hogCode }}
                  className="text-xs text-accent hover:underline underline-offset-2"
                >
                  Full detail &amp; evidence
                </Link>
                <Button
                  variant={inCompare ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs"
                  disabled={!inCompare && compare.length >= MAX_COMPARE}
                  onClick={() => toggleCompare(p.hogCode)}
                >
                  <GitCompareArrows className="h-3 w-3 mr-1" />
                  {inCompare ? "Comparing" : "Compare"}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function CompareTray({
  hogCodes,
  products,
  onClear,
}: {
  hogCodes: string[];
  products: CatalogueProductSummary[];
  onClear: () => void;
}) {
  const getDetail = useServerFn(getCatalogueProductFn);
  const details = useQueries({
    queries: hogCodes.map((hogCode) => ({
      queryKey: ["catalogue-product", hogCode],
      queryFn: () => getDetail({ data: { hogCode } }),
    })),
  });
  const loaded = details
    .map((d) => d.data)
    .filter((d): d is CatalogueProductDetail => !!d);
  const nameOf = (hogCode: string) =>
    products.find((p) => p.hogCode === hogCode)?.name ?? hogCode;

  return (
    <Card className="p-4 bg-card/70 backdrop-blur-sm space-y-3 border-accent/30">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Comparing {hogCodes.length} product{hogCodes.length === 1 ? "" : "s"}
        </p>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onClear}>
          <X className="h-3 w-3 mr-1" /> Clear
        </Button>
      </div>
      {loaded.length < hogCodes.length ? (
        <p className="text-sm text-muted-foreground">Loading details…</p>
      ) : (
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(${loaded.length}, minmax(0, 1fr))` }}
        >
          {loaded.map((d) => (
            <div key={d.hogCode} className="rounded-md border border-hairline p-3 space-y-2">
              <div>
                <p className="font-display text-sm">{d.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {[d.dosageForm, d.packSizes.join(" / ")].filter(Boolean).join(" · ")}
                </p>
              </div>
              <CompareSection
                title="Ingredients"
                items={d.ingredients.map((i) =>
                  [i.name, [i.strength, i.strengthUnit].filter(Boolean).join(" ")]
                    .filter(Boolean)
                    .join(" "),
                )}
              />
              <CompareSection title="For" items={d.indications.map((i) => i.text).slice(0, 4)} />
              <CompareSection title="Warnings" items={d.warnings.map((w) => w.text).slice(0, 4)} />
              <CompareSection
                title="Interactions"
                items={d.interactions.map((x) => x.text).slice(0, 4)}
              />
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] text-muted-foreground">
        Comparing: {hogCodes.map(nameOf).join(" · ")}
      </p>
    </Card>
  );
}

function CompareSection({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0)
    return (
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{title}</p>
        <p className="text-[11px] text-muted-foreground/70 italic">None recorded</p>
      </div>
    );
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{title}</p>
      <ul className="text-[11px] space-y-0.5 list-disc list-inside">
        {items.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

/** Fallback while the governed catalogue migration has not been applied:
 *  the legacy flat products table, same as before Phase 11. */
function LegacyCatalogue({ reason }: { reason: string }) {
  const listLegacy = useServerFn(listProductsFn);
  const { data, isLoading } = useQuery({
    queryKey: ["products-legacy"],
    queryFn: () => listLegacy(),
  });
  const products = useMemo(() => asArr(data), [data]);

  return (
    <div className="space-y-4">
      <Card className="p-4 bg-amber-500/5 border-amber-500/20 text-sm">
        Governed catalogue not reachable yet ({reason}). Showing the legacy product list — apply
        the catalogue migrations and run the ingestion pipeline to unlock the full browser.
      </Card>
      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {products.map((p) => (
          <Card key={p.product_id} className="p-4 bg-card/60 backdrop-blur-sm space-y-2">
            <h3 className="font-display text-base leading-snug">{p.name}</h3>
            {p.brand && <p className="text-xs text-muted-foreground">{p.brand}</p>}
            {asArr(p.indications).length > 0 && (
              <p className="text-xs">{asArr(p.indications).slice(0, 3).join(" · ")}</p>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
