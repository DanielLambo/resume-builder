import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "@/lib/database.types";

/** Well-known local Supabase demo anon key — only used to survive `next build`. */
const BUILD_PLACEHOLDER_URL = "http://127.0.0.1:54321";
const BUILD_PLACEHOLDER_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

function isNextProductionBuild(): boolean {
  return process.env.NEXT_PHASE === "phase-production-build";
}

export function hasSupabasePublicEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim(),
  );
}

export async function createClient() {
  // Touch cookies first so the route is dynamic even if env is missing at build.
  const cookieStore = await cookies();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) {
    // `next build` may still evaluate force-dynamic pages once. Don't crash the
    // worker when Vercel hasn't injected NEXT_PUBLIC_* into the build env yet.
    if (isNextProductionBuild()) {
      return createServerClient<Database>(BUILD_PLACEHOLDER_URL, BUILD_PLACEHOLDER_ANON_KEY, {
        cookies: {
          getAll() {
            return [];
          },
          setAll() {
            /* no-op during build */
          },
        },
      });
    }
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component — middleware will refresh sessions.
        }
      },
    },
  });
}
