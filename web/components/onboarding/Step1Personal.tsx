"use client";

import { useRef } from "react";
import { Camera } from "lucide-react";

import { AVATAR_COLORS } from "@/lib/onboarding/schema";
import type { OnboardingData } from "@/lib/onboarding/schema";

type Step1PersonalProps = {
  data: OnboardingData;
  onChange: (partial: Partial<OnboardingData>) => void;
  onContinue: () => void;
  canContinue: boolean;
};

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

export function Step1Personal({
  data,
  onChange,
  onContinue,
  canContinue,
}: Step1PersonalProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const nameError =
    data.fullName.trim().length > 0 && data.fullName.trim().length < 2
      ? "Enter at least 2 characters"
      : null;

  function onFile(file: File | undefined) {
    if (!file || !file.type.startsWith("image/")) return;
    if (file.size > 2_000_000) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        onChange({ avatarUrl: reader.result });
      }
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-studio-ink sm:text-4xl">
          Welcome! Let&apos;s get to know you
        </h1>
        <p className="max-w-xl text-sm leading-relaxed text-studio-muted sm:text-base">
          Tell us a bit about yourself to personalize your drafting table.
        </p>
      </header>

      <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="relative grid h-24 w-24 place-items-center overflow-hidden rounded-2xl border border-studio-border shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-studio-vermilion"
          style={{ backgroundColor: data.avatarUrl ? undefined : data.avatarColor }}
          aria-label="Upload profile photo"
        >
          {data.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-2xl font-semibold text-white">
              {initialsFrom(data.displayName || data.fullName)}
            </span>
          )}
          <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/45 py-1 text-[0.65rem] font-medium text-white">
            <Camera className="h-3 w-3" aria-hidden="true" />
            Photo
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0])}
        />

        <div className="space-y-2">
          <p className="font-mono text-[0.65rem] uppercase tracking-wide text-studio-muted">
            Avatar color
          </p>
          <div className="flex flex-wrap gap-2">
            {AVATAR_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={`Choose avatar color ${color}`}
                onClick={() => onChange({ avatarColor: color, avatarUrl: undefined })}
                className={[
                  "h-8 w-8 rounded-full border-2 transition",
                  data.avatarColor === color && !data.avatarUrl
                    ? "border-studio-ink scale-110"
                    : "border-transparent",
                ].join(" ")}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4">
        <label className="grid gap-1.5">
          <span className="text-xs font-medium text-studio-muted">Full name</span>
          <input
            className="rounded-xl border border-studio-border bg-white px-3.5 py-3 text-sm text-studio-ink outline-none transition focus:ring-2 focus:ring-studio-vermilion"
            value={data.fullName}
            onChange={(e) => onChange({ fullName: e.target.value })}
            placeholder="Alex Rivera"
            autoComplete="name"
            required
          />
          {nameError ? (
            <span className="text-xs text-studio-vermilion">{nameError}</span>
          ) : null}
        </label>

        <label className="grid gap-1.5">
          <span className="text-xs font-medium text-studio-muted">
            Preferred first name{" "}
            <span className="text-studio-muted/70">(optional)</span>
          </span>
          <input
            className="rounded-xl border border-studio-border bg-white px-3.5 py-3 text-sm text-studio-ink outline-none transition focus:ring-2 focus:ring-studio-vermilion"
            value={data.displayName ?? ""}
            onChange={(e) => onChange({ displayName: e.target.value })}
            placeholder="Alex"
            autoComplete="nickname"
          />
        </label>
      </div>

      <button
        type="button"
        disabled={!canContinue}
        onClick={onContinue}
        className="w-full rounded-xl bg-studio-vermilion px-4 py-3 text-sm font-semibold text-white transition hover:bg-studio-vermilion-hover disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:min-w-[180px]"
      >
        Continue
      </button>
    </div>
  );
}
