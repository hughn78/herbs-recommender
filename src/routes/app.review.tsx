import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  createCaseFn,
  recogniseMedicationsFn,
  type ConfirmedMed,
  type RecogniseMedicationsResult,
} from "@/lib/cases.functions";
import type { GeneratedRec } from "@/lib/engine";
import { PackShot, hasPackShot } from "@/components/pack-shot";
import type { RecognitionResult } from "@/lib/medication-parser";
import {
  Check,
  AlertCircle,
  HelpCircle,
  X,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  Pill,
  Package,
  Layers,
} from "lucide-react";

export const Route = createFileRoute("/app/review")({
  component: ReviewWizard,
});

type Step = 1 | 2 | 3;

type TransientResult = {
  case_id: null;
  transient: true;
  recommendations: GeneratedRec[];
  sense_check: {
    status: string;
    model: string;
    overall_note: string | null;
  };
};

const SEVERITY_ORDER = ["contraindicated", "major", "moderate", "minor"] as const;
const TYPE_LABEL: Record<string, string> = {
  safety_caution: "Safety caution",
  red_flag: "Red flag",
  otc_interaction: "OTC interaction",
  administration: "Administration",
  review_required: "Review required",
  counselling_prompt: "Counselling prompt",
  product_discussion: "Product discussion",
  product_recommendation: "Product recommendation",
};

