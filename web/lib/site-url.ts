/**
 * Canonical public origin for auth redirects (email confirm, OAuth).
 *
 * Supabase falls back to Dashboard → Auth → Site URL when redirectTo is
 * missing or not on the allow-list. That Site URL is often still localhost,
 * which is why confirm emails were sending people to :3000.
 */

/** Stable production host — never use a preview / localhost for mail redirects. */
export const PRODUCTION_SITE_ORIGIN = "https://web-gules-eta-91.vercel.app";

function parseOrigin(raw: string | undefined | null): string | null {
  if (!raw) return null;
  try {
    const parsed = new URL(raw.trim().replace(/\/$/, ""));
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function isLocalhostOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  } catch {
    return false;
  }
}

function isVercelPreviewOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname;
    // Deployment URLs like web-xxxxx-….vercel.app — keep the stable alias only.
    return (
      host.endsWith(".vercel.app") &&
      host !== "web-gules-eta-91.vercel.app" &&
      host !== "web-daniellambo-4291s-projects.vercel.app"
    );
  } catch {
    return false;
  }
}

/**
 * Origin used for emailRedirectTo / OAuth redirectTo.
 * Prefers NEXT_PUBLIC_SITE_URL, then production on Vercel, and refuses localhost
 * whenever we are not in a local browser session.
 */
export function getSiteOrigin(): string {
  const fromEnv = parseOrigin(process.env.NEXT_PUBLIC_SITE_URL);
  if (fromEnv && !isLocalhostOrigin(fromEnv)) return fromEnv;

  // Client-side local dev: allow localhost so local OAuth/email still works.
  if (typeof window !== "undefined") {
    const browser = window.location.origin;
    if (isLocalhostOrigin(browser)) return browser;
    if (!isVercelPreviewOrigin(browser)) return browser;
  }

  // Production / preview builds: always the stable alias.
  return PRODUCTION_SITE_ORIGIN;
}

export function authCallbackUrl(nextPath: string): string {
  const origin = getSiteOrigin();
  const next = nextPath.startsWith("/") ? nextPath : `/${nextPath}`;
  // Keep path-only next param; allow-list should include /auth/callback**
  return `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
}
