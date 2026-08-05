"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { PrivacyNotice } from "@/components/PrivacyNotice";

const DEMO_BULLETS = [
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
      }, 2800);
      return () => window.clearTimeout(restart);
    }

    const current = lines[lineIndex] ?? "";
    if (charIndex < current.length) {
      const t = window.setTimeout(
        () => setCharIndex((c) => c + 1),
        38 + (charIndex % 4) * 8,
      );
      return () => window.clearTimeout(t);
    }

    if (lineIndex < lines.length - 1) {
      const t = window.setTimeout(() => {
        setLineIndex((i) => i + 1);
        setCharIndex(0);
      }, 480);
      return () => window.clearTimeout(t);
    }

    const t = window.setTimeout(() => setDone(true), 1100);
    return () => window.clearTimeout(t);
  }, [active, charIndex, done, lineIndex, lines]);

  return { lineIndex, charIndex };
}

function ProductStage({ motionOn }: { motionOn: boolean }) {
  const { lineIndex, charIndex } = useTypewriter(DEMO_BULLETS, motionOn);

  return (
    <div
      className={[
        "relative mx-auto w-full max-w-[34rem] lg:max-w-none",
        motionOn ? "animate-hero-stage" : "",
      ].join(" ")}
      data-testid="home-product-stage"
    >
      <div
        className="overflow-hidden rounded-xl border border-ide-border/80 bg-ide-gutter shadow-[0_28px_60px_-20px_rgba(26,23,22,0.55)]"
        aria-hidden="true"
      >
        {/* Title bar */}
        <div className="flex items-center gap-2 border-b border-ide-border/70 bg-ide-panel px-3 py-2">
          <span className="text-[0.7rem] font-semibold tracking-tight text-ide-ink">
            Resumate
          </span>
          <span className="truncate text-[0.65rem] text-ide-faint">
            Alex Rivera · Backend SWE
          </span>
          <span className="ml-auto inline-flex items-center gap-1 rounded-sm border border-ide-accent/40 bg-ide-accent/15 px-1.5 py-0.5 font-mono text-[0.58rem] font-medium text-ide-ink">
            <span className="h-1.5 w-1.5 rounded-full bg-ide-accent" />
            1 page
          </span>
        </div>

        {/* Split: source | preview */}
        <div className="grid min-h-[15.5rem] grid-cols-[0.92fr_1.08fr] sm:min-h-[17.5rem]">
          <div className="border-r border-ide-border/60 bg-ide-bg px-2.5 py-2.5 font-mono text-[0.58rem] leading-[1.55] text-ide-muted sm:text-[0.62rem]">
            <p className="text-ide-faint">{"\\section*{Experience}"}</p>
            <p className="text-ide-ink/90">{"\\entry{Stripe Intern}{2025}{Backend}"}</p>
            <p className="text-ide-faint">{"\\begin{itemize}"}</p>
            {DEMO_BULLETS.map((line, i) => {
              if (i > lineIndex) return null;
              const shown = i < lineIndex ? line : line.slice(0, charIndex);
              const showCaret = i === lineIndex && motionOn;
              return (
                <p key={line} className="pl-2 text-ide-ink">
                  {"\\item "}
                  {shown}
                  {showCaret ? (
                    <span className="animate-caret-blink ml-px inline-block h-[0.85em] w-[0.4em] translate-y-[0.08em] bg-ide-accent align-middle" />
                  ) : null}
                </p>
              );
            })}
            <p className="text-ide-faint">{"\\end{itemize}"}</p>
          </div>

          <div className="relative bg-ide-gutter px-2.5 py-2.5 sm:px-3 sm:py-3">
            <div className="h-full rounded-sm bg-[#FFFEFA] px-3 py-2.5 text-[0.62rem] leading-snug text-studio-ink shadow-[0_6px_18px_rgba(0,0,0,0.18)] sm:text-[0.68rem]">
              <p className="text-center text-[0.85rem] font-semibold tracking-tight sm:text-[0.95rem]">
                Alex Rivera
              </p>
              <p className="mt-0.5 text-center text-[0.55rem] text-studio-muted sm:text-[0.6rem]">
                Backend · alex@email.com
              </p>
              <p className="mt-2.5 border-b border-studio-border pb-0.5 text-[0.58rem] font-semibold uppercase tracking-[0.14em] text-studio-ink/70">
                Experience
              </p>
              <p className="mt-1.5 text-[0.62rem] font-semibold">
                Stripe Intern{" "}
                <span className="float-right font-normal text-studio-muted">
                  2025
                </span>
              </p>
              <p className="text-[0.58rem] italic text-studio-muted">Backend</p>
              <ul className="mt-1 space-y-1 pl-3 text-[0.58rem] text-studio-ink/85 sm:text-[0.62rem]">
                {DEMO_BULLETS.map((line, i) => {
                  if (i > lineIndex) return null;
                  const shown = i < lineIndex ? line : line.slice(0, charIndex);
                  if (!shown) return null;
                  return (
                    <li key={line} className="list-disc">
                      {shown}
                      {i === lineIndex && motionOn ? (
                        <span className="animate-caret-blink ml-px inline-block h-[0.85em] w-[0.35em] translate-y-[0.08em] bg-studio-vermilion align-middle" />
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>

        {/* AI dock strip */}
        <div className="flex items-center gap-2 border-t border-ide-border/70 bg-ide-panel px-3 py-2">
          <span className="truncate rounded-md border border-ide-border bg-ide-raised px-2.5 py-1.5 text-[0.65rem] text-ide-faint">
            Tailor this bullet for a Stripe backend intern role…
          </span>
          <span className="shrink-0 rounded-md bg-ide-accent px-2.5 py-1.5 text-[0.65rem] font-semibold text-white">
            Apply
          </span>
        </div>
      </div>
    </div>
  );
}

export function HomeLanding() {
  const [motionOn, setMotionOn] = useState(true);

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
        {/* Typist photo — right-weighted atmosphere; copy sits on a solid scrim */}
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
            className="object-cover object-[68%_28%] sm:object-[74%_32%] lg:object-[78%_30%]"
          />
        </div>
        <div
          className="absolute inset-0 bg-gradient-to-b from-[#F4F3F1] via-[#F4F3F1]/94 to-[#F4F3F1]/72 sm:bg-gradient-to-r sm:from-[#F4F3F1] sm:via-[#F4F3F1]/92 sm:to-[#F4F3F1]/25 lg:via-[#F4F3F1]/88 lg:to-transparent"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 hidden w-[55%] bg-gradient-to-l from-black/20 via-transparent to-transparent lg:block"
          aria-hidden="true"
        />

        <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 pb-[max(1.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-8 sm:pb-16 lg:px-10">
          <header className="flex shrink-0 items-center justify-between gap-3">
            <Link
              href="/"
              className="text-[1.05rem] font-semibold tracking-tight text-studio-ink transition hover:text-studio-ink/80 sm:text-[1.15rem]"
            >
              Resumate
            </Link>
            <Link
              href="/login"
              className="min-h-10 rounded-lg px-3 py-2 text-sm font-medium text-studio-muted transition hover:bg-black/[0.04] hover:text-studio-ink"
            >
              Sign in
            </Link>
          </header>

          <div
            className={[
              "grid min-h-0 flex-1 grid-cols-1 items-center gap-10 pt-10 sm:gap-12 sm:pt-12 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-14 lg:pt-4",
              motionOn ? "animate-hero-rise" : "",
            ].join(" ")}
          >
            <div className="max-w-xl">
              <h1 className="max-w-[16ch] text-[clamp(2.15rem,7.5vw,3.55rem)] font-semibold leading-[1.02] tracking-tight text-studio-ink">
                A sharper resume for every job you want.
              </h1>
              <p className="mt-4 max-w-md text-[1rem] leading-relaxed text-studio-muted sm:text-[1.08rem]">
                Honest AI edits, hiring-manager feedback, and a locked one-page
                PDF. Apply faster without inventing anything.
              </p>
              <div className="mt-7 flex w-full flex-col gap-2.5 sm:mt-8 sm:flex-row sm:gap-3">
                <Link
                  href="/signup"
                  className="inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-studio-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-studio-ink/90 sm:w-auto"
                >
                  Start free
                </Link>
                <Link
                  href="/import"
                  className="inline-flex min-h-12 w-full items-center justify-center rounded-lg border border-studio-ink/15 bg-white/90 px-5 py-3 text-sm font-semibold text-studio-ink transition hover:border-studio-ink/25 hover:bg-white sm:w-auto"
                >
                  Import resume
                </Link>
              </div>
              <p className="mt-5 text-[0.8rem] text-studio-muted/90">
                LaTeX source · live PDF · AI that stays honest
              </p>
            </div>

            <ProductStage motionOn={motionOn} />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-8 sm:px-8 sm:py-10">
        <PrivacyNotice />
      </section>
    </div>
  );
}
