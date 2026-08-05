"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  STUDIO_TOUR_DONE_KEY,
  STUDIO_TOUR_PENDING_KEY,
  STUDIO_TOUR_STEPS,
} from "@/lib/studio-tour";

type StudioTourProps = {
  welcome?: boolean;
};

type Spotlight = {
  top: number;
  left: number;
  width: number;
  height: number;
};

function readRect(selector: string): Spotlight | null {
  const el = document.querySelector(selector);
  if (!(el instanceof HTMLElement)) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

export function StudioTour({ welcome = false }: StudioTourProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [spot, setSpot] = useState<Spotlight | null>(null);

  const step = STUDIO_TOUR_STEPS[index];

  const close = useCallback(
    (opts?: { skip?: boolean }) => {
      try {
        window.localStorage.setItem(STUDIO_TOUR_DONE_KEY, "1");
        window.localStorage.removeItem(STUDIO_TOUR_PENDING_KEY);
      } catch {
        /* ignore */
      }
      setOpen(false);
      if (typeof window !== "undefined" && window.location.search.includes("tour=")) {
        router.replace("/dashboard");
      }
      if (opts?.skip) return;
    },
    [router],
  );

  useEffect(() => {
    try {
      if (window.localStorage.getItem(STUDIO_TOUR_DONE_KEY) === "1") return;
      setOpen(true);
      if (welcome) {
        void import("canvas-confetti")
          .then(({ default: confetti }) => {
            confetti({
              particleCount: 80,
              spread: 68,
              origin: { y: 0.25 },
              colors: ["#C44B3B", "#2F3A33", "#E8E4DC", "#1A1A1A"],
            });
          })
          .catch(() => undefined);
      }
    } catch {
      setOpen(true);
    }
  }, [welcome]);

  useEffect(() => {
    if (!open || !step) return;

    const update = () => setSpot(readRect(step.target));
    update();
    const timer = window.setInterval(update, 250);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [index, open, step]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close({ skip: true });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, open]);

  if (!open || !step) return null;

  const last = index >= STUDIO_TOUR_STEPS.length - 1;
  const cardTop = spot
    ? Math.min(
        Math.max(12, spot.top + spot.height + 12),
        window.innerHeight - 200,
      )
    : 96;
  const cardLeft = spot
    ? Math.min(Math.max(12, spot.left), window.innerWidth - 320)
    : 16;

  return (
    <div className="fixed inset-0 z-[80]" data-testid="studio-tour">
      <button
        type="button"
        className="absolute inset-0 bg-studio-ink/45"
        aria-label="Dismiss tour"
        onClick={() => close({ skip: true })}
      />

      {spot ? (
        <div
          className="pointer-events-none absolute rounded-md ring-2 ring-white ring-offset-2 ring-offset-studio-ink/40"
          style={{
            top: spot.top - 4,
            left: spot.left - 4,
            width: spot.width + 8,
            height: spot.height + 8,
          }}
        />
      ) : null}

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="studio-tour-title"
        className="absolute w-[min(20rem,calc(100vw-1.5rem))] border border-studio-border bg-studio-paper p-4 shadow-floating-bar max-sm:inset-x-3 max-sm:bottom-3 sm:w-80"
        style={
          typeof window !== "undefined" && window.innerWidth >= 640
            ? { top: cardTop, left: cardLeft }
            : undefined
        }
      >
        <p className="font-mono text-[0.65rem] uppercase tracking-wide text-studio-muted">
          Quick tour · {index + 1}/{STUDIO_TOUR_STEPS.length}
        </p>
        <h2
          id="studio-tour-title"
          className="mt-1 text-base font-semibold text-studio-ink"
        >
          {step.title}
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-studio-muted">{step.body}</p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            className="min-h-9 px-2 text-xs font-medium text-studio-muted hover:text-studio-ink"
            onClick={() => close({ skip: true })}
          >
            Skip
          </button>
          <button
            type="button"
            className="min-h-9 bg-studio-ink px-3 text-xs font-semibold text-white hover:bg-studio-ink/90"
            onClick={() => {
              if (last) {
                close();
                return;
              }
              setIndex((i) => i + 1);
            }}
          >
            {last ? "Got it" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
