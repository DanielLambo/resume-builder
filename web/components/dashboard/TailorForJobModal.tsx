"use client";

import { useEffect, useState } from "react";

import { SheetChrome } from "@/components/ui/SheetChrome";

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

  const canSubmit =
    company.trim().length > 0 &&
    role.trim().length > 0 &&
    jobDescription.trim().length >= 20 &&
    !busy;

  return (
    <SheetChrome
      open={open}
      titleId="tailor-job-title"
      onClose={onClose}
      size="md"
      testId="tailor-job-modal"
      dismissible={!busy}
    >
      <p className="text-[0.65rem] font-medium uppercase tracking-wide text-studio-muted">
        Job application
      </p>
      <h2
        id="tailor-job-title"
        className="type-title mt-1 text-xl font-semibold text-studio-ink"
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
            className="rounded-lg border border-studio-border bg-white px-3 py-2.5 text-sm text-studio-ink outline-none focus:ring-2 focus:ring-studio-vermilion"
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
            className="rounded-lg border border-studio-border bg-white px-3 py-2.5 text-sm text-studio-ink outline-none focus:ring-2 focus:ring-studio-vermilion"
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
            className="min-h-[10rem] resize-y rounded-lg border border-studio-border bg-white px-3 py-2.5 font-mono text-sm text-studio-ink outline-none focus:ring-2 focus:ring-studio-vermilion"
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

      <div className="sticky bottom-0 mt-5 flex flex-col-reverse gap-2 bg-gradient-to-t from-white via-white to-transparent pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="pressable min-h-11 rounded-lg border border-studio-border px-3 py-2.5 text-sm text-studio-ink hover:bg-studio-canvas disabled:opacity-60 sm:min-h-0"
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
          className="pressable min-h-11 rounded-lg bg-studio-vermilion px-4 py-2.5 text-sm font-semibold text-white hover:bg-studio-vermilion-hover disabled:opacity-60 sm:min-h-0"
        >
          {busy ? "Tailoring…" : "Create tailored resume"}
        </button>
      </div>
    </SheetChrome>
  );
}
