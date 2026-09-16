import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { safeNextPath } from "@/lib/auth-next";
import { getCanonicalSiteOrigin } from "@/lib/site-url";

function appOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  return request.nextUrl.origin;
}

function isLocalhostOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  } catch {
    return false;
  }
}

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

/**
 * Auth callback for email confirm + OAuth (PKCE `code`) and email OTP (`token_hash`).
 *
 * Next.js 15 does not reliably attach cookies().set() onto a later
 * NextResponse.redirect(). Session cookies must be written onto the redirect
 * response itself or the user lands without a session.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const origin = appOrigin(request);

  // Misconfigured Supabase Site URL often sends confirm links to localhost.
  // Bounce to NEXT_PUBLIC_SITE_URL when set so PKCE cookies match production.
  if (isLocalhostOrigin(origin)) {
    const canonical = getCanonicalSiteOrigin();
    if (canonical) {
      const target = new URL("/auth/callback", canonical);
      searchParams.forEach((value, key) => {
        target.searchParams.set(key, value);
      });
      return NextResponse.redirect(target);
    }
  }

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const otpType = searchParams.get("type") as EmailOtpType | null;
  const next = safeNextPath(searchParams.get("next"));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return NextResponse.redirect(`${origin}/login?error=auth_callback`);
  }

  if (!code && !(tokenHash && otpType)) {
    return NextResponse.redirect(`${origin}/login?error=auth_callback`);
  }

  const cookiesToApply: CookieToSet[] = [];

  const buildRedirect = (path: string) => {
    const response = NextResponse.redirect(`${origin}${path}`);
    cookiesToApply.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options);
    });
    return response;
  };

  try {
    const supabase = createServerClient<Database>(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToApply.length = 0;
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            cookiesToApply.push({ name, value, options });
          });
        },
      },
    });

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        console.error("[auth/callback] code exchange failed:", error.message);
        return NextResponse.redirect(`${origin}/login?error=auth_callback`);
      }
    } else if (tokenHash && otpType) {
      const { error } = await supabase.auth.verifyOtp({
        type: otpType,
        token_hash: tokenHash,
      });
      if (error) {
        console.error("[auth/callback] otp verify failed:", error.message);
        return NextResponse.redirect(`${origin}/login?error=auth_callback`);
      }
    }

    // Do not force the onboarding wizard here — that path is signup-only.
    return buildRedirect(next);
  } catch (err) {
    console.error("[auth/callback] unexpected:", err);
    return NextResponse.redirect(`${origin}/login?error=auth_callback`);
  }
}
