import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-studio-bg px-5 py-16">
      <div className="w-full max-w-md text-center">
        <p className="font-semibold tracking-tight text-studio-ink text-3xl">
          Resumate
        </p>
        <h1 className="mt-4 text-xl font-semibold text-studio-ink">
          Page not found
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-studio-muted">
          That link doesn&apos;t match anything in your workspace.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link
            href="/dashboard"
            className="inline-flex min-h-11 items-center justify-center bg-studio-vermilion px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-studio-vermilion-hover"
          >
            Library
          </Link>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center justify-center border border-studio-border bg-studio-paper px-4 py-2.5 text-sm font-semibold text-studio-ink transition hover:bg-studio-canvas"
          >
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
