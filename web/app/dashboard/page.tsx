import { Suspense } from "react";
import { redirect } from "next/navigation";

import { AppHeader } from "@/components/AppHeader";
import {
  DashboardClient,
  DashboardSkeleton,
} from "@/components/dashboard/DashboardClient";
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

  const { data, error } = await supabase
    .from("resumes")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return <DashboardClient initialResumes={(data ?? []) as ResumeRow[]} />;
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
