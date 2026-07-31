import { NextResponse } from "next/server";

import { DAILY_AI_TOKEN_LIMIT, getDailyAiUsage } from "@/lib/ratelimit";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const usage = await getDailyAiUsage(user.id);
    return NextResponse.json({
      used: usage.used,
      remaining: usage.remaining,
      limit: usage.limit ?? DAILY_AI_TOKEN_LIMIT,
      dayKey: usage.dayKey,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load usage";
    // Soft-fail for local/dev without Upstash so the UI still renders.
    return NextResponse.json(
      {
        used: 0,
        remaining: DAILY_AI_TOKEN_LIMIT,
        limit: DAILY_AI_TOKEN_LIMIT,
        warning: message,
      },
      { status: 200 },
    );
  }
}
