import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listSafetyRulesFn } from "@/lib/cases.functions";

export const Route = createFileRoute("/app/_admin/rules")({
  component: RulesPage,
});

function RulesPage() {
  const fn = useServerFn(listSafetyRulesFn);
  const { data } = useQuery({ queryKey: ["rules"], queryFn: () => fn() });
  const count = data?.length ?? 0;
  return (
    <div className="mx-auto max-w-4xl p-6 md:p-10 space-y-6">
      <header>
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Rules</p>
        <h1 className="font-display text-3xl mt-1">Safety rules</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-prose">
          Read-only view of the deterministic guardrails that fire during a review. Each rule
          lists its severity, the drug classes that trigger it, and the pharmacist-facing
          counselling message it produces.
        </p>
        {count > 0 && (
          <p className="mt-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {count} {count === 1 ? "rule" : "rules"} loaded
          </p>
        )}
      </header>
      <div className="space-y-3">
        {(data ?? []).map((r) => (
          <div key={r.rule_id} className="pp-glass p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg">{r.name}</h3>
              <span className="pp-chip text-[11px]">{r.severity}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{r.description}</p>
            <p className="mt-3 text-sm">{r.pharmacist_message}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(r.trigger_drug_classes ?? []).map((c) => (
                <span key={c} className="pp-chip text-[11px]">cls: {c}</span>
              ))}
              {(r.trigger_patient_factors ?? []).map((c) => (
                <span key={c} className="pp-chip text-[11px] bg-accent/10 border-accent/20">factor: {c}</span>
              ))}
            </div>
          </div>
        ))}
        {data && data.length === 0 && (
          <div className="pp-glass p-10 text-center">
            <p className="font-display text-lg">No rules loaded</p>
            <p className="text-sm text-muted-foreground mt-1">
              The deterministic safety rules will appear here once the catalogue migrations are
              applied.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
