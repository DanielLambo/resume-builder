import { Suspense } from "react";
import { redirect } from "next/navigation";

import { AppHeader } from "@/components/AppHeader";
import {
  DashboardClient,
  DashboardSkeleton,
} from "@/components/dashboard/DashboardClient";
import { StudioTour } from "@/components/dashboard/StudioTour";
import { PrivacyNotice } from "@/components/PrivacyNotice";
import type { ResumeRow } from "@/lib/database.types";
import { shouldForceOnboarding } from "@/lib/onboarding/gate";
import { createClient } from "@/lib/supabase/server";

async function DashboardBody({
  userId,
  openTemplates = false,
}: {
  userId: string;
  openTemplates?: boolean;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("resumes")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="border border-studio-border bg-studio-paper px-6 py-10 text-center shadow-paper-sheet">
          <h1 className="text-xl font-semibold text-studio-ink">
            Couldn’t load your library
          </h1>
          <p className="mt-2 text-sm text-studio-muted">
            {error.message || "A temporary database error occurred."}
          </p>
          <a
            href="/dashboard"
            className="mt-6 inline-flex bg-studio-vermilion px-4 py-2.5 text-sm font-semibold text-white hover:bg-studio-vermilion-hover"
          >
            Retry
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DashboardClient
        initialResumes={(data ?? []) as ResumeRow[]}
        openTemplates={openTemplates}
      />
      <div className="mx-auto max-w-6xl px-4 pb-10 sm:px-6">
        <PrivacyNotice />
      </div>
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ tour?: string; new?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/dashboard");
  }

  if (await shouldForceOnboarding(user)) {
    redirect("/onboarding");
  }

  return (
    <>
      <AppHeader email={user.email} />
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardBody userId={user.id} openTemplates={params.new === "1"} />
      </Suspense>
      <StudioTour welcome={params.tour === "1"} />
    </>
  );
}
