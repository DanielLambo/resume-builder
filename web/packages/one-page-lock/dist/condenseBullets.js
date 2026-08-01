import { GroqCondenseResponseSchema, } from "./schema.js";
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function extractMessageContent(payload) {
    if (typeof payload !== "object" || payload === null) {
        throw new Error("Groq response was not an object");
    }
    const choices = payload.choices;
    if (!Array.isArray(choices) || choices.length === 0) {
        throw new Error("Groq response missing choices");
    }
    const first = choices[0];
    if (typeof first !== "object" || first === null) {
        throw new Error("Groq choice was invalid");
    }
    const message = first.message;
    if (typeof message !== "object" || message === null) {
        throw new Error("Groq message was invalid");
    }
    const content = message.content;
    if (typeof content !== "string" || !content.trim()) {
        throw new Error("Groq message content was empty");
    }
    return content;
}
function parseJsonObject(content) {
    const trimmed = content.trim();
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
    const body = fenced ? fenced[1].trim() : trimmed;
    return JSON.parse(body);
}
/**
 * Ask Groq to micro-condense the wordiest bullets by ~5–10% without changing facts.
 * Always uses JSON mode; validates with Zod before returning.
 */
export async function condenseBulletsWithGroq(latex, options) {
    const baseUrl = (options.baseUrl ?? "https://api.groq.com/openai").replace(/\/$/, "");
    const model = options.model ?? "llama-3.3-70b-versatile";
    const timeoutMs = options.timeoutMs ?? 20_000;
    const maxRetries = options.maxRetries ?? 3;
    const system = [
        "You are Typesetter's one-page density editor for LaTeX resumes.",
        'Return JSON only: {"latex":"<full LaTeX document>","notes":"<short note>"}',
        "Micro-condense the wordiest bullets by about 5-10%.",
        "Do not change employers, dates, titles, tools, or factual claims.",
        "Do not invent metrics. Preserve preamble, packages, and custom macros.",
        "Keep valid compilable LaTeX with \\documentclass and \\end{document}.",
        "Ban fluff: leveraged, spearheaded, passionate, results-driven, cutting-edge.",
    ].join(" ");
    const user = [
        "Tighten this resume so it is more likely to fit on one page.",
        "Only shorten verbose bullets; leave structure and preamble intact.",
        "Prefer deleting filler adverbs/clauses before cutting metrics or tools.",
        "",
        latex,
    ].join("\n");
    let attempt = 0;
    while (true) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(`${baseUrl}/v1/chat/completions`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${options.apiKey}`,
                    "Content-Type": "application/json",
                },
                signal: controller.signal,
                body: JSON.stringify({
                    model,
                    temperature: 0.2,
                    max_tokens: 8000,
                    response_format: { type: "json_object" },
                    messages: [
                        { role: "system", content: system },
                        { role: "user", content: user },
                    ],
                }),
            });
            if (response.status === 429 || response.status >= 500) {
                if (attempt >= maxRetries) {
                    throw new Error(`Groq rate/limit error HTTP ${response.status}`);
                }
                const backoff = Math.min(4000, 300 * 2 ** attempt);
                await sleep(backoff);
                attempt += 1;
                continue;
            }
            if (!response.ok) {
                throw new Error(`Groq API error HTTP ${response.status}`);
            }
            const payload = await response.json();
            const content = extractMessageContent(payload);
            const parsedUnknown = parseJsonObject(content);
            return GroqCondenseResponseSchema.parse(parsedUnknown);
        }
        catch (err) {
            const aborted = err instanceof Error &&
                (err.name === "AbortError" || err.message.includes("abort"));
            if ((aborted || err instanceof TypeError) && attempt < maxRetries) {
                const backoff = Math.min(4000, 300 * 2 ** attempt);
                await sleep(backoff);
                attempt += 1;
                continue;
            }
            throw err;
        }
        finally {
            clearTimeout(timer);
        }
    }
}
//# sourceMappingURL=condenseBullets.js.map