"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { PrivacyNotice } from "@/components/PrivacyNotice";

const TYPING_LINES = [
  "Alex Rivera — Software Engineer",
  "Cut checkout API p95 latency ~40%",
  "Shipped React dashboard for 12k weekly users",
  "Tailored for Backend SWE Intern · Stripe",
] as const;

function useTypewriter(lines: readonly string[], active: boolean) {
  const [lineIndex, setLineIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!active) return;
    if (done) {
      const restart = window.setTimeout(() => {
        setLineIndex(0);
        setCharIndex(0);
        setDone(false);
      }, 2600);
      return () => window.clearTimeout(restart);
    }

    const current = lines[lineIndex] ?? "";
    if (charIndex < current.length) {
      const t = window.setTimeout(() => setCharIndex((c) => c + 1), 42 + (charIndex % 4) * 10);
      return () => window.clearTimeout(t);
    }

    if (lineIndex < lines.length - 1) {
      const t = window.setTimeout(() => {
        setLineIndex((i) => i + 1);
        setCharIndex(0);
      }, 420);
      return () => window.clearTimeout(t);
    }

    const t = window.setTimeout(() => setDone(true), 900);
    return () => window.clearTimeout(t);
  }, [active, charIndex, done, lineIndex, lines]);

  return { lineIndex, charIndex, done };
}

export function HomeLanding() {
  const [motionOn, setMotionOn] = useState(true);
  const { lineIndex, charIndex } = useTypewriter(TYPING_LINES, motionOn);
  const liveLine =
    (TYPING_LINES[lineIndex] ?? "").slice(0, charIndex) ||
    TYPING_LINES[0].slice(0, 1);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setMotionOn(!mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  return (
    <div className="bg-studio-bg">
      <section className="relative isolate min-h-dvh overflow-x-hidden">
        <div
          className={`absolute inset-0 ${motionOn ? "animate-hero-ken" : ""}`}
          aria-hidden="true"
        >
          <Image
            src="/images/landing-hero-typist.jpg"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover object-[62%_28%] sm:object-[70%_35%] md:object-[74%_32%]"
          />
        </div>

        {/* Stronger wash on phones so type stays readable over the photo */}
        <div
          className="absolute inset-0 bg-gradient-to-b from-[#FAF8F5]/95 via-[#FAF8F5]/88 to-[#FAF8F5]/55 sm:bg-gradient-to-r sm:from-[#FAF8F5] sm:via-[#FAF8F5]/80 sm:to-transparent"
          aria-hidden="true"
        />

        <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-8 sm:pb-16 lg:px-10">
          <header className="flex shrink-0 items-center justify-between gap-3">
            <Link
              href="/"
              className="text-[0.95rem] font-semibold tracking-tight text-studio-ink transition hover:text-studio-ink/80 sm:text-base"
            >
              Resumate
            </Link>
            <Link
              href="/login"
              className="min-h-10 rounded-lg px-3 py-2 text-sm font-medium text-studio-ink/70 transition hover:bg-white/55 hover:text-studio-ink"
            >
              Sign in
            </Link>
          </header>

          {/* Mobile: top-aligned stack. Desktop: vertically centered copy. */}
          <div
            className={[
              "flex min-h-0 flex-1 flex-col",
              "pt-8 sm:pt-0 sm:justify-center",
              motionOn ? "animate-hero-rise" : "",
            ].join(" ")}
          >
            <div className="max-w-xl">
              <p className="font-semibold tracking-tight text-studio-ink text-[clamp(2.35rem,11vw,4.65rem)] leading-[0.92]">
                Resumate
              </p>
              <h1 className="mt-4 max-w-[18ch] text-[1.35rem] font-semibold leading-snug tracking-tight text-studio-ink sm:mt-5 sm:text-[2rem]">
                A sharper resume for every job you want.
              </h1>
              <p className="mt-3 max-w-md text-[0.95rem] leading-relaxed text-studio-ink/70 sm:text-[1.05rem]">
                Honest AI edits, hiring-manager feedback, and a locked one-page
                PDF. Apply faster without inventing anything.
              </p>
              <div className="mt-6 flex w-full flex-col gap-2.5 sm:mt-7 sm:max-w-none sm:flex-row sm:gap-3">
                <Link
                  href="/signup"
                  className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-studio-vermilion px-5 py-3 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(229,75,75,0.22)] transition hover:bg-studio-vermilion-hover sm:w-auto"
                >
                  Start free
                </Link>
                <Link
                  href="/import"
                  className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-studio-ink/12 bg-white/80 px-5 py-3 text-sm font-semibold text-studio-ink backdrop-blur-sm transition hover:bg-white sm:w-auto"
                >
                  Import resume
                </Link>
              </div>

              {/* Mobile: single live line — no multi-line mono wall */}
              <p
                className="mt-6 flex min-h-[1.5rem] items-center gap-1 overflow-hidden font-mono text-[0.72rem] text-studio-ink/75 lg:hidden"
                aria-live="polite"
              >
                <span className="shrink-0 text-studio-vermilion" aria-hidden>
                  ›
                </span>
                <span className="truncate">{liveLine}</span>
                {motionOn ? (
                  <span className="animate-caret-blink inline-block h-[0.9em] w-[0.35em] shrink-0 bg-studio-vermilion" />
                ) : null}
              </p>
            </div>
          </div>

          {/* Desktop paper card */}
          <div
            className="pointer-events-none absolute right-[8%] top-[38%] hidden w-[min(18rem,30vw)] lg:block xl:right-[12%] xl:top-[36%]"
            aria-hidden="true"
          >
            <div className="min-h-[7.5rem] rotate-[-1.25deg] border border-[#d8d2c6] bg-[#FFFEFA]/94 px-4 py-3.5 font-mono text-[0.7rem] leading-relaxed text-studio-ink shadow-[0_14px_36px_rgba(0,0,0,0.1)]">
              <p className="mb-2 text-[0.62rem] font-semibold tracking-[0.18em] text-studio-ink/55">
                RESUME
              </p>
              {TYPING_LINES.map((line, i) => {
                if (i > lineIndex) return null;
                const shown =
                  i < lineIndex ? line : line.slice(0, charIndex);
                const showCaret = i === lineIndex && motionOn;
                return (
                  <p key={line} className="whitespace-pre-wrap">
                    {shown}
                    {showCaret ? (
                      <span className="animate-caret-blink ml-0.5 inline-block h-[0.95em] w-[0.45em] translate-y-[0.1em] bg-studio-vermilion align-middle" />
                    ) : null}
                  </p>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-8 sm:px-8 sm:py-10">
        <PrivacyNotice />
      </section>
    </div>
  );
}
