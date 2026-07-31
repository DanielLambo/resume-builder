import { notFound, redirect } from "next/navigation";

import { AppHeader } from "@/components/AppHeader";
import { EditorClient } from "@/components/editor/EditorClient";
import { getLatexFromDataJson } from "@/lib/resume-template";
import { createClient } from "@/lib/supabase/server";

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

  const { data: resume, error } = await supabase
    .from("resumes")
    .select("id, title, data_json, user_id")
    .eq("id", id)
    .maybeSingle();

  if (error || !resume || resume.user_id !== user.id) {
    notFound();
  }

  return (
    <>
      <AppHeader email={user.email} />
      <EditorClient
        resumeId={resume.id}
        title={resume.title}
        initialLatex={getLatexFromDataJson(resume.data_json)}
      />
    </>
  );
}
