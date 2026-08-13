// Offline Therapeutic Guidelines ingest script.
//
// Reads a JSONL chunk file, runs it through the deterministic
// decideIngest pipeline, and upserts into the tg_chunks table via
// PostgREST using the service-role key from the environment.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     npx tsx scripts/ingest_tg.ts \
//       --jsonl /path/to/tg_chunks.jsonl \
//       --edition 2026-Q3 \
//       [--dry-run]

import { ingestTgChunks } from "../src/lib/tg-ingest";

type Args = {
  jsonl: string;
  edition: string;
  dryRun: boolean;
};

function parseArgs(argv: string[]): Args {
  const out: Args = { jsonl: "", edition: "", dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--jsonl") out.jsonl = argv[++i] ?? "";
    else if (a === "--edition") out.edition = argv[++i] ?? "";
    else if (a === "--dry-run") out.dryRun = true;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.jsonl || !args.edition) {
    process.stderr.write(
      "Usage: tsx scripts/ingest_tg.ts --jsonl <path> --edition <id> [--dry-run]\n",
    );
    process.exit(2);
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!args.dryRun && (!url || !key)) {
    process.stderr.write(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (or pass --dry-run)\n",
    );
    process.exit(2);
  }

  const stats = await ingestTgChunks({
    jsonlPath: args.jsonl,
    edition: args.edition,
    supabase: { url: url ?? "", serviceRoleKey: key ?? "" },
    dryRun: args.dryRun,
    onLog: (line) => process.stdout.write(`${line}\n`),
  });
  process.stdout.write(JSON.stringify(stats, null, 2) + "\n");
  if (stats.unresolved > 0) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  process.stderr.write(`ingest_tg failed: ${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
  process.exit(1);
});
