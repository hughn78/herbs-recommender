import { createFileRoute, Link } from "@tanstack/react-router";
import { motion, type Variants } from "framer-motion";
import { ShieldCheck, ListChecks, FileSearch, ArrowRight, Sparkles } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PharmaPrompt OS — Pharmacy Recommendation Engine" },
      {
        name: "description",
        content:
          "Australian community-pharmacy decision support. Deterministic, source-aware recommendations that keep the pharmacist in control.",
      },
      { property: "og:title", content: "PharmaPrompt OS" },
      {
        property: "og:description",
        content: "Decision support for community pharmacists. Calm, conservative, auditable.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "PharmaPrompt OS" },
      {
        name: "twitter:description",
        content: "Decision support for community pharmacists. Calm, conservative, auditable.",
      },
    ],
  }),
  component: Landing,
});

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] as const, delay: i * 0.08 },
  }),
};

function Landing() {
  return (
    <div className="min-h-dvh bg-background text-muted-foreground">
      {/* Signature hero: solid deep-teal band, square top, 80px rounded bottom */}
      <div className="pp-band">
        <header className="mx-auto flex max-w-[1280px] items-center justify-between px-8 py-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-amber">
              <span className="font-display text-sm text-amber-foreground">P</span>
            </div>
            <span className="font-display text-base text-teal-foreground">PharmaPrompt OS</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/auth"
              className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-teal-foreground transition-colors hover:bg-white/20"
            >
              Sign in
            </Link>
            <Link
              to="/app"
              className="rounded-lg bg-amber px-4 py-2 text-sm font-medium text-amber-foreground transition-colors hover:bg-amber/85"
            >
              Open the app
            </Link>
          </div>
        </header>

        <section className="mx-auto max-w-[1280px] px-8 pt-16 pb-28 md:pt-24 md:pb-32">
          <motion.div
            initial="hidden"
            animate="show"
            variants={fadeUp}
            custom={0}
            className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs text-teal-foreground"
          >
            <Sparkles className="h-3.5 w-3.5 text-amber" />
            Built for Australian community pharmacy
          </motion.div>

          <motion.h1
            initial="hidden"
            animate="show"
            variants={fadeUp}
            custom={1}
            className="mt-6 max-w-3xl font-display text-[40px] leading-[1.08] text-teal-foreground md:text-[64px]"
          >
            Decision support that
            <span className="block italic text-amber">respects the pharmacist.</span>
          </motion.h1>

          <motion.p
            initial="hidden"
            animate="show"
            variants={fadeUp}
            custom={2}
            className="mt-6 max-w-2xl text-lg leading-relaxed text-teal-foreground/80"
          >
            PharmaPrompt OS reads a patient's medication list, history and presentation, and surfaces the
            guardrails and counselling prompts that matter — deterministically, with sources, without the
            chatbot theatre.
          </motion.p>

          <motion.div
            initial="hidden"
            animate="show"
            variants={fadeUp}
            custom={3}
            className="mt-8 flex flex-wrap gap-3"
          >
            <Link
              to="/app/review"
              className="group inline-flex items-center gap-2 rounded-lg bg-amber px-5 py-3 text-sm font-medium text-amber-foreground transition-colors hover:bg-amber/85"
            >
              Start a review
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href="#how"
              className="inline-flex items-center rounded-lg bg-white/10 px-5 py-3 text-sm font-medium text-teal-foreground transition-colors hover:bg-white/20"
            >
              How it works
            </a>
          </motion.div>

          <motion.p
            initial="hidden"
            animate="show"
            variants={fadeUp}
            custom={4}
            className="mt-4 text-xs text-teal-foreground/60"
          >
            Staff tool — you’ll be asked to sign in or create an account first.
          </motion.p>
        </section>
      </div>

      {/* Paper section with borderless white panels */}
      <section id="how" className="mx-auto max-w-[1280px] px-8 py-16 md:py-28">
        <h2 className="font-display text-3xl md:text-4xl">How it works</h2>
        <p className="mt-6 max-w-2xl text-base leading-relaxed">
          Three commitments hold every recommendation together.
        </p>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {[
            { icon: ShieldCheck, title: "Safety-first", body: "Bleeding risk, mineral timing, renal cautions, pregnancy and breastfeeding suppression — fire before any product is suggested." },
            { icon: ListChecks, title: "Deterministic", body: "A curated ruleset and Australian medication dictionary. Same input, same output. Auditable. No hallucinations." },
            { icon: FileSearch, title: "Transparent", body: "Every card shows why it fired, what was matched, and the source. Pharmacist confirms before anything reaches the patient." },
          ].map((p, i) => (
            <motion.div
              key={p.title}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-60px" }}
              variants={fadeUp}
              custom={i}
              className="pp-glass p-7"
            >
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-amber-soft">
                <p.icon className="h-5 w-5 text-teal" />
              </span>
              <h3 className="mt-5 font-display text-xl">{p.title}</h3>
              <p className="mt-3 text-[15px] leading-relaxed">{p.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Occasional near-black feature island resets the rhythm */}
      <section className="mx-auto max-w-[1280px] px-8 pb-16 md:pb-28">
        <div className="pp-island px-8 py-14 md:px-14 md:py-20">
          <h2 className="max-w-2xl font-display text-3xl leading-tight text-[#F3F1EC] md:text-[40px]">
            One staff sign-in. Everything inside stays open.
          </h2>
          <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-[#F3F1EC]/70">
            Sign-in protects patient context in saved reviews. Prefer not to keep anything? Tick
            “Do not save this review” for a transient run — nothing is persisted. The governed
            catalogue and reference library sit behind the same sign-in, with per-product sources
            on every card.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              to="/app/review"
              className="inline-flex items-center gap-2 rounded-lg bg-amber px-5 py-3 text-sm font-medium text-amber-foreground transition-colors hover:bg-amber/85"
            >
              Start a review
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/app/products"
              className="inline-flex items-center rounded-lg bg-white/10 px-5 py-3 text-sm font-medium text-[#F3F1EC] transition-colors hover:bg-white/20"
            >
              Browse the catalogue
            </Link>
            <Link
              to="/app/references"
              className="inline-flex items-center rounded-lg bg-white/10 px-5 py-3 text-sm font-medium text-[#F3F1EC] transition-colors hover:bg-white/20"
            >
              Search references
            </Link>
          </div>
        </div>
      </section>

      <footer className="bg-background px-8 py-8">
        <p className="mx-auto max-w-[1280px] text-xs text-subtle">
          PharmaPrompt OS supports — it does not replace — pharmacist clinical judgement.
        </p>
      </footer>
    </div>
  );
}
