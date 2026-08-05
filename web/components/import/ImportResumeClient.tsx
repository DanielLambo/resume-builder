"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { importResumeAction } from "@/app/actions/import-resume";
import { IMPORT_ACCEPT } from "@/lib/import/constants";
import { assertImportSize, detectImportKind } from "@/lib/import/detect";
import {
  clearPendingImport,
  loadPendingImport,
  savePendingImport,
} from "@/lib/import/pending";

type Phase = "idle" | "reading" | "converting" | "done";

export function ImportResumeClient({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fileLabel, setFileLabel] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const running = useRef(false);

  const processFile = useCallback(
    async (file: File) => {
      if (running.current) return;
      setError(null);
      const kind = detectImportKind(file.name, file.type);
      if (!kind) {
        setError("Use a .tex / .latex file or a PDF.");
        return;
      }
      const sizeError = assertImportSize(kind, file.size);
      if (sizeError) {
        setError(sizeError);
        return;
      }

      setFileLabel(file.name);
      if (!signedIn) {
        try {
          await savePendingImport(file, kind);
        } catch {
          setError("Could not keep that file on this device. Try again after sign-in.");
          return;
        }
        toast.message("File ready — create an account to finish import.");
        router.push(`/signup?next=${encodeURIComponent("/import?autostart=1")}`);
        return;
      }

      running.current = true;
      setPhase(kind === "pdf" ? "reading" : "converting");
      const toastId = toast.loading(
        kind === "pdf" ? "Reading your PDF…" : "Importing LaTeX…",
      );
      try {
        const form = new FormData();
        form.append("file", file);
        if (kind === "pdf") setPhase("converting");
        const result = await importResumeAction(form);
        if (!result.ok) {
          toast.error(result.error, { id: toastId });
          setError(result.error);
          setPhase("idle");
          return;
        }
        await clearPendingImport().catch(() => undefined);
        toast.success("Imported — review it in the studio", {
          id: toastId,
          description: result.notes?.slice(0, 140),
        });
        setPhase("done");
        router.push(`/editor/${result.id}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Import failed.";
        toast.error(message, { id: toastId });
        setError(message);
        setPhase("idle");
      } finally {
        running.current = false;
      }
    },
    [router, signedIn],
  );

  useEffect(() => {
    if (!signedIn || params.get("autostart") !== "1") return;
    let cancelled = false;
    void (async () => {
      const pending = await loadPendingImport().catch(() => null);
      if (cancelled || !pending) return;
      const file = new File([pending.bytes], pending.filename, {
        type: pending.mime || (pending.kind === "pdf" ? "application/pdf" : "text/plain"),
      });
      await processFile(file);
    })();
    return () => {
      cancelled = true;
    };
  }, [params, processFile, signedIn]);

  function onFiles(list: FileList | null) {
    const file = list?.[0];
    if (file) void processFile(file);
  }

  const busy = phase === "reading" || phase === "converting";

  return (
    <div className="mx-auto w-full max-w-xl px-5 py-10 sm:px-8 sm:py-14">
      <p className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-studio-muted">
        Import
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-studio-ink">
        Bring your resume
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-studio-muted sm:text-base">
        Drop a .tex file from Overleaf, or a PDF you already use. We keep your
        facts and set it in our one-page template. Skim the studio preview before
        you apply — nothing is invented on purpose.
      </p>

      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          onFiles(event.dataTransfer.files);
        }}
        className={`mt-8 cursor-pointer rounded-2xl border border-dashed px-5 py-10 text-center transition ${
          dragOver
            ? "border-studio-vermilion bg-studio-paper"
            : "border-studio-border bg-studio-paper/80 hover:border-studio-ink/30"
        } ${busy ? "pointer-events-none opacity-70" : ""}`}
        aria-label="Upload a TeX or PDF resume"
      >
        <p className="text-sm font-semibold text-studio-ink">
          {busy
            ? phase === "reading"
              ? "Reading your PDF…"
              : "Setting type…"
            : "Drop .tex or PDF here"}
        </p>
        <p className="mt-2 font-mono text-[0.7rem] text-studio-muted">
          .tex ≤ 400 KB · PDF ≤ 4 MB
        </p>
        {fileLabel ? (
          <p className="mt-3 text-sm text-studio-ink">{fileLabel}</p>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={IMPORT_ACCEPT}
        className="sr-only"
        onChange={(event) => {
          onFiles(event.target.files);
          event.target.value = "";
        }}
      />

      {error ? (
        <p
          className="mt-4 border border-studio-vermilion/25 bg-red-50/80 px-3 py-2 text-sm text-studio-vermilion"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {!signedIn ? (
        <p className="mt-5 text-sm text-studio-muted">
          The file stays on this device until you{" "}
          <Link
            className="text-studio-ink underline underline-offset-2"
            href={`/signup?next=${encodeURIComponent("/import?autostart=1")}`}
          >
            create an account
          </Link>{" "}
          or{" "}
          <Link
            className="text-studio-ink underline underline-offset-2"
            href={`/login?next=${encodeURIComponent("/import?autostart=1")}`}
          >
            sign in
          </Link>
          . PDF conversion then uses your AI quota.
        </p>
      ) : (
        <p className="mt-5 text-sm text-studio-muted">
          PDF import sends extracted text to Groq and counts against today’s token
          quota. Self-contained .tex usually imports without AI.
        </p>
      )}

      <p className="mt-8 text-sm text-studio-muted">
        <Link href={signedIn ? "/dashboard" : "/"} className="underline underline-offset-2">
          Back
        </Link>
      </p>
    </div>
  );
}
