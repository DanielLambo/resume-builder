"use client";

import { useEffect, useState } from "react";

import { SheetChrome } from "@/components/ui/SheetChrome";
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

  return (
    <SheetChrome
      open={open}
      titleId="template-picker-title"
      onClose={onClose}
      size="lg"
      testId="template-picker"
    >
      <p className="text-[0.65rem] font-medium uppercase tracking-wide text-studio-muted">
        Templates
      </p>
      <h2
        id="template-picker-title"
        className="type-title mt-1 text-xl font-semibold text-studio-ink"
      >
        {title}
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-studio-muted">
        Built for new grads — education, internships, and projects with
        measurable outcomes.
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
            className="mt-1 w-full rounded-lg border border-studio-border bg-white px-3 py-2 font-mono text-sm text-studio-ink outline-none focus:ring-2 focus:ring-studio-vermilion"
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
                  "pressable flex h-full w-full flex-col gap-2 rounded-xl border px-3 py-3 text-left",
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

      <div className="sticky bottom-0 mt-5 flex flex-col-reverse gap-2 bg-gradient-to-t from-white via-white to-transparent pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-3 sm:flex-row sm:flex-wrap sm:justify-end">
        <button
          type="button"
          onClick={onClose}
          className="pressable min-h-11 rounded-lg border border-studio-border px-3 py-2.5 text-sm text-studio-ink hover:bg-studio-canvas sm:min-h-0"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onConfirm(selected, resumeTitle.trim() || "My Resume")}
          className="pressable min-h-11 rounded-lg bg-studio-vermilion px-4 py-2.5 text-sm font-semibold text-white hover:bg-studio-vermilion-hover sm:min-h-0"
          data-testid="template-picker-confirm"
        >
          {confirmLabel}
        </button>
      </div>
    </SheetChrome>
  );
}
