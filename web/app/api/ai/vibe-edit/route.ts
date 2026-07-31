import { type NextRequest, NextResponse } from "next/server";

import { vibeEditAction } from "@/app/actions/vibe-edit";

/**
 * HTTP wrapper so clients that expect a real 429 status code can POST here.
 * Body: { resumeId: string, prompt: string }
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = await vibeEditAction(body);
  if (!result.ok) {
    return NextResponse.json(result, { status: result.status });
  }
  return NextResponse.json(result, { status: 200 });
}
