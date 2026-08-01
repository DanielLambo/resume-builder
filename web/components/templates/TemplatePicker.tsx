"use client";

import { useEffect, useState } from "react";

import {
  DEFAULT_TEMPLATE_ID,
  RESUME_TEMPLATES,
  type ResumeTemplateId,
} from "@/lib/resume-template";

type TemplatePickerProps = {
  open: boolean;
  title?: string;
  confirmLabel?: string;
  initialTemplateId?: ResumeTemplateId;
  onClose: () => void;
  onConfirm: (templateId: ResumeTemplateId, resumeTitle: string) => void;
  /** When true, hide the resume title field (editor switch). */
  hideTitle?: boolean;
};

export function TemplatePicker({
  open,
  title = "Choose a template",
  confirmLabel = "Create resume",
  initialTemplateId = DEFAULT_TEMPLATE_ID,
  onClose,
  onConfirm,
  hideTitle = false,
}: TemplatePickerProps) {
  const [selected, setSelected] = useState<ResumeTemplateId>(initialTemplateId);
  const [resumeTitle, setResumeTitle] = useState("My Resume");

  useEffect(() => {
    if (!open) return;
    setSelected(initialTemplateId);
    setResumeTitle("My Resume");
  }, [open, initialTemplateId]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-end bg-studio-ink/35 p-0 sm:place-items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="template-picker-title"
      data-testid="template-picker"
      onClick={onClose}
    >
      <div
        className="max-h-[92dvh] w-full max-w-3xl overflow-auto border border-studio-border bg-studio-paper p-4 shadow-paper-sheet sm:p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-mono text-[0.65rem] uppercase tracking-wide text-studio-muted">
          Resumate / templates
        </p>
        <h2
          id="template-picker-title"
          className="mt-1 text-xl font-semibold tracking-tight text-studio-ink"
        >
          {title}
        </h2>
        <p className="mt-1 text-sm text-studio-muted">
          {hideTitle
            ? "Replacing the template overwrites the current source. Unsaved wording in this draft will be lost."
            : "Built for new grads — education, internships, and projects with measurable outcomes."}
        </p>

        {!hideTitle ? (
          <label className="mt-4 block">
            <span className="font-mono text-[0.65rem] uppercase tracking-wide text-studio-muted">
              Resume title
            </span>
            <input
              type="text"
              value={resumeTitle}
              onChange={(e) => setResumeTitle(e.target.value)}
              className="mt-1 w-full border border-studio-border bg-white px-3 py-2 font-mono text-sm text-studio-ink outline-none focus:ring-2 focus:ring-studio-vermilion"
              maxLength={120}
            />
          </label>
        ) : null}

        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {RESUME_TEMPLATES.map((tpl) => {
            const active = selected === tpl.id;
            return (
              <li key={tpl.id}>
                <button
                  type="button"
                  onClick={() => setSelected(tpl.id)}
                  className={[
                    "flex h-full w-full flex-col gap-2 border px-3 py-3 text-left transition",
                    active
                      ? "border-studio-vermilion bg-studio-vermilion/5"
                      : "border-studio-border bg-white hover:bg-studio-canvas",
                  ].join(" ")}
                  data-testid={`template-option-${tpl.id}`}
                  aria-pressed={active}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-studio-ink">
                      {tpl.name}
                    </span>
                    {tpl.isDefault ? (
                      <span className="font-mono text-[0.6rem] text-studio-vermilion">
                        DEFAULT
                      </span>
                    ) : null}
                  </div>
                  <span className="font-mono text-[0.65rem] text-studio-muted">
                    {tpl.audience}
                  </span>
                  <span className="text-xs leading-relaxed text-studio-muted">
                    {tpl.description}
                  </span>
                  <div className="mt-auto flex flex-wrap gap-1 pt-1">
                    {tpl.tags.map((tag) => (
                      <span
                        key={tag}
                        className="border border-studio-border px-1.5 py-0.5 font-mono text-[0.6rem] text-studio-muted"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="sticky bottom-0 mt-5 flex flex-col-reverse gap-2 bg-studio-paper pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 border border-studio-border px-3 py-2.5 text-sm text-studio-ink hover:bg-studio-canvas sm:min-h-0"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(selected, resumeTitle.trim() || "My Resume")}
            className="min-h-11 bg-studio-vermilion px-4 py-2.5 text-sm font-semibold text-white hover:bg-studio-vermilion-hover sm:min-h-0"
            data-testid="template-picker-confirm"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
