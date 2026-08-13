import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, CheckCircle2, AlertTriangle, Database, BarChart3 } from "lucide-react";
import {
  getTgIngestStatusFn,
  ingestTgShardFn,
  verifyTgIngestFn,
} from "@/lib/tg-ingest.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/app/_admin/tg-ingest")({
  component: TgIngestPage,
  errorComponent: ({ error }) => (
    <div className="p-8 text-sm text-destructive">{error.message}</div>
  ),
  notFoundComponent: () => <div className="p-8">Not found</div>,
});

function TgIngestPage() {
  const getStatus = useServerFn(getTgIngestStatusFn);
  const ingestShard = useServerFn(ingestTgShardFn);
  const verify = useServerFn(verifyTgIngestFn);

  const [running, setRunning] = useState(false);
  const [currentShard, setCurrentShard] = useState(0);
  const [shardResults, setShardResults] = useState<
    Array<{ shard: number; processed: number; total: number }>
  >([]);
  const runningRef = useRef(false);

  const statusQuery = useQuery({
    queryKey: ["tg-ingest-status"],
    queryFn: () => getStatus(),
    refetchInterval: running ? 2000 : 30000,
  });

  const verifyQuery = useQuery({
    queryKey: ["tg-ingest-verify"],
    queryFn: () => verify(),
    enabled: false,
  });

  const ingestMutation = useMutation({
    mutationFn: (shardNum: number) => ingestShard({ data: { shardNum } }),
    onSuccess: (data) => {
      setShardResults((prev) => [
        ...prev,
        { shard: data.shardNum, processed: data.processed, total: data.total },
      ]);
      toast.success(`Shard ${data.shardNum}: ${data.processed} rows upserted`);
    },
    onError: (e: Error) => {
      toast.error(`Shard failed: ${e.message}`);
      setRunning(false);
      runningRef.current = false;
    },
  });

  const handleIngestAll = async () => {
    setRunning(true);
    runningRef.current = true;
    setShardResults([]);

    for (let i = 1; i <= 17; i++) {
      if (!runningRef.current) break;
      setCurrentShard(i);
      try {
        await ingestMutation.mutateAsync(i);
      } catch {
        break;
      }
    }

    setRunning(false);
    runningRef.current = false;
    setCurrentShard(0);
    statusQuery.refetch();
    verifyQuery.refetch();
  };

  const handleStop = () => {
    setRunning(false);
    runningRef.current = false;
  };

  const handleVerify = () => {
    verifyQuery.refetch();
  };

  const status = statusQuery.data;
  const verifyData = verifyQuery.data;
  const totalProcessed = shardResults.reduce((sum, r) => sum + r.processed, 0);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Database className="h-6 w-6" />
          TG Chunks Ingestion
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Therapeutic Guidelines governed-chunks table. Edition 2026-Q3. 17
          shards, ~1000 rows each.
        </p>
      </div>

      {/* Status card */}
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Current State</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => statusQuery.refetch()}
            disabled={statusQuery.isFetching}
          >
            {statusQuery.isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Refresh"
            )}
          </Button>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-4">
          <StatBox label="Total Rows" value={status?.totalRows ?? "-"} />
          <StatBox label="Active Rows" value={status?.activeRows ?? "-"} />
          <StatBox
            label="Edition 2026-Q3"
            value={status?.editionRows ?? "-"}
          />
        </div>
      </Card>

      {/* Ingestion controls */}
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Ingestion</h2>
          {!running ? (
            <Button onClick={handleIngestAll} disabled={ingestMutation.isPending}>
              <Play className="mr-2 h-4 w-4" />
              Ingest All Shards
            </Button>
          ) : (
            <div className="flex items-center gap-3">
              <Badge variant="secondary">
                Shard {currentShard}/17
              </Badge>
              <Button variant="destructive" size="sm" onClick={handleStop}>
                Stop
              </Button>
            </div>
          )}
        </div>

        {shardResults.length > 0 && (
          <div className="mt-4 space-y-2">
            <div className="text-sm text-muted-foreground">
              Processed {totalProcessed} rows across {shardResults.length}{" "}
              shards
            </div>
            <div className="flex flex-wrap gap-1">
              {shardResults.map((r) => (
                <Badge key={r.shard} variant="outline" className="text-xs">
                  {r.shard}: {r.processed}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Verification */}
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <BarChart3 className="h-5 w-5" />
            Verification
          </h2>
          <Button
            variant="outline"
            size="sm"
            onClick={handleVerify}
            disabled={verifyQuery.isFetching}
          >
            {verifyQuery.isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Run Verification"
            )}
          </Button>
        </div>

        {verifyData && (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <StatBox
                label="Total Rows"
                value={verifyData.totalRows}
                expected={16677}
              />
              <StatBox
                label="Active Rows"
                value={verifyData.activeRows}
                expected={16677}
              />
              <StatBox
                label="Edition 2026-Q3"
                value={verifyData.editionRows}
                expected={16677}
              />
            </div>

            {verifyData.topicAreas.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-medium">
                  Topic Area Distribution (top 25)
                </h3>
                <div className="space-y-1">
                  {verifyData.topicAreas.map((t) => (
                    <div
                      key={t.area}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="text-muted-foreground">{t.label}</span>
                      <Badge variant="secondary">{t.count}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {verifyData.samples.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-medium">
                  Sample Rows (provenance check)
                </h3>
                <div className="space-y-1">
                  {verifyData.samples.map((s) => (
                    <div key={s.chunk_id} className="text-xs">
                      <span className="font-mono">{s.chunk_id}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        | {s.title} | {s.source_name} | {s.excerpt_length} chars
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 text-sm">
              {verifyData.totalRows === 16677 ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span>Row count matches expected 16,677</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  <span>
                    Row count {verifyData.totalRows} differs from expected
                    16,677
                  </span>
                </>
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function StatBox({
  label,
  value,
  expected,
}: {
  label: string;
  value: string | number;
  expected?: number;
}) {
  const numValue = typeof value === "number" ? value : parseInt(String(value), 10);
  const isMatch = expected !== undefined && numValue === expected;
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-center gap-2 text-xl font-bold">
        {value}
        {isMatch && <CheckCircle2 className="h-4 w-4 text-green-500" />}
      </div>
      {expected !== undefined && !isMatch && (
        <div className="text-xs text-muted-foreground">
          expected {expected}
        </div>
      )}
    </div>
  );
}