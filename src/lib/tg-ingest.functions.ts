// TG chunks ingestion server function.
//
// Reads a processed shard from the deployed static assets (public/tg_shards/),
// parses it, and upserts into the tg_chunks table using the service-role
// admin client that Lovable Cloud provides via env.
//
// The browser only sends a shard number (1-17). The server fetches the
// shard JSON from its own origin, so no large payloads go through the
// browser and no credentials are exposed client-side.
//
// Mirrors the existing ingestShardFn pattern from ingest.functions.ts.

import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

async function assertAdmin(context: {
  supabase: SupabaseClient<Database>;
  userId: string;
}) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error("Not authorized");
  if (!data) throw new Error("Not authorized: admin role required");
}

type TgIngestRow = Database["public"]["Tables"]["tg_chunks"]["Insert"];

export const getTgIngestStatusFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    const [{ count: total }, { count: active }, { count: editionCount }] =
      await Promise.all([
        supabaseAdmin.from("tg_chunks").select("*", { count: "exact", head: true }),
        supabaseAdmin
          .from("tg_chunks")
          .select("*", { count: "exact", head: true })
          .eq("active", true),
        supabaseAdmin
          .from("tg_chunks")
          .select("*", { count: "exact", head: true })
          .eq("edition", "2026-Q3"),
      ]);

    return {
      totalRows: total ?? 0,
      activeRows: active ?? 0,
      editionRows: editionCount ?? 0,
      edition: "2026-Q3",
      numShards: 17,
    };
  });

export const ingestTgShardFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { shardNum: number }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    const shardNum = data.shardNum;
    if (typeof shardNum !== "number" || shardNum < 1 || shardNum > 17) {
      throw new Error(`Invalid shard number: ${shardNum}`);
    }

    // Fetch the shard JSON from our own deployed static assets.
    // On Lovable Cloud the deployed URL is available via getRequest()
    const padded = String(shardNum).padStart(2, "0");
    const shardPath = `/tg_shards/tg_shard_${padded}.json`;

    const request = getRequest();
    const requestOrigin = request ? new URL(request.url).origin : null;

    // Try multiple origin strategies for Lovable Cloud compatibility.
    const candidates = [
      // From the request origin if available
      ...(requestOrigin ? [requestOrigin + shardPath] : []),
      // Lovable deployment URL pattern
      ...(process.env.VITE_SUPABASE_URL
        ? [
            process.env.VITE_SUPABASE_URL.replace(
              ".supabase.co",
              ".lovable.app",
            ) + shardPath,
          ]
        : []),
      // Fallback: relative path (works in some Nitro setups)
      shardPath,
    ];

    let rows: TgIngestRow[] | null = null;
    let lastError: string | null = null;

    for (const url of candidates) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          rows = (await res.json()) as TgIngestRow[];
          break;
        }
        lastError = `${res.status} ${url}`;
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
      }
    }

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      throw new Error(
        `Failed to fetch shard ${shardNum}. Last error: ${lastError}`,
      );
    }

    // Upsert in batches of 250 to stay under PostgREST limits.
    const BATCH = 250;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const slice = rows.slice(i, i + BATCH);
      const { error: insErr } = await supabaseAdmin
        .from("tg_chunks")
        .upsert(slice, { onConflict: "chunk_id" });
      if (insErr) throw new Error(`Upsert failed: ${insErr.message}`);
      inserted += slice.length;
    }

    return {
      shardNum,
      processed: inserted,
      total: rows.length,
      done: true,
    };
  });

export const verifyTgIngestFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    // Total + active + edition counts
    const [{ count: total }, { count: activeCount }, { count: editionCount }] =
      await Promise.all([
        supabaseAdmin
          .from("tg_chunks")
          .select("*", { count: "exact", head: true }),
        supabaseAdmin
          .from("tg_chunks")
          .select("*", { count: "exact", head: true })
          .eq("active", true),
        supabaseAdmin
          .from("tg_chunks")
          .select("*", { count: "exact", head: true })
          .eq("edition", "2026-Q3"),
      ]);

    // Topic area distribution (top 25)
    const { data: topicData } = await supabaseAdmin
      .from("tg_chunks")
      .select("topic_area, topic_area_label")
      .eq("active", true);

    const topicMap = new Map<string, { label: string; count: number }>();
    for (const row of topicData ?? []) {
      const key = row.topic_area ?? "(null)";
      const existing = topicMap.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        topicMap.set(key, {
          label: row.topic_area_label ?? key,
          count: 1,
        });
      }
    }
    const topicAreas = Array.from(topicMap.entries())
      .map(([area, { label, count }]) => ({ area, label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 25);

    // Sample rows for provenance check
    const { data: samples } = await supabaseAdmin
      .from("tg_chunks")
      .select(
        "chunk_id, title, source_name, source_url, excerpt_length, edition",
      )
      .eq("active", true)
      .limit(5);

    return {
      totalRows: total ?? 0,
      activeRows: activeCount ?? 0,
      editionRows: editionCount ?? 0,
      topicAreas,
      samples: samples ?? [],
    };
  });