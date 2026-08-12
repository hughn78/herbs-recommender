import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck, FileSearch, ArrowRight, BookOpen } from "lucide-react";
import { CounterPointMark } from "@/components/counterpoint-mark";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CounterPoint — Supplement guidance, considered at the counter" },
      {
        name: "description",
        content:
          "Safety-screened, source-backed supplement recommendations for Australian community pharmacists. The informed second opinion at the pharmacy counter.",
      },
      { property: "og:title", content: "CounterPoint" },
      {
        property: "og:description",
        content: "Supplement guidance, considered at the counter. Safety-screened recommendations for Australian pharmacists.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "CounterPoint" },
      {
        name: "twitter:description",
        content: "Supplement guidance, considered at the counter. Safety-screened recommendations for Australian pharmacists.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      {/* Header */}
      <header className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-5 md:px-8">
        <CounterPointMark size={28} />
        <div className="flex items-center gap-3">
          <Link
            to="/app/products"
            className="hidden sm:inline-flex items-center gap-1.5 text-sm text-muted-ink hover:text-foreground transition-colors"
          >
            <BookOpen className="h-4 w-4" />
            Catalogue
          </Link>
          <Link
            to="/app"
            className="inline-flex items-center rounded-lg bg-amber px-4 py-2 text-sm font-medium text-amber-foreground transition-colors hover:bg-amber/85"
            style={{ backgroundColor: "#ECBA82", color: "#2E2E2E" }}
          >
            Start a review
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-[1200px] px-6 md:px-8 pt-8 pb-16 md:pt-16 md:pb-24">
        <div className="max-w-3xl">
          <p className="text-sm font-medium text-muted-ink uppercase tracking-[0.12em]">
            Supplement guidance, considered at the counter
          </p>
          <h1 className="mt-6 font-display text-[clamp(32px,6vw,64px)] leading-[1.1] text-foreground">
            The informed second opinion
            <br />
            at the pharmacy counter.
          </h1>
          <p className="mt-6 text-lg text-muted-ink max-w-xl leading-relaxed">
            CounterPoint helps pharmacists safety-screen supplement recommendations
            against medications, conditions, pregnancy and allergies before
            counselling. Deterministic rules, governed product data, source citations.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link
              to="/app"
              className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-colors"
              style={{ backgroundColor: "#ECBA82", color: "#2E2E2E" }}
            >
              Start a review
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/app/products"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
            >
              <BookOpen className="h-4 w-4" />
              Explore the catalogue
            </Link>
          </div>
        </div>
      </section>

      {/* Workflow section */}
      <section className="mx-auto max-w-[1200px] px-6 md:px-8 py-16 border-t border-hairline">
        <h2 className="font-display text-2xl text-foreground">How it works</h2>
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <span className="font-mono text-xs text-amber-ink">01</span>
              Enter patient context
            </div>
            <p className="mt-2 text-sm text-muted-ink leading-relaxed">
              Current medications, age, pregnancy, breastfeeding, allergies, symptoms.
              Brand names are recognised automatically and mapped to generics.
            </p>
          </div>
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <span className="font-mono text-xs text-amber-ink">02</span>
              Safety screening
            </div>
            <p className="mt-2 text-sm text-muted-ink leading-relaxed">
              The deterministic engine checks against medications, conditions,
              supplement interactions and product warnings. Cautions are surfaced
              first, before any recommendation.
            </p>
          </div>
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <span className="font-mono text-xs text-amber-ink">03</span>
              Counselling-ready results
            </div>
            <p className="mt-2 text-sm text-muted-ink leading-relaxed">
              Suitable products with rationale, excluded products with reasons,
              dosage and directions, evidence sources. The pharmacist remains
              responsible for the final recommendation.
            </p>
          </div>
        </div>
      </section>

      {/* Safety and evidence */}
      <section className="mx-auto max-w-[1200px] px-6 md:px-8 py-16 border-t border-hairline">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          <div>
            <ShieldCheck className="h-6 w-6 text-teal" style={{ color: "#024F46" }} />
            <h3 className="mt-4 font-display text-xl text-foreground">Safety first</h3>
            <p className="mt-2 text-sm text-muted-ink leading-relaxed">
              Cautions and contraindications are visually dominant. Products excluded
              for safety reasons are shown with their reasons. The pharmacist always
              sees what was ruled out, not just what survived.
            </p>
          </div>
          <div>
            <FileSearch className="h-6 w-6 text-teal" style={{ color: "#024F46" }} />
            <h3 className="mt-4 font-display text-xl text-foreground">Source-backed</h3>
            <p className="mt-2 text-sm text-muted-ink leading-relaxed">
              Every recommendation carries its evidence: product data, safety rules,
              and ontology mappings. No generated claims without provenance. The
              pharmacist can trace each suggestion back to its source.
            </p>
          </div>
        </div>
      </section>

      {/* Governance */}
      <section className="mx-auto max-w-[1200px] px-6 md:px-8 py-16 border-t border-hairline">
        <div className="max-w-2xl">
          <h2 className="font-display text-2xl text-foreground">What CounterPoint is not</h2>
          <ul className="mt-4 space-y-2 text-sm text-muted-ink">
            <li className="flex gap-2">
              <span className="text-subtle-ink">—</span>
              A diagnostic tool. It does not diagnose, prescribe, or produce direct-to-patient medical advice.
            </li>
            <li className="flex gap-2">
              <span className="text-subtle-ink">—</span>
              A substitute for clinical judgement. All recommendations require pharmacist verification.
            </li>
            <li className="flex gap-2">
              <span className="text-subtle-ink">—</span>
              A product sales tool. Products are surfaced by clinical fit, not commercial priority.
            </li>
          </ul>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-[1200px] px-6 md:px-8 py-16 border-t border-hairline">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl text-foreground">Ready to begin?</h2>
            <p className="mt-1 text-sm text-muted-ink">
              Start a review without signing in. No patient identifiers are stored.
            </p>
          </div>
          <Link
            to="/app"
            className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-colors shrink-0"
            style={{ backgroundColor: "#ECBA82", color: "#2E2E2E" }}
          >
            Start a review
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-hairline px-6 md:px-8 py-6">
        <div className="mx-auto max-w-[1200px] flex flex-col sm:flex-row items-center justify-between gap-3">
          <CounterPointMark size={22} />
          <p className="text-[11px] text-muted-foreground">
            CounterPoint. Supplement guidance, considered at the counter.
          </p>
        </div>
      </footer>
    </div>
  );
}