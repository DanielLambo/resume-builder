import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

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

  if (!url || !anonKey) {
    if (isProtected(pathname)) {
      const login = request.nextUrl.clone();
      login.pathname = "/login";
      login.searchParams.set("next", pathname);
      return NextResponse.redirect(login);
    }
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

  if (!user && isProtected(pathname)) {
    if (pathname.startsWith("/api/")) {
      const unauthorized = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      applyCookies(unauthorized, cookiesToApply);
      return unauthorized;
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    const redirect = NextResponse.redirect(loginUrl);
    applyCookies(redirect, cookiesToApply);
    return redirect;
  }

  if (user && isAuthRoute(pathname)) {
    // Unfinished profiles → setup; completed → library.
    // Grandfather (has resumes, no metadata flag) is resolved on /onboarding.
    const dest = request.nextUrl.clone();
    dest.pathname =
      user.user_metadata?.onboarding_completed === true
        ? "/dashboard"
        : "/onboarding";
    dest.search = "";
    const redirect = NextResponse.redirect(dest);
    applyCookies(redirect, cookiesToApply);
    return redirect;
  }

  return supabaseResponse;
}
