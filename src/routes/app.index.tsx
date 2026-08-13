// CounterPoint — application dashboard.
//
// Pharmacy-first entry point. Surfaces:
//   1. Start a new review (primary action).
//   2. Search (the global type-ahead).
//   3. Recent cases with quick resume links.
//   4. Catalogue coverage summary (gated by staff sign-in).
//   5. Quick links to medicines, references, products, governance.
//   6. Queue / needs-review (staff only).
//
// Public surface: anyone signed in (or signed out for non-staff sections)
// can start a review and see the recent-cases list. Staff-only modules
// (coverage, governance, queue) hide themselves when there's no session.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { listCasesFn } from "@/lib/cases.functions";
import { catalogueCoverageFn, type CoverageReport } from "@/lib/coverage.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  FilePlus2,
  Search,
  ListChecks,
  ShieldCheck,
  Pill,
  Package,
  BookOpen,
  ClipboardCheck,
  Inbox,
  Atom,
  ChevronRight,
  AlertTriangle,
  CircleAlert,
  CheckCircle2,
} from "lucide-react";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/app/")({
  component: HomePage,
});

function HomePage() {
  const fetchCases = useServerFn(listCasesFn);
  const fetchCoverage = useServerFn(catalogueCoverageFn);

  const casesQuery = useQuery({
    queryKey: ["cases", "recent"],
    queryFn: () => fetchCases(),
  });

  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (active) setSignedIn(!!data.user);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(!!session?.user);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Coverage query is only enabled for signed-in staff — the catalogue
  // tables are RLS-protected. Public reviews still see the dashboard
  // without this section.
  const coverageQuery = useQuery<CoverageReport>({
    queryKey: ["catalogue-coverage"],
    queryFn: () => fetchCoverage(),
    enabled: signedIn,
    staleTime: 60_000,
  });

  const recentCases = (casesQuery.data ?? []).slice(0, 6);
  const totalCases = casesQuery.data?.length ?? 0;

  return (
    <div className="px-6 md:px-10 py-10 max-w-6xl mx-auto">
      <header className="mb-8">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Counter</p>
        <h1 className="mt-1 font-display text-[clamp(28px,4vw,44px)] leading-tight">
          Good day. What's on the counter?
        </h1>
        <p className="mt-2 text-muted-foreground max-w-prose">
          Start a safety-screened supplement review, resume recent work, or look up a medicine,
          ingredient, or product. Deterministic rules, governed catalogue, source citations —
          pharmacist judgement is always required.
        </p>
      </header>

      {/* Primary action: start a review */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <Link
          to="/app/review"
          className="group flex items-start gap-4 rounded-lg border border-teal/30 bg-teal/[0.04] p-5 hover:bg-teal/[0.07] transition-colors"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-teal text-teal-foreground shrink-0">
            <FilePlus2 className="h-5 w-5" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-display text-xl">Start a review</p>
            <p className="text-sm text-muted-foreground mt-1">
              Patient context → confirm medications → safety-screened results. Three steps.
            </p>
            <p className="text-xs text-muted-foreground mt-3 inline-flex items-center gap-1 text-teal">
              Open review
              <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
            </p>
          </div>
        </Link>

        <Link
          to="/app/search"
          className="group flex items-start gap-4 rounded-lg border border-border bg-card p-5 hover:bg-secondary/40 transition-colors"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-amber/15 text-amber-ink shrink-0">
            <Search className="h-5 w-5" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-display text-xl">Search</p>
            <p className="text-sm text-muted-foreground mt-1">
              Medicines, ingredients, products, indications, warnings, references. Press
              <kbd className="font-mono text-[10px] px-1 py-0.5 rounded border border-hairline mx-1">/</kbd>
              anywhere to focus.
            </p>
            <p className="text-xs text-muted-foreground mt-3 inline-flex items-center gap-1">
              Open search
              <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
            </p>
          </div>
        </Link>
      </div>

      {/* Recent cases */}
      <section className="mb-10">
        <SectionHeader
          title="Recent reviews"
          subtitle={
            totalCases > 0
              ? `${totalCases} on record · last ${recentCases.length} below`
              : "No saved reviews yet — start with a new review."
          }
          action={
            totalCases > 0 ? (
              <Link
                to="/app/cases"
                className="text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                All reviews
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            ) : null
          }
        />
        {casesQuery.isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : recentCases.length === 0 ? (
          <Card className="p-6 text-sm text-muted-foreground">
            Start with the sample patient:{" "}
            <span className="font-mono text-foreground">
              68F · metformin, aspirin, Coversyl Plus · cramps
            </span>
            .
          </Card>
        ) : (
          <ul className="rounded-md border border-hairline bg-card divide-y divide-hairline">
            {recentCases.map((c) => (
              <li key={c.case_id}>
                <Link
                  to="/app/case/$caseId"
                  params={{ caseId: c.case_id }}
                  className="flex items-center gap-4 px-4 py-3 hover:bg-secondary/30"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {c.case_label || `${c.sex ?? "Patient"} · ${c.age ?? "?"}y`}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {c.symptoms || "No symptoms recorded"}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0 font-mono">
                    {new Date(c.created_at).toLocaleDateString("en-AU")}
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Quick links */}
      <section className="mb-10">
        <SectionHeader title="Quick links" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <QuickLink to="/app/medicines" icon={Pill} label="Medicines" />
          <QuickLink to="/app/products" icon={Package} label="Catalogue" />
          <QuickLink to="/app/references" icon={BookOpen} label="References" />
          <QuickLink to="/app/cases" icon={ListChecks} label="All reviews" />
        </div>
      </section>

      {/* Staff-only: coverage + queue + governance */}
      {signedIn && (
        <section className="space-y-8">
          <CoveragePanel query={coverageQuery} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <QuickLink to="/app/queue" icon={Inbox} label="Needs review" hint="Assertions &amp; products awaiting governance" />
            <QuickLink to="/app/governance" icon={ClipboardCheck} label="Catalogue governance" hint="Audit trail &amp; edit queue" />
            <QuickLink to="/app/rules" icon={ShieldCheck} label="Safety rules" hint="Deterministic guardrails" />
            <QuickLink to="/app/setup" icon={BookOpen} label="Set-up" hint="Configuration &amp; data sources" />
          </div>
        </section>
      )}

      {!signedIn && (
        <section className="mt-10 rounded-md border border-hairline bg-muted/30 p-5 text-sm">
          <p className="font-medium text-foreground">Staff-only modules hidden.</p>
          <p className="mt-1 text-muted-foreground">
            Catalogue coverage, governance queue, and rule editing are gated by sign-in. Sign in
            from the sidebar to manage the knowledge base. The review workflow itself is
            available without an account.
          </p>
          <Link
            to="/auth"
            className="mt-3 inline-flex items-center gap-1 text-xs uppercase tracking-wider text-accent hover:text-foreground"
          >
            Sign in
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </section>
      )}
    </div>
  );
}

function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4 mb-3">
      <div>
        <h2 className="font-display text-lg">{title}</h2>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        )}
      </div>
      {action}
    </div>
  );
}

function QuickLink({
  to,
  icon: Icon,
  label,
  hint,
}: {
  to: string;
  icon: typeof Pill;
  label: string;
  hint?: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-start gap-3 rounded-md border border-hairline bg-card p-4 hover:bg-secondary/30 transition-colors"
    >
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
      </div>
    </Link>
  );
}

function CoveragePanel({
  query,
}: {
  query: ReturnType<typeof useQuery<CoverageReport>>;
}) {
  if (query.isLoading) {
    return (
      <div>
        <SectionHeader title="Catalogue coverage" subtitle="Loading…" />
        <div className="text-sm text-muted-foreground">Reading governed catalogue…</div>
      </div>
    );
  }
  const rep = query.data;
  if (!rep || !rep.available) {
    return (
      <div>
        <SectionHeader
          title="Catalogue coverage"
          subtitle={rep?.reason ?? "Coverage report unavailable"}
        />
        <Card className="p-5 text-sm text-muted-foreground">
          <Atom className="h-5 w-5 text-muted-foreground inline-block mr-2" aria-hidden="true" />
          Catalogue tables are not yet migrated, so coverage cannot be reported. The engine
          will fall back to the legacy product table in the meantime.
        </Card>
      </div>
    );
  }

  const total = rep.totalProducts;
  const cards: Array<{
    label: string;
    value: string;
    sub: string;
    tone: "ok" | "warn" | "alert";
  }> = [
    {
      label: "Products",
      value: String(total),
      sub: `${rep.byReviewStatus.approved ?? 0} approved · ${rep.byReviewStatus.needs_review ?? 0} need review`,
      tone: rep.byReviewStatus.approved === total ? "ok" : "warn",
    },
    {
      label: "With ingredients",
      value: `${rep.fields.ingredients.populated}/${total}`,
      sub:
        rep.fields.ingredients.missing > 0
          ? `${rep.fields.ingredients.missing} missing — unconfirmed composition`
          : "All products have ingredients recorded",
      tone: rep.fields.ingredients.missing === 0 ? "ok" : "warn",
    },
    {
      label: "With warnings",
      value: `${rep.fields.warnings.populated}/${total}`,
      sub:
        rep.fields.warnings.missing > 0
          ? `${rep.fields.warnings.missing} missing — NOT the same as 'no warning'`
          : "All products have warnings recorded",
      tone: rep.fields.warnings.missing === 0 ? "ok" : "alert",
    },
    {
      label: "Pack shots",
      value: `${rep.fields.packShots.populated}/${total}`,
      sub:
        rep.fields.packShots.missing > 0
          ? `${rep.fields.packShots.missing} without approved image`
          : "Every product has an approved image",
      tone: rep.fields.packShots.missing === 0 ? "ok" : "warn",
    },
  ];

  return (
    <div>
      <SectionHeader
        title="Catalogue coverage"
        subtitle={`Source confidence: ${rep.byConfidence.high ?? 0} high · ${rep.byConfidence.medium ?? 0} medium · ${rep.byConfidence.low ?? 0} low`}
        action={
          <Link
            to="/app/governance"
            className="text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            Open governance
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        }
      />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((c) => (
          <Card key={c.label} className="p-4 space-y-1">
            <div className="flex items-center gap-2">
              {c.tone === "ok" ? (
                <CheckCircle2 className="h-4 w-4 text-accent" aria-hidden="true" />
              ) : c.tone === "alert" ? (
                <CircleAlert className="h-4 w-4 text-signal" aria-hidden="true" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-ink" aria-hidden="true" />
              )}
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {c.label}
              </p>
            </div>
            <p className="font-display text-2xl leading-tight">{c.value}</p>
            <p className="text-[11px] text-muted-foreground">{c.sub}</p>
          </Card>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Generated {new Date(rep.generatedAt).toLocaleString("en-AU")} · products with missing
        warning or ingredient data default to <em>pharmacist review required</em>; they are not
        treated as "safe to recommend".
      </p>
    </div>
  );
}
