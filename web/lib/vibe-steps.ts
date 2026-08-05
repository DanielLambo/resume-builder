/** User-visible AI progress copy — keep in sync with e2e/vibe-editor.spec.ts */
export const VIBE_CLIENT_STEPS = [
  "[1/4] Reading your request…",
  "[2/4] Checking today’s AI quota…",
  "[3/4] Updating the one-page preview…",
] as const;

export const VIBE_STEP_READ = "Reading your request…";
export const VIBE_STEP_QUOTA = "Checking today’s AI quota…";
export const VIBE_STEP_COMPILE = "Updating the one-page preview…";
