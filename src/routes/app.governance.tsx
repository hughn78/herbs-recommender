import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Check, ClipboardCheck, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import {
  bulkApproveProductsFn,
  getReviewQueueFn,
  reviewEntityFn,
  type ReviewQueue,
} from "@/lib/governance.functions";

export const Route = createFileRoute("/app/governance")({
  component: GovernancePage,
  errorComponent: ({ error }) => (
    <div className="p-8 text-sm text-destructive">{error.message}</div>
  ),
});

function GovernancePage() {
  const getQueue = useServerFn(getReviewQueueFn);
  const queueQuery = useQuery({
    queryKey: ["governance-queue"],
    queryFn: () => getQueue(),
    retry: false,
  });

  return (
    <div className="mx-auto max-w-5xl p-6 md:p-10 space-y-6">
      <header>
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Governance</p>
        <h1 className="font-display text-3xl mt-1">Clinical content review</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-prose">
          Approve or reject extracted catalogue content before it reaches the recommendation
          engine. Every transition is audited with reviewer, previous value, reason and timestamp.
          Only <span className="font-medium text-foreground">approved</span> products drive patient
          case recommendations.
        </p>
      </header>

      {queueQuery.isLoading && (
        <div className="text-sm text-muted-foreground">Loading review queue…</div>
      )}
      {queueQuery.isError && (
        <Card className="p-4 bg-amber-500/5 border-amber-500/20 text-sm">
          Governance queue unavailable ({(queueQuery.error as Error).message}). Apply the governed
          catalogue and governance migrations, then run the ingestion pipeline.
        </Card>
      )}
      {queueQuery.data && <QueueBody queue={queueQuery.data} />}
    </div>
  );
}

function QueueBody({ queue }: { queue: ReviewQueue }) {
  const { summary } = queue;
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Products to review" value={summary.productsNeedingReview} />
        <SummaryCard label="Claims to review" value={summary.claimsNeedingReview} />
        <SummaryCard label="Warnings to review" value={summary.warningsNeedingReview} />
        <SummaryCard label="Images to review" value={summary.imagesNeedingReview} />
        <SummaryCard label="Unapproved synonyms" value={summary.unapprovedSynonyms} />
        <SummaryCard label="Open data-quality issues" value={summary.openDataQualityIssues} />
        <SummaryCard label="Extraction conflicts" value={summary.openExtractionConflicts} />
      </div>

      <BulkApproveBar pendingCount={summary.productsNeedingReview} />
      <ProductQueue queue={queue} />
      <IssueQueue queue={queue} />
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-4 bg-card/60 backdrop-blur-sm">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl">{value}</p>
    </Card>
  );
}

