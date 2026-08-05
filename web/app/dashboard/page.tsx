import { Suspense } from "react";
import { redirect } from "next/navigation";

import { AppHeader } from "@/components/AppHeader";
import {
  DashboardClient,
  DashboardSkeleton,
} from "@/components/dashboard/DashboardClient";
import { StudioTour } from "@/components/dashboard/StudioTour";
import { PrivacyNotice } from "@/components/PrivacyNotice";
import type { Json, ResumeRow } from "@/lib/database.types";
import { asDataRecord, getJobTargetFromDataJson } from "@/lib/job-target";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** List rows without shipping full latex / ai_history to the browser. */
function slimResumeForLibrary(row: ResumeRow): ResumeRow {
  const job = getJobTargetFromDataJson(row.data_json);
  const record = asDataRecord(row.data_json);
  const template =
    typeof record.template === "string" ? record.template : undefined;
  const data_json = (
    job ? { job } : template ? { template } : {}
  ) as Json;
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    created_at: row.created_at,
    updated_at: row.updated_at,
    data_json,
  };
}

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
    .select("id, user_id, title, created_at, updated_at, data_json")
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

  const slim = ((data ?? []) as ResumeRow[]).map(slimResumeForLibrary);

  return (
    <div className="space-y-6">
      <DashboardClient initialResumes={slim} openTemplates={openTemplates} />
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
