"use client";

import { useEffect, useState } from "react";

type TailorForJobModalProps = {
  open: boolean;
  sourceTitle: string;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (input: {
    company: string;
    role: string;
    jobDescription: string;
  }) => void;
};

export function TailorForJobModal({
  open,
  sourceTitle,
  busy = false,
  onClose,
  onConfirm,
}: TailorForJobModalProps) {
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [jobDescription, setJobDescription] = useState("");

  useEffect(() => {
    if (!open) return;
    setCompany("");
    setRole("");
    setJobDescription("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  const canSubmit =
    company.trim().length > 0 &&
    role.trim().length > 0 &&
    jobDescription.trim().length >= 20 &&
    !busy;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-end bg-studio-ink/35 p-0 sm:place-items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tailor-job-title"
      data-testid="tailor-job-modal"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="max-h-[92dvh] w-full max-w-lg overflow-auto rounded-2xl border border-studio-border bg-studio-paper p-4 shadow-paper-sheet sm:p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[0.65rem] font-medium uppercase tracking-wide text-studio-muted">
          Job application
        </p>
        <h2
          id="tailor-job-title"
          className="mt-1 text-xl font-semibold tracking-tight text-studio-ink"
        >
          Tailor for this job
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-studio-muted">
          Copies <span className="text-studio-ink">{sourceTitle}</span>, then
          rewrites bullets to match the posting. Facts stay honest — no invented
          roles.
        </p>

        <div className="mt-4 grid gap-3">
          <label className="grid gap-1.5 text-xs text-studio-muted">
            Company
            <input
              className="border border-studio-border bg-white px-3 py-2.5 text-sm text-studio-ink outline-none focus:ring-2 focus:ring-studio-vermilion"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Acme Corp"
              maxLength={120}
              disabled={busy}
              autoFocus
            />
          </label>
          <label className="grid gap-1.5 text-xs text-studio-muted">
            Role
            <input
              className="border border-studio-border bg-white px-3 py-2.5 text-sm text-studio-ink outline-none focus:ring-2 focus:ring-studio-vermilion"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="Software Engineering Intern"
              maxLength={120}
              disabled={busy}
            />
          </label>
          <label className="grid gap-1.5 text-xs text-studio-muted">
            Job description
            <textarea
              className="min-h-[10rem] resize-y border border-studio-border bg-white px-3 py-2.5 font-mono text-sm text-studio-ink outline-none focus:ring-2 focus:ring-studio-vermilion"
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              placeholder="Paste the job posting here…"
              maxLength={20_000}
              disabled={busy}
              data-testid="tailor-job-description"
            />
            <span className="font-mono text-[0.65rem] text-studio-muted/80">
              {jobDescription.trim().length < 40
                ? `Paste at least ${40 - jobDescription.trim().length} more characters`
                : `${jobDescription.trim().length.toLocaleString()} / 20,000`}
            </span>
          </label>
        </div>

        <div className="sticky bottom-0 mt-5 flex flex-col-reverse gap-2 bg-studio-paper pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="min-h-11 border border-studio-border px-3 py-2.5 text-sm text-studio-ink hover:bg-studio-canvas disabled:opacity-60 sm:min-h-0"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            data-testid="tailor-job-confirm"
            onClick={() =>
              onConfirm({
                company: company.trim(),
                role: role.trim(),
                jobDescription: jobDescription.trim(),
              })
            }
            className="min-h-11 bg-studio-vermilion px-4 py-2.5 text-sm font-semibold text-white hover:bg-studio-vermilion-hover disabled:opacity-60 sm:min-h-0"
          >
            {busy ? "Tailoring…" : "Create tailored resume"}
          </button>
        </div>
      </div>
    </div>
  );
}