function BulkApproveBar({ pendingCount }: { pendingCount: number }) {
  const bulkApprove = useServerFn(bulkApproveProductsFn);
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);

  const mut = useMutation({
    mutationFn: (r: string) => bulkApprove({ data: { reason: r } }),
    onSuccess: (res) => {
      toast.success(`Approved ${res.approved} products`);
      setReason("");
      setConfirming(false);
      queryClient.invalidateQueries({ queryKey: ["governance-queue"] });
      queryClient.invalidateQueries({ queryKey: ["catalogue-products"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (pendingCount === 0) {
    return (
      <Card className="p-4 bg-accent/5 border-accent/20 text-sm flex items-center gap-2">
        <Check className="h-4 w-4 text-accent" />
        All catalogue products are approved — the governed catalogue is driving recommendations.
      </Card>
    );
  }

  return (
    <Card className="p-4 bg-card/60 backdrop-blur-sm space-y-3 border-amber-500/30">
      <div className="flex items-start gap-2">
        <ClipboardCheck className="h-4 w-4 mt-0.5 text-amber-600 dark:text-amber-400" />
        <div className="text-sm">
          <p className="font-medium">Initial-ingestion bulk approval</p>
          <p className="text-muted-foreground">
            {pendingCount} products await review. Bulk-approve transitions them all to approved in
            one audited action — use after spot-checking the extraction reports, so the governed
            catalogue can start driving recommendations.
          </p>
        </div>
      </div>
      <div className="flex flex-col md:flex-row gap-2">
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Review reason (required, written to the audit trail)…"
          className="flex-1"
        />
        {!confirming ? (
          <Button
            variant="outline"
            disabled={reason.trim().length === 0}
            onClick={() => setConfirming(true)}
          >
            Approve all {pendingCount} products…
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button
              disabled={mut.isPending}
              onClick={() => mut.mutate(reason.trim())}
            >
              {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : `Confirm approve ${pendingCount}`}
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

function ProductQueue({ queue }: { queue: ReviewQueue }) {
  const review = useServerFn(reviewEntityFn);
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");

  const mut = useMutation({
    mutationFn: (input: { entityId: string; action: "approve" | "reject" }) =>
      review({
        data: {
          entityType: "product",
          entityId: input.entityId,
          action: input.action,
          reason: reason.trim(),
        },
      }),
    onSuccess: () => {
      toast.success("Review recorded");
      queryClient.invalidateQueries({ queryKey: ["governance-queue"] });
      queryClient.invalidateQueries({ queryKey: ["catalogue-products"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (queue.products.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex flex-col md:flex-row md:items-center gap-2">
        <h2 className="text-xs uppercase tracking-[0.18em] text-muted-foreground flex-1">
          Products awaiting review · {queue.products.length}
        </h2>
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Shared review reason for per-product actions…"
          className="md:w-80 h-8 text-sm"
        />
      </div>
      <Card className="divide-y divide-border/40 bg-card/60 backdrop-blur-sm">
        {queue.products.map((p) => (
          <div key={p.productId} className="flex items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <Link
                to="/app/products/$hogCode"
                params={{ hogCode: p.hogCode }}
                className="text-sm font-medium hover:underline underline-offset-2"
              >
                {p.name}
              </Link>
              <p className="text-xs text-muted-foreground">
                <span className="font-mono">{p.hogCode}</span>
                {p.extractionConfidence ? ` · extraction ${p.extractionConfidence}` : ""}
                {p.sourcePage ? ` · PDF page ${p.sourcePage}` : ""}
              </p>
            </div>
            <Badge className="text-[10px] bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400 shrink-0">
              Needs review
            </Badge>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs shrink-0"
              disabled={mut.isPending || reason.trim().length === 0}
              onClick={() => mut.mutate({ entityId: p.productId, action: "approve" })}
            >
              <Check className="h-3 w-3 mr-1" /> Approve
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs shrink-0 text-signal"
              disabled={mut.isPending || reason.trim().length === 0}
              onClick={() => mut.mutate({ entityId: p.productId, action: "reject" })}
            >
              <X className="h-3 w-3 mr-1" /> Reject
            </Button>
          </div>
        ))}
      </Card>
    </section>
  );
}

function IssueQueue({ queue }: { queue: ReviewQueue }) {
  const review = useServerFn(reviewEntityFn);
  const queryClient = useQueryClient();

  const mut = useMutation({
    mutationFn: (input: { entityId: string; action: "approve" | "reject" }) =>
      review({
        data: {
          entityType: "issue",
          entityId: input.entityId,
          action: input.action,
          reason: "Triaged in governance queue",
        },
      }),
    onSuccess: () => {
      toast.success("Issue updated");
      queryClient.invalidateQueries({ queryKey: ["governance-queue"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (queue.issues.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
        Open data-quality issues · {queue.issues.length}
      </h2>
      <Card className="divide-y divide-border/40 bg-card/60 backdrop-blur-sm">
        {queue.issues.map((i) => (
          <div key={i.issueId} className="flex items-start gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                {i.hogCode ? <span className="font-mono text-xs mr-2">{i.hogCode}</span> : null}
                {i.description ?? i.issueType}
              </p>
              <p className="text-xs text-muted-foreground">
                {i.issueType}
                {i.severity ? ` · ${i.severity}` : ""}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs shrink-0"
              disabled={mut.isPending}
              onClick={() => mut.mutate({ entityId: i.issueId, action: "approve" })}
            >
              Resolve
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs shrink-0 text-muted-foreground"
              disabled={mut.isPending}
              onClick={() => mut.mutate({ entityId: i.issueId, action: "reject" })}
            >
              Won&apos;t fix
            </Button>
          </div>
        ))}
      </Card>
    </section>
  );
}
