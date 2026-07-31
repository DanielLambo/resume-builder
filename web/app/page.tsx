import Link from "next/link";
import { redirect } from "next/navigation";

import { PrivacyNotice } from "@/components/PrivacyNotice";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      redirect("/dashboard");
    }
  } catch {
    // Missing env in local preview — fall through.
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-4 px-6 py-12">
      <p className="font-mono text-xs tracking-wide text-studio-muted">
        TYPESETTER / RESUME ENGINE
      </p>
      <h1 className="max-w-[14ch] text-4xl font-semibold tracking-tight text-studio-ink sm:text-5xl">
        Edit cleanly. Tailor per job.
      </h1>
      <p className="max-w-md text-studio-muted">
        A bright drafting table for resumes — vibe edits, one-page lock, and a daily AI meter.
      </p>
      <div className="mt-2 flex flex-wrap gap-3">
        <Link
          href="/login"
          className="bg-studio-vermilion px-4 py-2.5 text-sm font-semibold text-white hover:bg-studio-vermilion-hover"
        >
          Sign in
        </Link>
        <Link
          href="/signup"
          className="border border-studio-border bg-studio-paper px-4 py-2.5 text-sm font-semibold text-studio-ink hover:bg-studio-canvas"
        >
          Create account
        </Link>
      </div>
      <PrivacyNotice className="mt-6 max-w-lg" />
    </main>
  );
}
