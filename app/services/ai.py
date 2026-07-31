import asyncio
import httpx
import os
import re

from app.services.latex import (
    apply_ai_body,
    apply_compact_sections,
    extract_custom_commands,
    latex_to_compact,
    split_document,
)

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "REDACTED_ROTATED_GROQ_KEY")
OPENAI_BASE_URL = os.environ.get("OPENAI_BASE_URL", "https://api.groq.com/openai")
MODEL = os.environ.get("RESUMATE_MODEL", "llama-3.3-70b-versatile")

# Compact docs at or below this size are sent as full text and the AI returns a
# full .tex file (spliced into the original preamble). Larger docs get section-only
# compact editing so responses stay inside Groq's output limit.
FULLDOC_COMPACT_THRESHOLD = 3200

MAX_RETRIES = 3
BACKOFF_SECONDS = [2, 4, 8]
RETRYABLE_STATUS = {408, 429, 500, 502, 503}


def _compact_format_doc() -> str:
    return r"""- `NAME Name` = header name
- `CONTACT label=value` = contact info
- `SECTION Name` = section header
- `@COMPANY` / `@LOC` / `@ROLE` / `@DATES` = job/education entry fields
- `@TITLE` / `@COMPANY` / `@DETAILS` = alternative entry fields (3-arg role style)
- `- Bullet text` = resume bullet
- `**Bold text**` = bold formatting"""


_PRINCIPLES = r"""## Your Core Principles

### STAR Method (Non-negotiable)
Every bullet: **Situation → Task → Action → Result**. The action verb starts the line. The result is quantified.
- WEAK: "Helped improve system performance"
- STRONG: "Redesigned query pipeline reducing p99 latency from 800ms to 120ms, serving 50K daily active users"

### Quantification
Inject numbers everywhere: revenue ($X M ARR), scale (X users, X records/day), performance (X% reduction, Xms latency), team (led X engineers).
Use realistic, conservative estimates. Never fabricate.

### ATS Optimization
Standard section headings: "Experience", "Education", "Skills", "Projects".
Mirror exact keywords from job description. No tables/columns/headers/footers.

### Writing Quality
- One line per bullet — if it wraps, it's too long
- No filler: "various", "multiple", "several", "assisted with", "responsible for"
- Consistent tense: present for current role, past for previous
- No pronouns — lead with action verbs
- Strong verbs: Architected, Engineered, Deployed, Optimized, Reduced, Automated, Scaled

## Edit Modes (detect from user request)
- **Polish** (default): tighten bullets, sharpen verbs, fix grammar
- **Rewrite**: full content rewrite, new language, restructured sections
- **ATS**: standard headings, keywords, parsable structure
- **Metrics**: add/improve quantified achievements
- **Tailor**: reorder bullets for target role, add relevant keywords
- **Roast**: 3-5 specific criticisms, then fix them"""


SYSTEM_PROMPT_FULLDOC = r"""You are a world-class resume strategist and LaTeX editor.

You edit resumes written in LaTeX. You return the ENTIRE modified .tex file — never fragments, never markdown, never explanations.

## How to read the input
The user sends a **compact representation** of the resume, not raw LaTeX. Here's the format:
{compact_format}

You must output the COMPLETE .tex file from \documentclass to \end{{document}}. Map the compact input back to proper LaTeX commands.

{principles}

## LaTeX Rules (Critical)
- NEVER modify the preamble (\documentclass, \usepackage, \newcommand). Your preamble is discarded automatically, so only the body matters — but the body MUST use the document's custom commands correctly.
- This document defines the custom commands:
  {commands}
- NEVER rename these commands or change their argument structure. Map @-fields back to the exact command they came from.
- Preserve all formatting (\textbf, \textit, \quad, \%, --, $...$) exactly.
- Output the COMPLETE .tex file.

## Response Format
- Output ONLY raw LaTeX — no ``` fences, no explanations
- First line: \documentclass or preamble
- Last line: \end{{document}}""".format(
    compact_format=_compact_format_doc(),
    principles=_PRINCIPLES,
    commands="{commands}",
)


SYSTEM_PROMPT_SECTIONS = r"""You are a world-class resume strategist editing a large LaTeX resume.

The user sends the FULL resume in **compact representation** for context, but you must return ONLY the sections you change.

## Compact format
{compact_format}
- Preserve LaTeX escapes exactly: \quad, --, \%, \textbf{{...}}

## Output rules
- Return ONLY the sections that changed, as compact blocks, each beginning with `SECTION <Exact section name>`.
- Do NOT output LaTeX. Do NOT include unchanged sections. Do NOT restate the user request.
- Keep @-field lines and `- ` bullets in the same order and format as the input.
- If the user asked for changes but you find nothing worth changing, return exactly: NO_CHANGES

{principles}""".format(
    compact_format=_compact_format_doc(),
    principles=_PRINCIPLES,
)


