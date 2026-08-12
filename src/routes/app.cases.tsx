import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listCasesFn } from "@/lib/cases.functions";

export const Route = createFileRoute("/app/cases")({
  component: CasesPage,
});

function CasesPage() {
  const fn = useServerFn(listCasesFn);
  const { data } = useQuery({ queryKey: ["cases"], queryFn: () => fn() });
  const count = data?.length ?? 0;
  return (
    <div className="mx-auto max-w-4xl p-6 md:p-10 space-y-6">
      <header>
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">History</p>
        <h1 className="font-display text-3xl mt-1">Past reviews</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-prose">
          Every saved patient case with the deterministic recommendations generated at the time of
          review. Open a case to re-export, leave feedback, or compare against current rules.
        </p>
        {count > 0 && (
          <p className="mt-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {count} {count === 1 ? "review" : "reviews"}
          </p>
        )}
      </header>
      <div className="pp-flat divide-y divide-hairline">
        {(data ?? []).map((c) => (
          <Link
            key={c.case_id}
            to="/app/case/$caseId"
            params={{ caseId: c.case_id }}
            className="block px-4 py-3 hover:bg-secondary/40"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                {c.case_label || `${c.sex ?? "Patient"} · ${c.age ?? "?"}y`}
              </p>
              <span className="text-xs text-muted-foreground">
                {new Date(c.created_at).toLocaleString("en-AU")}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{c.symptoms || "—"}</p>
          </Link>
        ))}
        {data && data.length === 0 && (
          <div className="px-4 py-10 text-center">
            <p className="font-display text-lg">No reviews yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Saved cases will appear here. Start one from the New Review tab.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
