"use client";

import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

type OnboardingLayoutProps = {
  step: number;
  totalSteps?: number;
  canGoBack: boolean;
  showSkip?: boolean;
  onBack: () => void;
  onSkip?: () => void;
  children: ReactNode;
};

export function OnboardingLayout({
  step,
  totalSteps = 4,
  canGoBack,
  showSkip = false,
  onBack,
  onSkip,
  children,
}: OnboardingLayoutProps) {
  const progress = (step / totalSteps) * 100;

  return (
    <div className="min-h-dvh bg-studio-bg">
      <header className="sticky top-0 z-20 border-b border-studio-border bg-studio-bg/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            {canGoBack ? (
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 font-mono text-xs text-studio-muted transition hover:bg-studio-canvas hover:text-studio-ink"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                Back
              </button>
            ) : (
              <span className="font-mono text-xs tracking-wide text-studio-muted">
                TYPESETTER / SETUP
              </span>
            )}
          </div>

          <p className="font-mono text-xs text-studio-muted">
            Step {step} of {totalSteps}
          </p>

          {showSkip && onSkip ? (
            <button
              type="button"
              onClick={onSkip}
              className="rounded-lg px-2 py-1.5 font-mono text-xs text-studio-muted transition hover:bg-studio-canvas hover:text-studio-ink"
            >
              Skip
            </button>
          ) : (
            <span className="w-12" aria-hidden="true" />
          )}
        </div>

        <div className="h-1 w-full bg-studio-canvas" role="progressbar" aria-valuenow={step} aria-valuemin={1} aria-valuemax={totalSteps}>
          <div
            className="h-full bg-studio-vermilion transition-[width] duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="mx-auto flex max-w-3xl justify-center gap-2 px-4 py-3 sm:px-6">
          {Array.from({ length: totalSteps }, (_, i) => {
            const n = i + 1;
            const active = n === step;
            const done = n < step;
            return (
              <span
                key={n}
                className={[
                  "h-2 w-2 rounded-full transition-all",
                  active
                    ? "w-6 bg-studio-vermilion"
                    : done
                      ? "bg-studio-ink/40"
                      : "bg-studio-border",
                ].join(" ")}
                aria-hidden="true"
              />
            );
          })}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">{children}</main>
    </div>
  );
}
