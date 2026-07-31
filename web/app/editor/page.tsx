import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/**
 * Typesetter studio entry — resumes are per-id.
 * Send signed-in users to their library; others to login.
 */
export default async function EditorIndexPage() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      redirect("/dashboard");
    }
  } catch {
    // fall through
  }
  redirect("/login?next=/dashboard");
}
