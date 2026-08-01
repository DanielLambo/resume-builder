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
      // Slightly slower cadence — reads more like a typewriter than a laptop.
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

  if (!active) {
    const last = lines[lines.length - 1] ?? "";
    return {
      lineIndex: Math.max(0, lines.length - 1),
      charIndex: last.length,
      done: true,
    };
  }

  return { lineIndex, charIndex, done };
}

export function HomeLanding() {
  const [motionOn, setMotionOn] = useState(true);
  const { lineIndex, charIndex } = useTypewriter(TYPING_LINES, motionOn);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setMotionOn(!mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  return (
    <div className="bg-studio-bg">
      <section className="relative isolate min-h-dvh overflow-hidden">
        {/* Dominant full-bleed hero plane */}
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
            className="object-cover object-[70%_35%] sm:object-[74%_32%]"
          />
        </div>

        {/* Readability wash — not a promo sticker */}
        <div
          className="absolute inset-0 bg-gradient-to-r from-[#FAF8F5] via-[#FAF8F5]/90 to-[#FAF8F5]/25 sm:via-[#FAF8F5]/80 sm:to-transparent"
          aria-hidden="true"
        />
        <div
          className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#FAF8F5]/70 to-transparent sm:hidden"
          aria-hidden="true"
        />

        <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-6xl flex-col justify-end px-5 pb-10 pt-16 sm:justify-center sm:px-8 sm:pb-16 sm:pt-20 lg:px-10">
          <div
            className={`max-w-xl ${motionOn ? "animate-hero-rise" : ""}`}
          >
            <h1 className="font-semibold tracking-tight text-studio-ink text-[clamp(2.6rem,8vw,4.5rem)] leading-[0.95]">
              Resumate
            </h1>
            <p className="mt-5 max-w-[18ch] text-[1.55rem] font-semibold leading-snug tracking-tight text-studio-ink sm:text-[2rem]">
              Get a sharper resume for every job you want.
            </p>
            <p className="mt-3 max-w-md text-base leading-relaxed text-studio-muted sm:text-[1.05rem]">
              Tailor honestly with AI, get hiring-manager feedback, and lock a
              clean one-page PDF—so you apply faster without inventing a single
              detail.
            </p>
            <div className="mt-7 flex w-full max-w-sm flex-col gap-2.5 sm:max-w-none sm:flex-row sm:gap-3">
              <Link
                href="/signup"
                className="inline-flex min-h-12 items-center justify-center bg-studio-vermilion px-5 py-3 text-sm font-semibold text-white transition hover:bg-studio-vermilion-hover"
              >
                Start free
              </Link>
              <Link
                href="/login"
                className="inline-flex min-h-12 items-center justify-center border border-studio-ink/15 bg-studio-paper/80 px-5 py-3 text-sm font-semibold text-studio-ink backdrop-blur-sm transition hover:bg-studio-paper"
              >
                Sign in
              </Link>
            </div>
          </div>

          {/* Paper feed typing — sits with the typewriter page, not a laptop screen */}
          <div
            className="pointer-events-none absolute right-[8%] top-[38%] hidden w-[min(18rem,30vw)] lg:block xl:right-[12%] xl:top-[36%]"
            aria-hidden="true"
          >
            <div className="min-h-[7.5rem] border border-[#d8d2c6] bg-[#FFFEFA]/92 px-4 py-3 font-mono text-[0.7rem] leading-relaxed text-studio-ink shadow-[0_10px_28px_rgba(0,0,0,0.08)]">
              <p className="mb-2 text-[0.62rem] font-semibold tracking-[0.18em] text-studio-ink/70">
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
                      <span className="animate-caret-blink ml-0.5 inline-block h-[0.95em] w-[0.45em] translate-y-[0.1em] bg-studio-ink align-middle" />
                    ) : null}
                  </p>
                );
              })}
            </div>
          </div>

          {/* Mobile: typewriter strip under CTAs */}
          <div
            className={`mt-8 max-w-md border-l-2 border-studio-ink/25 pl-3 font-mono text-[0.75rem] leading-relaxed text-studio-ink/80 lg:hidden ${motionOn ? "animate-hero-rise" : ""}`}
            aria-live="polite"
          >
            <p className="mb-1 text-[0.62rem] font-semibold tracking-[0.18em] text-studio-muted">
              RESUME
            </p>
            {TYPING_LINES.map((line, i) => {
              if (i > lineIndex) return null;
              const shown = i < lineIndex ? line : line.slice(0, charIndex);
              const showCaret = i === lineIndex && motionOn;
              return (
                <p key={line}>
                  {shown}
                  {showCaret ? (
                    <span className="animate-caret-blink ml-0.5 inline-block h-[0.9em] w-[0.4em] translate-y-[0.08em] bg-studio-ink align-middle" />
                  ) : null}
                </p>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 py-10 sm:px-8">
        <PrivacyNotice />
      </section>
    </div>
  );
}
