import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { SETUP_DONE_COOKIE } from "@/lib/auth-next";
import { metadataNeedsOnboarding } from "@/lib/onboarding/needs-onboarding";
import { createClient } from "@/lib/supabase/server";

export { metadataNeedsOnboarding } from "@/lib/onboarding/needs-onboarding";

/**
 * Existing accounts that already have resumes should not be locked behind
 * onboarding (grandfather). New signups are flagged `onboarding_required`.
 *
 * On count failure, fail open so a login is never trapped in the wizard.
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