function ReviewWizard() {
  const navigate = useNavigate();
  const createCase = useServerFn(createCaseFn);
  const recogniseMeds = useServerFn(recogniseMedicationsFn);

  const [step, setStep] = useState<Step>(1);
  const [ageStr, setAgeStr] = useState("");
  const [sex, setSex] = useState("");
  const [pregnancy, setPregnancy] = useState("not_applicable");
  const [breastfeeding, setBreastfeeding] = useState("not_applicable");
  const [allergies, setAllergies] = useState("");
  const [history, setHistory] = useState("");
  const [medsText, setMedsText] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [goal, setGoal] = useState("");
  const [supplements, setSupplements] = useState("");
  const [pathology, setPathology] = useState("");
  const [notes, setNotes] = useState("");

  const [confirmed, setConfirmed] = useState<ConfirmedMed[]>([]);
  const [recognitionResults, setRecognitionResults] = useState<RecognitionResult[]>([]);
  const [recognitionSource, setRecognitionSource] = useState<string>("");
  const [recognitionError, setRecognitionError] = useState<string | null>(null);
  const [recognising, setRecognising] = useState(false);
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());

  async function goConfirm() {
    if (!medsText.trim()) {
      setConfirmed([]);
      setRecognitionResults([]);
      setStep(2);
      return;
    }
    setRecognising(true);
    setRecognitionError(null);
    try {
      const res: RecogniseMedicationsResult = await recogniseMeds({ data: { text: medsText } });
      setRecognitionResults(res.results);
      setRecognitionSource(res.source);
      if (res.error) setRecognitionError(res.error);

      // Auto-confirm recognised medications
      const auto: ConfirmedMed[] = [];
      for (const r of res.results) {
        if (r.status === "recognised" && r.generic_name) {
          auto.push({
            generic_name: r.generic_name,
            brand_name: r.brand_name,
            drug_class: r.drug_class ?? null,
          });
        }
      }
      setConfirmed(auto);
    } catch (e) {
      setRecognitionError(e instanceof Error ? e.message : "Recognition failed");
      setRecognitionResults([]);
    } finally {
      setRecognising(false);
      setStep(2);
    }
  }

  function acceptFuzzy(idx: number) {
    const r = recognitionResults[idx];
    if (!r || !r.suggestion) return;
    // Find the concept from the recognition results to get drug class
    const suggestion = r.suggestion;
    // Look through recognised results for a match to get drug class
    let drugClass: string | null = null;
    for (const other of recognitionResults) {
      if (other.status === "recognised" && other.generic_name === suggestion) {
        drugClass = other.drug_class ?? null;
        break;
      }
    }
    setConfirmed((c) => [
      ...c,
      { generic_name: suggestion, drug_class: drugClass },
    ]);
    setRecognitionResults((rs) =>
      rs.map((x, i) =>
        i === idx
          ? { ...x, status: "recognised" as const, generic_name: suggestion, drug_class: drugClass }
          : x,
      ),
    );
  }

  function rejectFuzzy(idx: number) {
    setRecognitionResults((rs) =>
      rs.map((x, i) =>
        i === idx ? { ...x, status: "unknown" as const, suggestion: undefined } : x,
      ),
    );
  }

  function removeConfirmed(idx: number) {
    setConfirmed((c) => c.filter((_, i) => i !== idx));
  }

  /** Manually add a medication for an unknown entry. */
  function addManualMedication(
    idx: number,
    genericName: string,
    drugClass: string,
  ) {
    if (!genericName.trim()) return;
    setConfirmed((c) => [
      ...c,
      { generic_name: genericName.trim(), drug_class: drugClass.trim() || null },
    ]);
    setRecognitionResults((rs) =>
      rs.map((x, i) =>
        i === idx
          ? {
              ...x,
              status: "recognised" as const,
              generic_name: genericName.trim(),
              drug_class: drugClass.trim() || null,
            }
          : x,
      ),
    );
  }

  function toggleCard(idx: number) {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  const [doNotSave, setDoNotSave] = useState(false);
  const [transientResult, setTransientResult] = useState<TransientResult | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const age = ageStr ? Number(ageStr) : null;
      const res = await createCase({
        data: {
          age,
          sex: sex || null,
          pregnancy_status: pregnancy,
          breastfeeding_status: breastfeeding,
          allergies,
          medical_history: history,
          medication_text: medsText,
          symptoms,
          counselling_goal: goal,
          existing_supplements: supplements,
          pathology_notes: pathology,
          pharmacist_notes: notes,
          confirmed_medications: confirmed,
          transient: doNotSave,
        },
      });
      return res;
    },
    onSuccess: (res) => {
      if ("transient" in res && res.transient) {
        setTransientResult(res as TransientResult);
        return;
      }
      navigate({ to: "/app/case/$caseId", params: { caseId: res.case_id } });
    },
  });

  function startAnotherTransientReview() {
    setTransientResult(null);
    mutation.reset();
    setStep(1);
  }

  return (
    <div className="px-8 py-10 max-w-4xl mx-auto">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Step n={1} label="Patient" active={step === 1} done={step > 1} />
        <Sep />
        <Step n={2} label="Confirm medications" active={step === 2} done={step > 2} />
        <Sep />
        <Step n={3} label="Review & run" active={step === 3} done={false} />
      </div>

      {step === 1 && (
        <div className="mt-8 pp-glass p-6 space-y-5">
          <h1 className="text-2xl font-display">Patient context</h1>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Age">
              <Input type="number" value={ageStr} onChange={(e) => setAgeStr(e.target.value)} />
            </Field>
            <Field label="Sex">
              <select
                value={sex}
                onChange={(e) => setSex(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm"
              >
                <option value="">—</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other / unspecified</option>
              </select>
            </Field>
            <Field label="Pregnancy">
              <select
                value={pregnancy}
                onChange={(e) => setPregnancy(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm"
              >
                <option value="not_applicable">Not applicable</option>
                <option value="no">No</option>
                <option value="yes">Yes</option>
                <option value="unsure">Unsure</option>
              </select>
            </Field>
            <Field label="Breastfeeding">
              <select
                value={breastfeeding}
                onChange={(e) => setBreastfeeding(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm"
              >
                <option value="not_applicable">Not applicable</option>
                <option value="no">No</option>
                <option value="yes">Yes</option>
                <option value="unsure">Unsure</option>
              </select>
            </Field>
          </div>
          <Field label="Allergies / adverse reactions (NKDA if none)">
            <Input value={allergies} onChange={(e) => setAllergies(e.target.value)} placeholder="NKDA" />
          </Field>
          <Field label="Medical history (free text)">
            <Textarea
              rows={3}
              value={history}
              onChange={(e) => setHistory(e.target.value)}
              placeholder="e.g. T2DM, hypertension, mild CKD"
            />
          </Field>
          <Field label="Current medications (one per line or comma-separated, brand or generic)">
            <Textarea
              rows={5}
              value={medsText}
              onChange={(e) => setMedsText(e.target.value)}
              placeholder={"Metformin 1g BD\nPantoprazole 40mg daily\nAtorvastatin 40mg\nAspirin 100mg\nCoversyl Plus 5/1.25"}
              className="font-mono text-sm"
            />
          </Field>
          <Field label="Existing supplements / OTC">
            <Input value={supplements} onChange={(e) => setSupplements(e.target.value)} />
          </Field>
          <Field label="Symptoms / today's presentation">
            <Textarea rows={2} value={symptoms} onChange={(e) => setSymptoms(e.target.value)} />
          </Field>
          <Field label="Counselling goal (optional)">
            <Input value={goal} onChange={(e) => setGoal(e.target.value)} />
          </Field>
          <Field label="Relevant pathology notes (optional)">
            <Textarea rows={2} value={pathology} onChange={(e) => setPathology(e.target.value)} />
          </Field>
          <div className="flex justify-end pt-2">
            <Button onClick={goConfirm} className="bg-amber text-amber-foreground hover:bg-amber/85">
              Continue
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="mt-8 pp-glass p-6 space-y-5">
          <h1 className="text-2xl font-display">Confirm what we recognised</h1>
          <p className="text-sm text-muted-foreground">
            Recognised medicines are below. Resolve unknowns or "did you mean" before running the engine.
          </p>

          {recognising && (
            <p className="text-sm text-muted-foreground animate-pulse">
              Recognising medications…
            </p>
          )}

          {recognitionError && (
            <p className="text-sm text-signal">
              Recognition error: {recognitionError}
            </p>
          )}

          {recognitionSource && recognitionSource !== "none" && (
            <p className="text-[11px] text-muted-foreground">
              Knowledge source: {recognitionSource === "medication_intelligence" ? "medication intelligence tables" : "legacy dictionary"}
            </p>
          )}

          {/* Confirmed medications chips */}
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Confirmed</p>
            <div className="flex flex-wrap gap-2">
              {confirmed.length === 0 && <span className="text-sm text-muted-foreground">None yet.</span>}
              {confirmed.map((m, i) => (
                <span key={i} className="pp-chip bg-accent/15 border-accent/30">
                  <Check className="h-3.5 w-3.5 text-accent" />
                  {m.generic_name}
                  {m.brand_name ? ` (${m.brand_name})` : ""}
                  <button onClick={() => removeConfirmed(i)} className="ml-1 text-muted-foreground hover:text-foreground">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Rich medication cards for recognised medications */}
          {recognitionResults.filter((r) => r.status === "recognised").length > 0 && (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Recognised medications</p>
              {recognitionResults.map((r, idx) => {
                if (r.status !== "recognised") return null;
                const isExpanded = expandedCards.has(idx);
                const isConfirmed = confirmed.some(
                  (c) => c.generic_name === r.generic_name,
                );
                return (
                  <MedicationCard
                    key={idx}
                    result={r}
                    expanded={isExpanded}
                    confirmed={isConfirmed}
                    onToggle={() => toggleCard(idx)}
                    onRemove={() => {
                      const cIdx = confirmed.findIndex(
                        (c) => c.generic_name === r.generic_name,
                      );
                      if (cIdx >= 0) removeConfirmed(cIdx);
                    }}
                  />
                );
              })}
            </div>
          )}

          {/* Fuzzy match suggestions */}
          {recognitionResults.some((r) => r.status === "fuzzy") && (
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Did you mean?</p>
              <div className="flex flex-wrap gap-2">
                {recognitionResults.map((r, i) => {
                  if (r.status !== "fuzzy") return null;
                  return (
                    <div key={i} className="flex items-center gap-1">
                      <button
                        onClick={() => acceptFuzzy(i)}
                        className="pp-chip hover:bg-accent/15"
                      >
                        <HelpCircle className="h-3.5 w-3.5 text-amber" />
                        "{r.raw}" → <strong className="font-medium">{r.suggestion}</strong>
                      </button>
                      <button
                        onClick={() => rejectFuzzy(i)}
                        className="pp-chip hover:bg-signal/10 text-muted-foreground"
                        title="Reject suggestion"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Unknown medications with manual entry option */}
          {recognitionResults.some((r) => r.status === "unknown") && (
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Not recognised</p>
              <div className="space-y-2">
                {recognitionResults.map((r, i) => {
                  if (r.status !== "unknown") return null;
                  return (
                    <UnknownMedicationRow
                      key={i}
                      raw={r.raw}
                      onAdd={(genericName, drugClass) =>
                        addManualMedication(i, genericName, drugClass)
                      }
                    />
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                These will be ignored by the rules engine unless you map them above. Edit them in step 1 or proceed if intentional.
              </p>
            </div>
          )}

          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button onClick={() => setStep(3)} className="bg-amber text-amber-foreground hover:bg-amber/85">
              Continue
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        transientResult ? (
          <TransientResults result={transientResult} onStartAnother={startAnotherTransientReview} />
        ) : (
          <div className="mt-8 pp-glass p-6 space-y-5">
            <h1 className="text-2xl font-display">Ready to run</h1>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Summary k="Patient" v={`${sex || "—"} · ${ageStr || "?"}y`} />
              <Summary k="Pregnancy/BF" v={`${pregnancy} / ${breastfeeding}`} />
              <Summary k="Allergies" v={allergies || "NKDA"} />
              <Summary k="History" v={history || "—"} />
              <Summary k="Symptoms" v={symptoms || "—"} />
              <Summary k="Confirmed meds" v={`${confirmed.length}`} />
            </div>

            <label className="flex items-start gap-3 rounded-md border border-accent/25 bg-accent/5 p-4 cursor-pointer">
              <input
                type="checkbox"
                checked={doNotSave}
                onChange={(e) => setDoNotSave(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-border accent-amber"
              />
              <span>
                <span className="flex items-center gap-2 text-sm font-medium">
                  <ShieldCheck className="h-4 w-4 text-accent" />
                  Do not save this review
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Runs the deterministic engine and shows results on this page only. Patient
                  context, recommendations, feedback and audit rows are not written to the
                  database, and the external AI sense-check is not called.
                </span>
              </span>
            </label>

            {!doNotSave && (
              <Field label="Pharmacist notes (saved with case, not shown to engine)">
                <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
            )}

            {mutation.isError && (
              <p className="text-sm text-signal">
                {mutation.error instanceof Error ? mutation.error.message : "Run failed"}
              </p>
            )}

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending}
                className="bg-amber text-amber-foreground hover:bg-amber/85"
              >
                {mutation.isPending
                  ? "Running engine…"
                  : doNotSave
                    ? "Run without saving"
                    : "Run review"}
              </Button>
            </div>
          </div>
        )
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function TransientResults({
  result,
  onStartAnother,
}: {
  result: TransientResult;
  onStartAnother: () => void;
}) {
  const groups = SEVERITY_ORDER.map((severity) => ({
    severity,
    items: result.recommendations.filter((r) => r.severity_tier === severity),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="mt-8 space-y-6">
      <div className="pp-glass border-accent/30 p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 mt-0.5 text-accent shrink-0" />
          <div className="flex-1">
            <h1 className="text-2xl font-display">Unsaved transient review</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {result.recommendations.length} recommendation
              {result.recommendations.length === 1 ? "" : "s"} generated. Patient context and
              results were not stored and will disappear when you leave or start another review.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              AI sense-check: {result.sense_check.status}
              {result.sense_check.overall_note ? ` · ${result.sense_check.overall_note}` : ""}
            </p>
          </div>
          <Button variant="outline" onClick={onStartAnother} className="shrink-0">
            Start another
          </Button>
        </div>
      </div>

      {result.recommendations.length === 0 && (
        <div className="pp-glass p-6 text-sm">
          No safety triggers fired for this combination. Apply your clinical judgement.
        </div>
      )}

      {groups.map((group) => (
        <section key={group.severity}>
          <h2 className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-3">
            {group.severity} · {group.items.length}
          </h2>
          <div className="space-y-3">
            {group.items.map((r, i) => {
              const packShot =
                r.recommendation_type === "product_recommendation" &&
                hasPackShot(r.image);
              return (
              <article key={`${r.rank}-${r.title}-${i}`} className="pp-glass p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    {packShot && (
                      <PackShot
                        image={r.image}
                        className="h-20 w-20 shrink-0 rounded-md border border-hairline object-contain bg-white"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                        {TYPE_LABEL[r.recommendation_type] ?? r.recommendation_type}
                      </p>
                      <h3 className="mt-1 font-display text-lg leading-snug">{r.title}</h3>
                      {(r.brand || r.product_id) && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {r.brand}
                          {r.brand && r.product_id ? " · " : ""}
                          {r.product_id ? <span className="font-mono">{r.product_id}</span> : null}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className="pp-chip text-[11px] shrink-0">
                    {r.confidence} confidence · {r.confidence_score}
                  </span>
                </div>

                {r.why_triggered && (
                  <p className="mt-2 text-sm text-muted-foreground">{r.why_triggered}</p>
                )}

                {r.rationale?.advice && (
                  <div className="mt-3 rounded-md border border-accent/20 bg-accent/5 p-3">
                    <p className="text-[11px] uppercase tracking-wider text-accent font-medium">Advice</p>
                    <p className="mt-1 text-sm">{r.rationale.advice}</p>
                  </div>
                )}

                {r.safety_cautions.length > 0 && (
                  <ul className="mt-3 list-disc list-inside space-y-1 text-sm text-signal">
                    {r.safety_cautions.map((c, idx) => (
                      <li key={idx}>{c}</li>
                    ))}
                  </ul>
                )}

                {r.talking_points.length > 0 && (
                  <div className="mt-3">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      Talking points
                    </p>
                    <ul className="mt-1.5 list-disc list-inside space-y-1 text-sm">
                      {r.talking_points.slice(0, 4).map((t, idx) => (
                        <li key={idx}>{t}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {r.source_references.length > 0 && (
                  <div className="mt-4 border-t border-hairline pt-3">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Sources</p>
                    <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
                      {r.source_references.slice(0, 3).map((s, idx) => (
                        <li key={idx}>
                          <span className="text-foreground">{s.source}</span>
                          {s.tier_label ? ` · ${s.tier_label}` : ""}
                          {s.note ? ` — ${s.note}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function Summary({ k, v }: { k: string; v: string }) {
  return (
    <div className="pp-flat px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</p>
      <p className="text-sm">{v}</p>
    </div>
  );
}

function Step({ n, label, active, done }: { n: number; label: string; active: boolean; done: boolean }) {
  return (
    <div className={`flex items-center gap-2 ${active ? "text-foreground" : done ? "text-accent" : "text-muted-foreground"}`}>
      <span
        className={`h-6 w-6 rounded-full flex items-center justify-center text-[11px] border ${
          active ? "bg-teal text-teal-foreground border-teal" : done ? "bg-accent/20 border-accent text-accent" : "border-border"
        }`}
      >
        {n}
      </span>
      <span className="text-xs uppercase tracking-wider">{label}</span>
    </div>
  );
}

function Sep() {
  return <span className="h-px w-8 bg-hairline" />;
}

/** Rich, expandable card for a recognised medication. Compact by default,
 *  expands to show match details, strength, form, and combination info. */
function MedicationCard({
  result,
  expanded,
  confirmed,
  onToggle,
  onRemove,
}: {
  result: RecognitionResult;
  expanded: boolean;
  confirmed: boolean;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const classes = result.drug_classes ?? (result.drug_class ? [result.drug_class] : []);

  return (
    <div className="rounded-lg border border-hairline bg-card/50 overflow-hidden">
      {/* Compact summary row — always visible */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent/5 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
        <Pill className="h-4 w-4 text-accent shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{result.generic_name}</span>
            {result.brand_name && (
              <span className="text-xs text-muted-foreground">
                ({result.brand_name})
              </span>
            )}
            {result.is_combination && (
              <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/10 text-purple-600 border border-purple-500/20">
                <Layers className="h-3 w-3" />
                combination
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {classes.map((cls, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-hairline"
              >
                {cls}
              </span>
            ))}
            {result.dosage_form && (
              <span className="text-[10px] text-muted-foreground">
                · {result.dosage_form}
              </span>
            )}
            {result.strength && (
              <span className="text-[10px] text-muted-foreground font-mono">
                · {result.strength}
              </span>
            )}
          </div>
        </div>
        {confirmed && (
          <span className="shrink-0 inline-flex items-center gap-1 text-[10px] text-accent">
            <Check className="h-3 w-3" />
            confirmed
          </span>
        )}
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-hairline px-4 py-3 space-y-2 bg-muted/20">
          {/* Raw input */}
          <div className="flex items-start gap-2 text-xs">
            <span className="text-muted-foreground uppercase tracking-wider shrink-0">Input</span>
            <span className="font-mono text-muted-foreground">{result.raw}</span>
          </div>

          {/* Match type */}
          {result.match_type && (
            <div className="flex items-start gap-2 text-xs">
              <span className="text-muted-foreground uppercase tracking-wider shrink-0">Match</span>
              <span className="capitalize">{result.match_type}</span>
              {result.confidence !== undefined && (
                <span className="text-muted-foreground">
                  · {result.confidence}% confidence
                </span>
              )}
            </div>
          )}

          {/* Combination components */}
          {result.is_combination && result.components && result.components.length > 0 && (
            <div className="flex items-start gap-2 text-xs">
              <span className="text-muted-foreground uppercase tracking-wider shrink-0">
                <Package className="h-3 w-3" />
              </span>
              <div className="flex flex-wrap gap-1">
                {result.components.map((comp, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-600 border border-purple-500/20"
                  >
                    {comp}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Concept ID */}
          {result.concept_id && (
            <div className="flex items-start gap-2 text-xs">
              <span className="text-muted-foreground uppercase tracking-wider shrink-0">Concept</span>
              <span className="font-mono text-muted-foreground">{result.concept_id}</span>
            </div>
          )}

          {/* Remove from confirmed */}
          {confirmed && (
            <button
              onClick={onRemove}
              className="text-xs text-signal hover:underline"
            >
              Remove from confirmed
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Row for an unknown medication with optional manual entry of generic name
 *  and drug class. */
function UnknownMedicationRow({
  raw,
  onAdd,
}: {
  raw: string;
  onAdd: (genericName: string, drugClass: string) => void;
}) {
  const [showManual, setShowManual] = useState(false);
  const [genericName, setGenericName] = useState("");
  const [drugClass, setDrugClass] = useState("");

  function handleAdd() {
    if (!genericName.trim()) return;
    onAdd(genericName, drugClass);
    setShowManual(false);
    setGenericName("");
    setDrugClass("");
  }

  return (
    <div className="rounded-lg border border-signal/30 bg-signal/5 px-4 py-3">
      <div className="flex items-center gap-2">
        <AlertCircle className="h-4 w-4 text-signal shrink-0" />
        <span className="font-mono text-sm flex-1">{raw}</span>
        {!showManual && (
          <button
            onClick={() => setShowManual(true)}
            className="text-xs text-accent hover:underline"
          >
            Map manually
          </button>
        )}
      </div>

      {showManual && (
        <div className="mt-3 space-y-2">
          <Input
            type="text"
            placeholder="Generic name (e.g. metformin)"
            value={genericName}
            onChange={(e) => setGenericName(e.target.value)}
            className="text-sm"
          />
          <Input
            type="text"
            placeholder="Drug class (optional, e.g. biguanide)"
            value={drugClass}
            onChange={(e) => setDrugClass(e.target.value)}
            className="text-sm"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleAdd}
              disabled={!genericName.trim()}
              className="bg-amber text-amber-foreground hover:bg-amber/85"
            >
              Add to confirmed
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setShowManual(false);
                setGenericName("");
                setDrugClass("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
