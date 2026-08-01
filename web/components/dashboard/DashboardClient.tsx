"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  createResumeAction,
  deleteResumeAction,
  duplicateResumeAction,
  getResumePdfSignedUrlAction,
} from "@/app/actions/resumes";
import { tailorResumeForJobAction } from "@/app/actions/tailor-job";
import { TailorForJobModal } from "@/components/dashboard/TailorForJobModal";
import { TemplatePicker } from "@/components/templates/TemplatePicker";
import type { ResumeRow } from "@/lib/database.types";
import {
  formatJobTargetLabel,
  getJobTargetFromDataJson,
} from "@/lib/job-target";
import type { ResumeTemplateId } from "@/lib/resume-template";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

function ResumeCardSkeleton() {
  return (
    <div className="animate-pulse border border-studio-border bg-studio-paper p-4">
      <div className="mb-3 h-24 bg-studio-canvas" />
      <div className="mb-2 h-4 w-2/3 bg-studio-canvas" />
      <div className="h-3 w-1/3 bg-studio-canvas" />
    </div>
  );
}

export function DashboardClient({
  initialResumes,
}: {
  initialResumes: ResumeRow[];
}) {
  const router = useRouter();
  const [resumes, setResumes] = useState(initialResumes);
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [tailorSource, setTailorSource] = useState<ResumeRow | null>(null);
  const [tailoring, setTailoring] = useState(false);

  function openPicker() {
    setPickerOpen(true);
  }

  function createFromTemplate(templateId: ResumeTemplateId, title: string) {
    setPickerOpen(false);
    startTransition(async () => {
      const toastId = toast.loading("Creating resume…");
      const result = await createResumeAction(title, templateId);
      if (!result.ok || !result.id) {
        toast.error(result.ok ? "Missing resume id" : result.error, {
          id: toastId,
        });
        return;
      }
      toast.success("Resume created", { id: toastId });
      router.push(`/editor/${result.id}`);
    });
  }

  function onDuplicate(id: string) {
    setBusyId(id);
    startTransition(async () => {
      const result = await duplicateResumeAction(id);
      setBusyId(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? "Duplicated");
      router.refresh();
      if (result.id) {
        const source = resumes.find((r) => r.id === id);
        if (!source) return;
        const copy: ResumeRow = {
          ...source,
          id: result.id,
          title: `${source.title} (copy)`,
          updated_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        };
        setResumes((prev) => [copy, ...prev]);
      }
    });
  }

  function onDelete(id: string) {
    if (!confirm("Delete this resume permanently?")) return;
    setBusyId(id);
    startTransition(async () => {
      const result = await deleteResumeAction(id);
      setBusyId(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setResumes((prev) => prev.filter((r) => r.id !== id));
      toast.success(result.message ?? "Deleted");
      router.refresh();
    });
  }

  function onDownload(id: string) {
    setBusyId(id);
    startTransition(async () => {
      const result = await getResumePdfSignedUrlAction(id);
      setBusyId(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (!result.url) {
        toast.error("No PDF URL returned.");
        return;
      }
      window.open(result.url, "_blank", "noopener,noreferrer");
      toast.success("PDF download ready");
    });
  }

  function onTailorConfirm(input: {
    company: string;
    role: string;
    jobDescription: string;
  }) {
    if (!tailorSource) return;
    const sourceId = tailorSource.id;
    setTailoring(true);
    setBusyId(sourceId);
    startTransition(async () => {
      const toastId = toast.loading("Tailoring a job-specific resume…", {
        description: "Duplicating base sheet and rewriting for the posting.",
      });
      const result = await tailorResumeForJobAction({
        sourceResumeId: sourceId,
        company: input.company,
        role: input.role,
        jobDescription: input.jobDescription,
      });
      setTailoring(false);
      setBusyId(null);
      if (!result.ok) {
        toast.error(result.error, { id: toastId });
        return;
      }
      setTailorSource(null);
      toast.success("Job resume ready", {
        id: toastId,
        description: result.compileWarning
          ? `${result.title} · preview pending: ${result.compileWarning}`
          : `${result.title} · ${result.tokensUsed.toLocaleString()} tokens`,
      });
      router.push(`/editor/${result.id}`);
    });
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-8 flex flex-col gap-4 border-b border-studio-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs tracking-wide text-studio-muted">
            RESUMATE / LIBRARY
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-studio-ink">
            Your resumes
          </h1>
          <p className="mt-1 max-w-xl text-sm text-studio-muted">
            Keep one base sheet, then tailor a copy for each job application.
          </p>
        </div>
        <button
          type="button"
          onClick={openPicker}
          disabled={pending}
          className="inline-flex min-h-11 w-full items-center justify-center bg-studio-vermilion px-4 py-2.5 text-sm font-semibold text-white hover:bg-studio-vermilion-hover disabled:opacity-60 sm:w-auto"
          data-testid="create-resume"
        >
          {pending && !busyId ? "Creating…" : "Create New Resume"}
        </button>
      </div>

      {resumes.length === 0 ? (
        <div className="grid place-items-center gap-3 border border-studio-border bg-studio-paper px-6 py-16 text-center shadow-paper-sheet">
          <h2 className="text-lg font-semibold text-studio-ink">
            Nothing on the desk yet
          </h2>
          <p className="max-w-md text-sm text-studio-muted">
            Pick a template built for new grads — PM, SWE, EE, MechE, or a
            clean general layout — then tailor a copy for each posting.
          </p>
          <button
            type="button"
            onClick={openPicker}
            className="mt-2 bg-studio-vermilion px-4 py-2 text-sm font-semibold text-white hover:bg-studio-vermilion-hover"
          >
            Choose a template
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {resumes.map((resume) => {
            const busy = busyId === resume.id;
            const job = getJobTargetFromDataJson(resume.data_json);
            return (
              <article
                key={resume.id}
                className="flex flex-col overflow-hidden border border-studio-border bg-studio-paper shadow-paper-sheet"
              >
                <div className="relative h-28 border-b border-studio-border bg-studio-canvas p-4">
                  <div className="h-full border border-studio-border bg-studio-paper p-3 shadow-sm">
                    <div className="mb-2 h-2 w-1/2 bg-studio-ink/20" />
                    <div className="mb-1.5 h-1.5 w-full bg-studio-border" />
                    <div className="mb-1.5 h-1.5 w-5/6 bg-studio-border" />
                    <div className="h-1.5 w-2/3 bg-studio-border" />
                  </div>
                  {job ? (
                    <span className="absolute left-3 top-3 max-w-[calc(100%-1.5rem)] truncate border border-studio-border bg-white/95 px-2 py-0.5 font-mono text-[0.6rem] text-studio-ink">
                      JOB · {formatJobTargetLabel(job)}
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-1 flex-col gap-3 p-4">
                  <div>
                    <h2 className="truncate text-base font-semibold text-studio-ink">
                      {resume.title}
                    </h2>
                    <p className="font-mono text-[0.65rem] text-studio-muted">
                      Updated {formatDate(resume.updated_at)}
                    </p>
                  </div>
                  <div className="mt-auto grid grid-cols-2 gap-2">
                    <Link
                      href={`/editor/${resume.id}`}
                      className="col-span-2 inline-flex min-h-11 items-center justify-center bg-studio-vermilion px-3 py-2.5 text-center text-sm font-semibold text-white hover:bg-studio-vermilion-hover"
                    >
                      Open editor
                    </Link>
                    <button
                      type="button"
                      disabled={busy || pending}
                      onClick={() => setTailorSource(resume)}
                      className="col-span-2 min-h-10 border border-studio-ink/20 bg-studio-canvas px-3 py-2 text-xs font-semibold text-studio-ink hover:bg-studio-border/40 disabled:opacity-50"
                      data-testid="tailor-for-job"
                    >
                      Tailor for job
                    </button>
                    <button
                      type="button"
                      disabled={busy || pending}
                      onClick={() => onDuplicate(resume.id)}
                      className="min-h-10 border border-studio-border px-3 py-2 text-xs font-medium text-studio-ink hover:bg-studio-canvas disabled:opacity-50"
                    >
                      Duplicate
                    </button>
                    <button
                      type="button"
                      disabled={busy || pending}
                      onClick={() => onDownload(resume.id)}
                      className="min-h-10 border border-studio-border px-3 py-2 text-xs font-medium text-studio-ink hover:bg-studio-canvas disabled:opacity-50"
                    >
                      Download PDF
                    </button>
                    <button
                      type="button"
                      disabled={busy || pending}
                      onClick={() => onDelete(resume.id)}
                      className="col-span-2 min-h-10 border border-studio-border px-3 py-2 text-xs font-medium text-studio-vermilion hover:bg-red-50 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <TemplatePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onConfirm={createFromTemplate}
      />
      <TailorForJobModal
        open={Boolean(tailorSource)}
        sourceTitle={tailorSource?.title ?? "this resume"}
        busy={tailoring}
        onClose={() => {
          if (!tailoring) setTailorSource(null);
        }}
        onConfirm={onTailorConfirm}
      />
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-8 h-10 w-48 animate-pulse bg-studio-canvas" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ResumeCardSkeleton />
        <ResumeCardSkeleton />
        <ResumeCardSkeleton />
      </div>
    </div>
  );
}
