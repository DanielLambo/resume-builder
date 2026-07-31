import { type GroqCondenseResponse } from "./schema.js";
export type CondenseBulletsOptions = {
    apiKey: string;
    baseUrl?: string;
    model?: string;
    timeoutMs?: number;
    maxRetries?: number;
};
/**
 * Ask Groq to micro-condense the wordiest bullets by ~5–10% without changing facts.
 * Always uses JSON mode; validates with Zod before returning.
 */
export declare function condenseBulletsWithGroq(latex: string, options: CondenseBulletsOptions): Promise<GroqCondenseResponse>;
//# sourceMappingURL=condenseBullets.d.ts.map