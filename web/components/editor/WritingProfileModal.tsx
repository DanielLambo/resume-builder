"use client";

import { useEffect, useState, useTransition } from "react";

import { saveWritingProfileAction } from "@/app/actions/writing-profile";
import {
  labelsForFields,
  labelsForJobTypes,
} from "@/lib/onboarding/options";
import type { WritingProfile } from "@/lib/writing-profile";

type WritingProfileModalProps = {
  open: boolean;
  profile: WritingProfile;
  onClose: () => void;
  onSaved: (profile: WritingProfile) => void;
};

export function WritingProfileModal({
  open,
  profile,
  onClose,
  onSaved,
}: WritingProfileModalProps) {
  const [instructions, setInstructions] = useState(profile.instructions ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (open) {
      setInstructions(profile.instructions ?? "");
      setError(null);
    }
  }, [open, profile.instructions]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const jobLabels = labelsForJobTypes(profile.jobTypes);
  const fieldLabels = labelsForFields(profile.targetFields);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-studio-ink/35 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="writing-profile-title"
      data-testid="writing-profile-modal"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md border border-studio-border bg-studio-paper p-4 shadow-paper-sheet sm:p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="font-mono text-[0.65rem] uppercase tracking-wide text-studio-muted">
          Resumate / writing profile
        </p>
        <h2
          id="writing-profile-title"
          className="mt-1 text-xl font-semibold tracking-tight text-studio-ink"
        >
          Writing profile
        </h2>
        <p className="mt-1 text-sm text-studio-muted">
          Applied silently to every AI edit and review.
        </p>

        <dl className="mt-4 space-y-2 text-sm text-studio-muted">
          {profile.fullName ? (
            <div>
              <dt className="text-xs font-medium text-studio-ink">Name</dt>
              <dd>{profile.fullName}</dd>
            </div>
          ) : null}
          {jobLabels.length ? (
            <div>
              <dt className="text-xs font-medium text-studio-ink">Job types</dt>
              <dd>{jobLabels.join(" · ")}</dd>
            </div>
          ) : null}
          {fieldLabels.length ? (
            <div>
              <dt className="text-xs font-medium text-studio-ink">Fields</dt>
              <dd>{fieldLabels.join(" · ")}</dd>
            </div>
          ) : null}
        </dl>

        <label className="mt-4 block text-sm font-medium text-studio-ink">
          Voice & preferences
          <textarea
            data-testid="writing-profile-instructions"
            className="mt-1.5 w-full resize-none border border-studio-border bg-white px-3 py-2 text-sm text-studio-ink outline-none focus:ring-2 focus:ring-studio-vermilion/30"
            rows={4}
            maxLength={500}
            value={instructions}
            disabled={pending}
            placeholder="e.g. Prefer short bullets, ban “leveraged”, always quantify impact when true…"
            onChange={(e) => setInstructions(e.target.value)}
          />
        </label>
        <p className="mt-1 text-right font-mono text-[0.65rem] text-studio-muted">
          {instructions.length}/500
        </p>

        {error ? (
          <p className="mt-2 text-sm text-studio-vermilion">{error}</p>
        ) : null}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 border border-studio-border px-3 py-2.5 text-sm text-studio-ink transition hover:bg-studio-canvas sm:min-h-9"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="writing-profile-save"
            disabled={pending}
            className="min-h-11 bg-studio-vermilion px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-studio-vermilion-hover disabled:opacity-50 sm:min-h-9"
            onClick={() => {
              startTransition(async () => {
                const result = await saveWritingProfileAction({ instructions });
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                onSaved(result.profile);
                onClose();
              });
            }}
          >
            {pending ? "Saving…" : "Save profile"}
          </button>
        </div>
      </div>
    </div>
  );
}
