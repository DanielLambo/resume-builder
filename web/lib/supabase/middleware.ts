import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import {
  isSetupDestination,
  onboardingPathWithNext,
  trySafeNextPath,
} from "@/lib/auth-next";
import { metadataNeedsOnboarding } from "@/lib/onboarding/needs-onboarding";
import type { Database } from "@/lib/database.types";

const PROTECTED_PREFIXES = ["/dashboard", "/editor", "/api/ai", "/onboarding"] as const;
const AUTH_ROUTES = ["/login", "/signup"] as const;

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

function applyCookies(response: NextResponse, cookies: CookieToSet[]) {
  cookies.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });
}

export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const { pathname } = request.nextUrl;

  const PUBLIC_STATIC = new Set(["/", "/login", "/signup"]);
  const hasAuthCookie = request.cookies
    .getAll()
    .some((c) => c.name.includes("auth-token") || c.name.includes("sb-"));

  // Anonymous traffic on marketing/auth pages: skip Supabase round-trip so CDN can cache.
  if (!url || !anonKey) {
    if (isProtected(pathname)) {
      const login = request.nextUrl.clone();
      login.pathname = "/login";
      login.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
      return NextResponse.redirect(login);
    }
    return NextResponse.next({ request });
  }

  if (PUBLIC_STATIC.has(pathname) && !hasAuthCookie) {
    return NextResponse.next({ request });
  }

  // Track cookies with full options — NextResponse.redirect copies must keep them.
  const cookiesToApply: CookieToSet[] = [];
  let supabaseResponse = NextResponse.next({ request });

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
        supabaseResponse = NextResponse.next({ request });
        applyCookies(supabaseResponse, cookiesToApply);
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Signed-in users hitting the marketing home go straight to the product.
  if (user && pathname === "/") {
    const dest = new URL("/dashboard", request.nextUrl.origin);
    const redirect = NextResponse.redirect(dest);
    applyCookies(redirect, cookiesToApply);
    return redirect;
  }

  if (!user && isProtected(pathname)) {
    if (pathname.startsWith("/api/")) {
      const unauthorized = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      applyCookies(unauthorized, cookiesToApply);
      return unauthorized;
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set(
      "next",
      `${pathname}${request.nextUrl.search}`,
    );
    const redirect = NextResponse.redirect(loginUrl);
    applyCookies(redirect, cookiesToApply);
    return redirect;
  }

  if (user && isAuthRoute(pathname)) {
    // Signup-flagged unfinished profiles → setup. Everyone else → product.
    const requested = trySafeNextPath(request.nextUrl.searchParams.get("next"));
    const target = metadataNeedsOnboarding(user)
      ? onboardingPathWithNext(requested)
      : requested && !isSetupDestination(requested)
        ? requested
        : "/dashboard";
    const dest = new URL(target, request.nextUrl.origin);
    const redirect = NextResponse.redirect(dest);
    applyCookies(redirect, cookiesToApply);
    return redirect;
  }

  return supabaseResponse;
}
