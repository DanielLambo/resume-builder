import { notFound } from "next/navigation";

import { HarnessClient } from "./HarnessClient";

/**
 * Offline mock desk — hard-blocked on Vercel / production.
 */
export default function DevHarnessPage() {
  if (
    process.env.VERCEL === "1" ||
    process.env.NODE_ENV === "production"
  ) {
    notFound();
  }

  if (process.env.NEXT_PUBLIC_USE_MOCK_AI !== "true") {
    return (
      <main className="grid min-h-dvh place-items-center p-8 text-studio-muted">
        Set NEXT_PUBLIC_USE_MOCK_AI=true to open the mock harness.
      </main>
    );
  }

  return <HarnessClient />;
}
