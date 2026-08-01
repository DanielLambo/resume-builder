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
      const t = window.setTimeout(() => setCharIndex((c) => c + 1), 28 + (charIndex % 5) * 8);
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
            className="object-cover object-[68%_30%] sm:object-[72%_28%]"
          />
        </div>

        {/* Readability wash — not a promo sticker */}
        <div
          className="absolute inset-0 bg-gradient-to-r from-[#FAF8F5] via-[#FAF8F5]/88 to-[#FAF8F5]/20 sm:via-[#FAF8F5]/78 sm:to-transparent"
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
            <p className="font-semibold tracking-tight text-studio-ink text-[clamp(2.6rem,8vw,4.5rem)] leading-[0.95]">
              Resumate
            </p>
            <h1 className="mt-5 max-w-[18ch] text-[1.55rem] font-semibold leading-snug tracking-tight text-studio-ink sm:text-[2rem]">
              Get a sharper resume for every job you want.
            </h1>
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

          {/* Screen typing aligned to the laptop — she appears to write the draft */}
          <div
            className="pointer-events-none absolute right-[7%] top-[44%] hidden w-[min(20rem,32vw)] lg:block xl:right-[11%] xl:top-[42%]"
            aria-hidden="true"
          >
            <div className="min-h-[7rem] bg-[#0f0f0f]/78 px-3.5 py-3 font-mono text-[0.68rem] leading-relaxed text-[#F7F4EE] backdrop-blur-[2px]">
              {TYPING_LINES.map((line, i) => {
                if (i > lineIndex) return null;
                const shown =
                  i < lineIndex ? line : line.slice(0, charIndex);
                const showCaret = i === lineIndex && motionOn;
                return (
                  <p key={line} className="whitespace-pre-wrap">
                    {shown}
                    {showCaret ? (
                      <span className="animate-caret-blink ml-0.5 inline-block h-[0.95em] w-[0.4em] translate-y-[0.1em] bg-studio-vermilion align-middle" />
                    ) : null}
                  </p>
                );
              })}
            </div>
          </div>

          {/* Mobile: typing strip under CTAs — still part of the hero composition */}
          <div
            className={`mt-8 max-w-md border-l-2 border-studio-vermilion/80 pl-3 font-mono text-[0.75rem] leading-relaxed text-studio-ink/80 lg:hidden ${motionOn ? "animate-hero-rise" : ""}`}
            aria-live="polite"
          >
            {TYPING_LINES.map((line, i) => {
              if (i > lineIndex) return null;
              const shown = i < lineIndex ? line : line.slice(0, charIndex);
              const showCaret = i === lineIndex && motionOn;
              return (
                <p key={line}>
                  {shown}
                  {showCaret ? (
                    <span className="animate-caret-blink ml-0.5 inline-block h-[0.9em] w-[0.4em] translate-y-[0.08em] bg-studio-vermilion align-middle" />
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
