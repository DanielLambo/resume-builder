import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { SETUP_DONE_COOKIE } from "@/lib/auth-next";
import { metadataNeedsOnboarding } from "@/lib/onboarding/needs-onboarding";
import { createClient } from "@/lib/supabase/server";

export { metadataNeedsOnboarding } from "@/lib/onboarding/needs-onboarding";

/**
 * `/onboarding` shows the wizard only when this account still needs setup
 * (signup-flagged, unfinished, no resumes yet). Login and product routes
 * never call this to force a redirect — wizard entry is signup navigation only.
 */
export async function shouldForceOnboarding(user: User): Promise<boolean> {
  if (!metadataNeedsOnboarding(user)) return false;

  try {
    const jar = await cookies();
    if (jar.get(SETUP_DONE_COOKIE)?.value === user.id) {
      return false;
    }
  } catch {
    /* cookies() unavailable outside a request */
  }

  try {
    const supabase = await createClient();
    const { count, error } = await supabase
      .from("resumes")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);

    if (error) {
      console.error("[onboarding/gate] resume count failed:", error.message);
      return false;
    }

    return (count ?? 0) === 0;
  } catch (err) {
    console.error("[onboarding/gate] unexpected:", err);
    return false;
  }
}
