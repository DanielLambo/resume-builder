import { NextResponse } from "next/server";

import { isProductionRuntime } from "@/lib/prod-runtime";
import { DAILY_AI_TOKEN_LIMIT, getDailyAiUsage, getRedis } from "@/lib/ratelimit";
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

    if (isProductionRuntime() && !getRedis()) {
      return NextResponse.json(
        {
          used: 0,
          remaining: 0,
          limit: DAILY_AI_TOKEN_LIMIT,
          unavailable: true,
        },
        { status: 503 },
      );
    }

    const usage = await getDailyAiUsage(user.id);
    return NextResponse.json({
      used: usage.used,
      remaining: usage.remaining,
      limit: usage.limit ?? DAILY_AI_TOKEN_LIMIT,
      dayKey: usage.dayKey,
    });
  } catch {
    if (isProductionRuntime()) {
      return NextResponse.json(
        {
          used: 0,
          remaining: 0,
          limit: DAILY_AI_TOKEN_LIMIT,
          unavailable: true,
        },
        { status: 503 },
      );
    }
    // Soft-fail for local/dev without Upstash so the UI still renders.
    return NextResponse.json(
      {
        used: 0,
        remaining: DAILY_AI_TOKEN_LIMIT,
        limit: DAILY_AI_TOKEN_LIMIT,
        unavailable: true,
      },
      { status: 200 },
    );
  }
}
