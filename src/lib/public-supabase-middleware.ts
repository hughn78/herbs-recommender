// Anonymous (no sign-in) Supabase access for the clinical review flow.
// Patient identity is never stored, so cases are saved without an owner and
// RLS policies scoped to `user_id IS NULL` govern access.
import { createMiddleware } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    // New-format Supabase keys are opaque strings, not bearer JWTs.
    const opaque =
      supabaseKey.startsWith("sb_publishable_") || supabaseKey.startsWith("sb_secret_");
    if (opaque && headers.get("Authorization") === `Bearer ${supabaseKey}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

export const publicSupabase = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const SUPABASE_URL = process.env["SUPABASE_URL"];
  const SUPABASE_PUBLISHABLE_KEY = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Missing Supabase environment variables.");
  }

  const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: { fetch: createSupabaseFetch(SUPABASE_PUBLISHABLE_KEY) },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });

  return next({ context: { supabase, userId: null as string | null } });
});