CONVERT_PROMPT = r"""You are a resume-to-LaTeX converter. You receive plain text extracted from a resume file (PDF, DOCX, or TXT) and convert it into a professionally formatted LaTeX resume.

You are given a LaTeX template to follow. Match its structure exactly — use its custom commands (\resumesection, \role, \resumeitemize, etc.), preserve its preamble, and produce a complete .tex file.

## Your job:
1. Parse the plain text and identify: name, contact info, summary, experience (company, role, dates, bullets), education, skills, projects
2. Fill in the LaTeX template with the extracted content
3. Clean up the writing — fix grammar, strengthen weak bullets, improve clarity
4. If the text is messy or unordered, infer the correct structure from context

## Rules:
- Return ONLY the raw .tex file — no markdown, no explanations
- First line must be \documentclass
- Last line must be \end{document}
- Preserve all template commands exactly
- Use \resumeitemize for bullet lists, \role for job entries, \resumesection for section headers
- If contact info has email/LinkedIn/GitHub, format them as \href links
- Keep bullet points concise and impact-driven
- If information is ambiguous, make your best guess — don't leave blanks"""


def _strip_markdown_fences(text: str) -> str:
    lines = text.split("\n")
    if lines and lines[0].strip().startswith("```"):
        lines = lines[1:]
    if lines and lines[-1].strip() == "```":
        lines = lines[:-1]
    return "\n".join(lines).strip()


def _fix_brace_balance(content: str, max_diff: int = 3) -> str:
    open_b = content.count("{")
    close_b = content.count("}")
    diff = open_b - close_b
    if diff == 0 or abs(diff) > max_diff:
        return content
    if diff > 0:
        return content.rstrip() + "\n" + "}" * diff
    return content[: len(content) - abs(diff)].rstrip()


