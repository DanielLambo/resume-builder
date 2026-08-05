import { Suspense } from "react";

import { AppHeader } from "@/components/AppHeader";
import { ImportResumeClient } from "@/components/import/ImportResumeClient";
import { PrivacyNotice } from "@/components/PrivacyNotice";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function ImportPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="min-h-dvh bg-studio-bg">
      {user ? <AppHeader email={user.email} /> : null}
      <Suspense
        fallback={
          <div className="mx-auto max-w-xl px-5 py-16 text-sm text-studio-muted">
            Loading import desk…
          </div>
        }
      >
        <ImportResumeClient signedIn={Boolean(user)} />
      </Suspense>
      <div className="mx-auto max-w-xl px-5 pb-12 sm:px-8">
        <PrivacyNotice />
      </div>
    </div>
  );
}
