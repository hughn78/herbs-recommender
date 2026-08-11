import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, BookOpen, ChevronDown, Package } from "lucide-react";
import { getCatalogueProductFn } from "@/lib/catalogue.functions";
import { listProductClaimsFn, type ProductClaimRow } from "@/lib/references.functions";
import { PackShot, hasPackShot } from "@/components/pack-shot";

export const Route = createFileRoute("/app/products/$hogCode")({
  component: ProductDetailPage,
  errorComponent: ({ error }) => (
    <div className="p-8 text-sm text-destructive">{error.message}</div>
  ),
});

const CLAIM_TYPE_LABEL: Record<string, string> = {
  manufacturer_indication: "Manufacturer indications",
  ingredient_fact: "Ingredient facts",
  safety_warning: "Safety warnings",
  interaction: "Interactions",
  directions: "Directions",
};

function ProductDetailPage() {
  const { hogCode } = useParams({ from: "/app/products/$hogCode" });
  const getDetail = useServerFn(getCatalogueProductFn);
  const getClaims = useServerFn(listProductClaimsFn);

  const detailQuery = useQuery({
    queryKey: ["catalogue-product", hogCode],
    queryFn: () => getDetail({ data: { hogCode } }),
  });
  const claimsQuery = useQuery({
    queryKey: ["product-claims", hogCode],
    queryFn: () => getClaims({ data: { hogCode } }),
  });

  if (detailQuery.isLoading) {
    return <div className="mx-auto max-w-4xl p-6 md:p-10 text-sm text-muted-foreground">Loading product…</div>;
  }
  const p = detailQuery.data;
  if (!p) {
    return (
      <div className="mx-auto max-w-4xl p-6 md:p-10">
        <Card className="p-10 text-center">
          <Package className="h-8 w-8 mx-auto text-muted-foreground" />
          <div className="font-display text-lg mt-3">Product not found</div>
          <div className="text-sm text-muted-foreground mt-1">
            No catalogue product with code <span className="font-mono">{hogCode}</span>. The
            governed catalogue may not be migrated yet.
          </div>
        </Card>
      </div>
    );
  }

  const img = hasPackShot(p.image);

  return (
    <div className="mx-auto max-w-4xl p-6 md:p-10 space-y-6">
      <Link
        to="/app/products"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" /> Back to catalogue
      </Link>

      <Card className="p-6 bg-card/60 backdrop-blur-sm">
        <div className="flex items-start gap-5">
          {img ? (
            <PackShot
              image={p.image}
              className="h-32 w-32 shrink-0 rounded-md border border-hairline object-contain bg-white"
            />
          ) : (
            <div className="h-32 w-32 shrink-0 rounded-md border border-hairline bg-foreground/[0.03] flex items-center justify-center">
              <Package className="h-8 w-8 text-muted-foreground/50" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="font-display text-2xl leading-snug">{p.name}</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {p.brand} · <span className="font-mono">{p.hogCode}</span>
                  {p.austl ? ` · AUST L ${p.austl}` : ""}
                </p>
              </div>
              <Badge
                className={`text-[10px] shrink-0 ${
                  p.reviewStatus === "approved"
                    ? "bg-accent/15 text-accent border-accent/30"
                    : "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400"
                }`}
              >
                {p.reviewStatus === "approved" ? "Approved" : "Needs review"}
              </Badge>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
              {p.dosageForm && <Meta k="Dosage form" v={p.dosageForm} />}
              {p.packSizes.length > 0 && <Meta k="Pack sizes" v={p.packSizes.join(" / ")} />}
              {p.category && <Meta k="Category" v={p.category} />}
              {p.sourcePage && <Meta k="Source page" v={`PDF page ${p.sourcePage}`} />}
            </div>
            {p.clinicalUseTags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {p.clinicalUseTags.map((t) => (
                  <span key={t} className="pp-chip text-[10px]">{t}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>

      {p.directions && (p.directions.adultDose || p.directions.rawText) && (
        <Section title="Directions">
          {p.directions.adultDose && <p className="text-sm">Adults: {p.directions.adultDose}</p>}
          {p.directions.childDose && (
            <p className="text-sm mt-1">Children: {p.directions.childDose}</p>
          )}
          {!p.directions.adultDose && p.directions.rawText && (
            <p className="text-sm">{p.directions.rawText}</p>
          )}
        </Section>
      )}

      {p.ingredients.length > 0 && (
        <Section title={`Ingredients · ${p.ingredients.length}`}>
          <ul className="divide-y divide-border/40">
            {p.ingredients.map((i, idx) => (
              <li key={idx} className="py-2 text-sm flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{i.name}</span>
                {i.form && <span className="text-muted-foreground">({i.form})</span>}
                {(i.strength || i.strengthUnit) && (
                  <span className="text-muted-foreground">
                    {[i.strength, i.strengthUnit].filter(Boolean).join(" ")}
                  </span>
                )}
                {i.equivalentName && (
                  <span className="text-xs text-muted-foreground">
                    equiv. {i.equivalentName}{" "}
                    {[i.equivalentAmount, i.equivalentUnit].filter(Boolean).join(" ")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {p.indications.length > 0 && (
        <Section title={`Indications · ${p.indications.length}`}>
          <ul className="space-y-1.5 text-sm list-disc list-inside marker:text-accent">
            {p.indications.map((i, idx) => (
              <li key={idx}>
                {i.text}
                {i.sourcePage && (
                  <span className="ml-1 text-xs text-muted-foreground">(p. {i.sourcePage})</span>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {p.warnings.length > 0 && (
        <Section title={`Warnings · ${p.warnings.length}`} tone="signal">
          <ul className="space-y-1.5 text-sm">
            {p.warnings.map((w, idx) => (
              <li key={idx} className="rounded-md border border-signal/20 bg-signal/5 px-3 py-2">
                {w.text}
                {w.avoidIfTags.length > 0 && (
                  <span className="block mt-1 text-xs text-signal/80">
                    Avoid if: {w.avoidIfTags.join(" · ")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {p.interactions.length > 0 && (
        <Section title={`Medicine interactions · ${p.interactions.length}`}>
          <ul className="space-y-1.5 text-sm">
            {p.interactions.map((x, idx) => (
              <li key={idx} className="rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                {x.interactingMedicine && (
                  <span className="font-medium">{x.interactingMedicine}: </span>
                )}
                {x.text}
                {(x.severity || x.action) && (
                  <span className="block mt-0.5 text-xs text-muted-foreground">
                    {[x.severity, x.action].filter(Boolean).join(" · ")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {p.counsellingFlags.length > 0 && (
        <Section title="Counselling flags">
          <div className="flex flex-wrap gap-1.5">
            {p.counsellingFlags.map((t) => (
              <span key={t} className="pp-chip text-[10px]">{t}</span>
            ))}
          </div>
        </Section>
      )}

      <EvidenceSection hogCode={hogCode} claims={claimsQuery.data ?? []} loading={claimsQuery.isLoading} />
    </div>
  );
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <span>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1.5">{k}</span>
      {v}
    </span>
  );
}

function Section({
  title,
  tone,
  children,
}: {
  title: string;
  tone?: "signal";
  children: React.ReactNode;
}) {
  return (
    <Card className={`p-5 bg-card/60 backdrop-blur-sm ${tone === "signal" ? "border-signal/30" : ""}`}>
      <h2 className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-3">{title}</h2>
      {children}
    </Card>
  );
}

/** Phase 12: provenance — every extracted claim for this product with its
 *  page-level citation back to the source manual. Grouped by claim type,
 *  collapsed by default beyond the first group. */
function EvidenceSection({
  hogCode,
  claims,
  loading,
}: {
  hogCode: string;
  claims: ProductClaimRow[];
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const groups = new Map<string, ProductClaimRow[]>();
  for (const c of claims) {
    const list = groups.get(c.claimType) ?? [];
    list.push(c);
    groups.set(c.claimType, list);
  }

  return (
    <Card className="p-5 bg-card/60 backdrop-blur-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between"
        aria-expanded={open}
      >
        <h2 className="text-xs uppercase tracking-[0.18em] text-muted-foreground flex items-center gap-2">
          <BookOpen className="h-3.5 w-3.5" />
          Source evidence · {claims.length} claims
        </h2>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>
      {loading && <p className="mt-3 text-sm text-muted-foreground">Loading claims…</p>}
      {open && !loading && (
        <div className="mt-4 space-y-4">
          {claims.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No extracted claims for {hogCode} yet — run the ingestion pipeline.
            </p>
          )}
          {Array.from(groups.entries()).map(([type, items]) => (
            <div key={type}>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                {CLAIM_TYPE_LABEL[type] ?? type} · {items.length}
              </p>
              <ul className="space-y-2">
                {items.map((c) => (
                  <li key={c.claimId} className="text-sm rounded-md border border-hairline px-3 py-2">
                    <p className="line-clamp-3">{c.text}</p>
                    {c.citations.map((cit, i) => (
                      <p key={i} className="mt-1 text-xs text-muted-foreground">
                        {cit.documentTitle}
                        {cit.page ? ` · page ${cit.page}` : ""}
                        {cit.sectionHeading ? ` · ${cit.sectionHeading}` : ""}
                      </p>
                    ))}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
