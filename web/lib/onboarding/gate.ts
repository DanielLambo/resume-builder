import type { User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/** True when the user still needs the first-run wizard. */
export function metadataNeedsOnboarding(user: User | null | undefined): boolean {
  return user?.user_metadata?.onboarding_completed !== true;
}

/**
 * Existing accounts that already have resumes should not be locked behind
 * onboarding (grandfather). New empty accounts still go through the wizard.
 */
export async function shouldForceOnboarding(user: User): Promise<boolean> {
  if (!metadataNeedsOnboarding(user)) return false;

  const supabase = await createClient();
  const { count, error } = await supabase
    .from("resumes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if (error) {
    // Fail open to the product if the count query fails.
    return false;
  }

  return (count ?? 0) === 0;
}
