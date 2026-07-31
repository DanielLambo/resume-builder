import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

const ALLOWED_NEXT = [
  /^\/$/,
  /^\/dashboard(?:\/|$)/,
  /^\/editor(?:\/|$)/,
  /^\/onboarding(?:\/|$)/,
] as const;

function safeNextPath(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/dashboard";
  }
  if (!ALLOWED_NEXT.some((re) => re.test(next))) {
    return "/dashboard";
  }
  return next;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const onboarded = user?.user_metadata?.onboarding_completed === true;
      if (!onboarded) {
        return NextResponse.redirect(`${origin}/onboarding`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback`);
}
