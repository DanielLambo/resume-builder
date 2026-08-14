"use client";

import { useEffect, useState, useTransition } from "react";

import { saveWritingProfileAction } from "@/app/actions/writing-profile";
import { SheetChrome } from "@/components/ui/SheetChrome";
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
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending, onClose]);

  const jobLabels = labelsForJobTypes(profile.jobTypes);
  const fieldLabels = labelsForFields(profile.targetFields);

  return (
    <SheetChrome
      open={open}
      titleId="writing-profile-title"
      onClose={onClose}
      size="sm"
      testId="writing-profile-modal"
      dismissible={!pending}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2
            id="writing-profile-title"
            className="type-title text-base font-semibold text-studio-ink"
          >
            Writing profile
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-studio-muted">
            Applied silently to every AI edit and review.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="pressable rounded-md px-2 py-1 text-xs text-studio-muted hover:text-studio-ink"
        >
          Close
        </button>
      </div>

      <dl className="mt-4 space-y-2 text-xs text-studio-muted">
        {profile.fullName ? (
          <div>
            <dt className="font-medium text-studio-ink">Name</dt>
            <dd>{profile.fullName}</dd>
          </div>
        ) : null}
        {jobLabels.length ? (
          <div>
            <dt className="font-medium text-studio-ink">Job types</dt>
            <dd>{jobLabels.join(" · ")}</dd>
          </div>
        ) : null}
        {fieldLabels.length ? (
          <div>
            <dt className="font-medium text-studio-ink">Fields</dt>
            <dd>{fieldLabels.join(" · ")}</dd>
          </div>
        ) : null}
      </dl>

      <label className="mt-4 block text-xs font-medium text-studio-ink">
        Voice & preferences
        <textarea
          data-testid="writing-profile-instructions"
          className="mt-1.5 w-full resize-none rounded-lg border border-studio-border bg-studio-paper px-3 py-2 text-sm text-studio-ink outline-none focus:border-studio-ink/30"
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
        <p className="mt-2 text-xs text-studio-vermilion">{error}</p>
      ) : null}

      <button
        type="button"
        data-testid="writing-profile-save"
        disabled={pending}
        className="pressable mt-3 min-h-10 w-full rounded-lg bg-studio-vermilion px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
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
    </SheetChrome>
  );
}
