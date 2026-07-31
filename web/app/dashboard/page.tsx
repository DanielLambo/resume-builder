import { Suspense } from "react";
import { redirect } from "next/navigation";

import { AppHeader } from "@/components/AppHeader";
import {
  DashboardClient,
  DashboardSkeleton,
} from "@/components/dashboard/DashboardClient";
import { PrivacyNotice } from "@/components/PrivacyNotice";
import type { ResumeRow } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";

async function DashboardBody() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/dashboard");
  }

  if (user.user_metadata?.onboarding_completed !== true) {
    redirect("/onboarding");
  }

  const { data, error } = await supabase
    .from("resumes")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (
    <div className="space-y-6">
      <DashboardClient initialResumes={(data ?? []) as ResumeRow[]} />
      <div className="mx-auto max-w-6xl px-4 pb-10 sm:px-6">
        <PrivacyNotice />
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <>
      <AppHeader email={user?.email} />
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardBody />
      </Suspense>
    </>
  );
}