async def _chat_completion(messages: list[dict], temperature: float, max_tokens: int) -> dict:
    """Call Groq with retries on transient failures (rate limits, 5xx)."""
    payload = {
        "model": MODEL,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    attempt = 0
    while True:
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                resp = await client.post(
                    f"{OPENAI_BASE_URL}/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {OPENAI_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
                if resp.status_code in RETRYABLE_STATUS and attempt < MAX_RETRIES:
                    await asyncio.sleep(BACKOFF_SECONDS[attempt])
                    attempt += 1
                    continue
                resp.raise_for_status()
                return resp.json()
        except httpx.TimeoutException:
            if attempt < MAX_RETRIES:
                await asyncio.sleep(BACKOFF_SECONDS[attempt])
                attempt += 1
                continue
            raise


def _api_error(exc: Exception) -> dict:
    if isinstance(exc, httpx.TimeoutException):
        return {"success": False, "error": "AI timed out. The response may be too long — try a shorter request."}
    if isinstance(exc, httpx.HTTPStatusError):
        status = exc.response.status_code
        if status == 413:
            return {"success": False, "error": "Request too large for the AI. Shorten the resume or edit a section at a time."}
        if status == 429:
            return {"success": False, "error": "AI rate limit hit (free tier is 12K tokens/min). Wait a moment and try again."}
        return {"success": False, "error": f"Groq API error ({status}). Check your API key."}
    return {"success": False, "error": f"Request failed: {str(exc)}"}


def _finish_error() -> dict:
    return {
        "success": False,
        "error": "AI hit its output limit and the edit was truncated. Break your request into smaller pieces and try again.",
    }


def _reply_for_prompt(prompt: str) -> str:
    p = prompt.lower()
    if "polish" in p:
        return "Polished your resume — tightened verbs, removed filler, sharpened every bullet."
    if "ats" in p:
        return "ATS-optimized — standardized headings, injected relevant keywords, ensured parsable structure."
    if "metric" in p or "quantif" in p or "number" in p:
        return "Added quantified metrics throughout — numbers make the difference."
    if "rewrite" in p or "overhaul" in p or "redo" in p:
        return "Full rewrite complete — same achievements, completely elevated language."
    if "summary" in p:
        return "Rewrote your summary — now a tight elevator pitch with clear value proposition."
    if "tailor" in p or "target" in p:
        return "Tailored your resume for the target role — reordered bullets, added relevant keywords."
    if "roast" in p or "critique" in p or "feedback" in p:
        return "Roasted and fixed — addressed the top issues I found."
    return "Done — your resume has been updated."


async def convert_resume(plain_text: str, template_latex: str) -> dict:
    if not OPENAI_API_KEY:
        return {"success": False, "error": "AI not configured."}

    truncated_tpl = template_latex if len(template_latex) < 8000 else template_latex[:8000] + "\n%...[truncated]"
    truncated_txt = plain_text if len(plain_text) < 6000 else plain_text[:6000] + "\n...[truncated]"

    messages = [
        {"role": "system", "content": CONVERT_PROMPT},
        {"role": "user", "content": f"Here is the LaTeX template to follow:\n\n{truncated_tpl}\n\n---\n\nHere is the plain text extracted from the resume:\n\n{truncated_txt}"},
    ]

    try:
        data = await _chat_completion(messages, 0.3, 8192)
        content = _strip_markdown_fences(data["choices"][0]["message"]["content"])
        finish = data["choices"][0].get("finish_reason")

        if finish == "length":
            return _finish_error()
        if "\\documentclass" not in content:
            return {"success": False, "error": "AI returned incomplete output. Please try again."}

        return {"success": True, "latex_content": content}

    except Exception as e:
        return _api_error(e)


async def ai_assist(latex_content: str, prompt: str, history: list | None = None) -> dict:
    if not OPENAI_API_KEY:
        return {
            "success": False,
            "error": "AI not configured. Set OPENAI_API_KEY environment variable.",
        }

    preamble, _ = split_document(latex_content)
    custom_cmds = extract_custom_commands(preamble) if preamble else []
    commands_text = ", ".join(f"\\{c}" for c in custom_cmds) if custom_cmds else "(none detected — map @-fields back to the commands used in the original body)"

    compact = latex_to_compact(latex_content)
    use_full_doc = len(compact) <= FULLDOC_COMPACT_THRESHOLD
    system_prompt = SYSTEM_PROMPT_FULLDOC if use_full_doc else SYSTEM_PROMPT_SECTIONS
    system_prompt = system_prompt.replace("{commands}", commands_text)

    messages = [{"role": "system", "content": system_prompt}]

    if history:
        for msg in history[-8:]:
            content = msg.get("content", "")
            if len(content) > 500:
                content = content[:500] + "...[trimmed]"
            messages.append({"role": msg.get("role", "user"), "content": content})

    if use_full_doc:
        user_content = f"Current resume (compact format):\n\n{compact}\n\n---\n\nUser request: {prompt}"
    else:
        user_content = (
            "You receive the FULL resume below for context, but you must return ONLY the compact "
            "blocks of the sections you change, each starting with SECTION <Name>.\n\n"
            f"Current resume (compact format):\n\n{compact}\n\n"
            f"---\n\nUser request: {prompt}"
        )

    messages.append({"role": "user", "content": user_content})

    try:
        data = await _chat_completion(messages, 0.4, 8192)
        choice = data["choices"][0]
        finish = choice.get("finish_reason")
        content = _strip_markdown_fences(choice["message"]["content"])

        if finish == "length":
            return _finish_error()

        if use_full_doc:
            if (
                "\\documentclass" not in content
                or "\\begin{document}" not in content
                or "\\end{document}" not in content
                or content.index("\\end{document}") < content.index("\\begin{document}")
            ):
                return {"success": False, "error": "AI returned incomplete output. Please try again."}

            content = _fix_brace_balance(content)
            final_latex = apply_ai_body(latex_content, content)
        else:
            if content.strip().upper() == "NO_CHANGES":
                return {
                    "success": True,
                    "latex_content": latex_content,
                    "user_message": prompt,
                    "ai_reply": "I reviewed your resume — no changes were needed.",
                }
            has_section = re.search(r"^SECTION\s+.+$", content, re.M) or "\\resumesection" in content
            if not has_section:
                return {"success": False, "error": "AI returned no edited sections. Try a more specific request."}
            final_latex = apply_compact_sections(latex_content, content)
            if final_latex == latex_content:
                return {"success": False, "error": "AI returned no usable edits. Try a more specific request."}

        return {
            "success": True,
            "latex_content": final_latex,
            "user_message": prompt,
            "ai_reply": _reply_for_prompt(prompt),
        }

    except Exception as e:
        return _api_error(e)
