import type { User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/** True when the user still needs the first-run wizard. */
export function metadataNeedsOnboarding(user: User | null | undefined): boolean {
  return user?.user_metadata?.onboarding_completed !== true;
}

/**
 * Existing accounts that already have resumes should not be locked behind
 * onboarding (grandfather). New empty accounts still go through the wizard.
 *
 * On count failure, fail toward onboarding for unfinished profiles.
 */
export async function shouldForceOnboarding(user: User): Promise<boolean> {
  if (!metadataNeedsOnboarding(user)) return false;

  try {
    const supabase = await createClient();
    const { count, error } = await supabase
      .from("resumes")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);

    if (error) {
      console.error("[onboarding/gate] resume count failed:", error.message);
      return true;
    }

    return (count ?? 0) === 0;
  } catch (err) {
    console.error("[onboarding/gate] unexpected:", err);
    return true;
  }
}
