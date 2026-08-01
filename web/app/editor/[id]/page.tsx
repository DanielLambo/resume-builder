import { notFound, redirect } from "next/navigation";

import { AppHeader } from "@/components/AppHeader";
import { EditorClient } from "@/components/editor/EditorClient";
import {
  formatJobTargetLabel,
  getJobTargetFromDataJson,
} from "@/lib/job-target";
import {
  getLatexFromDataJson,
  getTemplateIdFromDataJson,
} from "@/lib/resume-template";
import { shouldForceOnboarding } from "@/lib/onboarding/gate";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

type EditorPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditorPage({ params }: EditorPageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=/editor/${id}`);
  }

  if (await shouldForceOnboarding(user)) {
    redirect("/onboarding");
  }

  const { data: resume, error } = await supabase
    .from("resumes")
    .select("id, title, data_json, user_id")
    .eq("id", id)
    .maybeSingle();

  if (error || !resume || resume.user_id !== user.id) {
    notFound();
  }

  const job = getJobTargetFromDataJson(resume.data_json);

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <AppHeader email={user.email} />
      <div className="min-h-0 flex-1 overflow-hidden">
        <EditorClient
          resumeId={resume.id}
          title={resume.title}
          initialLatex={getLatexFromDataJson(resume.data_json)}
          initialTemplateId={getTemplateIdFromDataJson(resume.data_json)}
          jobLabel={job ? formatJobTargetLabel(job) : null}
        />
      </div>
    </div>
  );
}
