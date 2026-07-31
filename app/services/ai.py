import asyncio
import httpx
import os
import re
from pathlib import Path

from dotenv import load_dotenv

from app.services.latex import (
    apply_ai_body,
    apply_compact_sections,
    extract_custom_commands,
    latex_to_compact,
    split_document,
)

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

OPENAI_BASE_URL = os.environ.get("OPENAI_BASE_URL", "https://api.groq.com/openai")
MODEL = os.environ.get("RESUMATE_MODEL", "llama-3.3-70b-versatile")

# Compact docs at or below this size are sent as full text and the AI returns a
# full .tex file (spliced into the original preamble). Larger docs get section-only
# compact editing so responses stay inside Groq's output limit.
FULLDOC_COMPACT_THRESHOLD = 3200

MAX_RETRIES = 3
BACKOFF_SECONDS = [2, 4, 8]
RETRYABLE_STATUS = {408, 429, 500, 502, 503}


def _api_key() -> str:
    return os.environ.get("OPENAI_API_KEY", "").strip()


def _compact_format_doc() -> str:
    return r"""- `NAME Name` = header name
- `CONTACT label=value` = contact info
- `SECTION Name` = section header
- `@COMPANY` / `@LOC` / `@ROLE` / `@DATES` = job/education entry fields
- `@TITLE` / `@COMPANY` / `@DETAILS` = alternative entry fields (3-arg role style)
- `- Bullet text` = resume bullet
- `**Bold text**` = bold formatting"""


_PRINCIPLES = r"""## Goal
Write like a sharp human engineer edited this by hand — not like ChatGPT polished a LinkedIn profile.
A recruiter scanning for 6 seconds should never think "AI wrote this."

## Truth first (non-negotiable)
- Keep the candidate's real scope, tools, and seniority. Do not inflate titles, invent products, or invent employers.
- Prefer the facts already on the page. Rewrite for clarity; do not invent a second career.
- Never fabricate metrics. If a number is missing:
  - keep the bullet qualitative, OR
  - use an obvious placeholder like `[X%]` / `[N users]` the candidate can fill in
  - never output fake-precise figures (e.g. 47%, 3.2×, $2.4M) unless they were already in the source
- Do not upgrade "built an internal tool" into "architected a platform serving millions."

## What recruiters flag as AI (avoid all of these)
- Buzzverb bingo: Leveraged, Utilized, Spearheaded, Orchestrated, Revolutionized, Transformed, Elevated, Streamlined (unless truly accurate and already implied)
- Template bullets: "Did X using Y resulting in Z% improvement" on every line
- Buzzword fog: robust, scalable, cutting-edge, seamless, innovative, synergistic, end-to-end, cross-functional stakeholders, passionate, results-driven, proven track record, dynamic, comprehensive
- Em dash abuse and "Not only… but also…" constructions
- Identical rhythm across every bullet (same length, same clause pattern)
- Keyword stuffing that reads unnatural
- Summary lines that sound like a LinkedIn about-section ("Passionate software engineer with a proven track record…")

## How strong human bullets actually sound
- Lead with a concrete verb + specific object (system, API, table, pipeline, test suite)
- Name real tools when known (Postgres, Redis, FastAPI, Docker) instead of "cloud technologies"
- One claim per bullet. Cut clauses that only decorate.
- Impact is good when honest — "cut p99 from ~800ms to ~120ms" beats "significantly improved performance"
- Variation is good: some bullets are impact-heavy; some are ownership/scope; not every line needs a percentage
- Present tense for current role, past for previous. No "I/we".

Examples:
- BAD: "Leveraged cutting-edge cloud technologies to orchestrate robust microservices, resulting in a 47% improvement in scalability"
- GOOD: "Rewrote the checkout query path in Postgres; p99 dropped from ~800ms to ~120ms under peak load"
- BAD: "Passionate full-stack engineer with a proven track record delivering innovative solutions"
- GOOD: "Backend-focused engineer: APIs, data stores, and reliability for product teams"

## Edit discipline
- Change only what the request needs. Preserve structure, section order, and entry order unless asked to reorder.
- Prefer surgical edits over full rewrites. Match the candidate's existing tone when it's already clean.
- Keep bullets to roughly one printed line. Delete filler ("various", "multiple", "assisted with", "responsible for", "helped with").
- For summaries: 2–3 factual lines max. Who they are, what they build, for whom — no soft adjectives.
- For ATS/tailor requests: mirror job-post language only where it fits real experience. Never force keywords that contradict the resume.

## Edit modes (infer from the user request)
- Polish (default): tighten wording, fix grammar, kill filler — keep meaning
- Rewrite: new phrasing, same facts and scope
- ATS: standard headings, clearer keywords, parsable structure
- Metrics: improve quantification only with source numbers or `[placeholders]`
- Tailor: reorder bullets / emphasize relevant work for a target role
- Roast: brief critique of real weaknesses, then fix only the top issues"""


SYSTEM_PROMPT_FULLDOC = r"""You are a technical resume editor for engineers. You edit LaTeX resumes.

Return the COMPLETE modified .tex file only — no markdown fences, no commentary.

## Input format
The user sends a compact representation of the resume:
{compact_format}

Map that compact input back to the document's real LaTeX commands.

{principles}

## LaTeX rules
- Do not change the preamble (\documentclass, \usepackage, \newcommand). The preamble you output is discarded; only the body is kept — but the body must use the document's custom commands correctly.
- Custom commands in this document: {commands}
- Do not rename commands or change their argument shapes. Map @-fields back to the original command forms.
- Preserve LaTeX escapes and formatting (\textbf, \textit, \quad, \%, --, $...$).
- Output raw LaTeX only. First line may be preamble/\documentclass. Last line: \end{{document}}""".format(
    compact_format=_compact_format_doc(),
    principles=_PRINCIPLES,
    commands="{commands}",
)


SYSTEM_PROMPT_SECTIONS = r"""You are a technical resume editor for engineers. You edit large LaTeX resumes via a compact text format.

The user sends the FULL resume in compact form for context. Return ONLY the sections you change.

## Compact format
{compact_format}
- Preserve LaTeX escapes exactly: \quad, --, \%, \textbf{{...}}

## Output rules
- Return ONLY changed sections as compact blocks starting with `SECTION <Exact section name>`.
- Do NOT output LaTeX. Do NOT include unchanged sections. Do NOT explain yourself.
- Keep @-field lines and `- ` bullets in the same structural format as the input.
- If nothing should change, return exactly: NO_CHANGES

{principles}""".format(
    compact_format=_compact_format_doc(),
    principles=_PRINCIPLES,
)


CONVERT_PROMPT = r"""You convert plain resume text (from PDF/DOCX/TXT) into a LaTeX resume that follows the given template exactly.

Match the template's commands and preamble. Fill it with the extracted content. Clean obvious grammar issues, but do NOT turn the writing into generic AI resume voice.

## Anti-AI-voice rules
- Keep the candidate's real scope. Do not invent employers, titles, metrics, or technologies.
- Prefer concrete tools and systems over buzzwords.
- Ban: passionate, results-driven, leveraged, spearheaded, cutting-edge, robust, seamless, proven track record.
- If a metric is unknown, omit it or use `[placeholder]` — never invent precise percentages.

## Job
1. Identify name, contact, summary, experience, education, skills, projects
2. Map content into the template's structure and commands
3. Tighten weak bullets without inflating claims
4. If the source is messy, infer structure carefully; do not invent missing jobs

## Output
- Raw .tex only — no markdown, no explanations
- First line: \documentclass
- Last line: \end{document}
- Preserve template commands exactly (\resumesection, \role, \resumeitemize, \resumeSubheading, etc. as used by the template)
- Format email/LinkedIn/GitHub as \href when present"""


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
                        "Authorization": f"Bearer {_api_key()}",
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
        return "Tightened wording and cut filler. Facts unchanged."
    if "ats" in p:
        return "Adjusted headings/keywords for ATS parsing. No invented experience."
    if "metric" in p or "quantif" in p or "number" in p:
        return "Improved quantification where numbers existed; used placeholders where they didn't."
    if "rewrite" in p or "overhaul" in p or "redo" in p:
        return "Rewrote phrasing. Same scope and facts."
    if "summary" in p:
        return "Rewrote the summary to be short and factual."
    if "tailor" in p or "target" in p:
        return "Reordered emphasis for the target role."
    if "roast" in p or "critique" in p or "feedback" in p:
        return "Called out the weak spots and fixed the top ones."
    return "Updated."


async def convert_resume(plain_text: str, template_latex: str) -> dict:
    if not _api_key():
        return {"success": False, "error": "AI not configured. Set OPENAI_API_KEY environment variable."}

    truncated_tpl = template_latex if len(template_latex) < 8000 else template_latex[:8000] + "\n%...[truncated]"
    truncated_txt = plain_text if len(plain_text) < 6000 else plain_text[:6000] + "\n...[truncated]"

    messages = [
        {"role": "system", "content": CONVERT_PROMPT},
        {"role": "user", "content": f"Here is the LaTeX template to follow:\n\n{truncated_tpl}\n\n---\n\nHere is the plain text extracted from the resume:\n\n{truncated_txt}"},
    ]

    try:
        data = await _chat_completion(messages, 0.2, 8192)
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
    if not _api_key():
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
        user_content = (
            f"Current resume (compact format):\n\n{compact}\n\n---\n\n"
            f"User request: {prompt}\n\n"
            "Constraints: preserve true scope; no fabricated metrics; no buzzword/AI-resume voice."
        )
    else:
        user_content = (
            "You receive the FULL resume below for context, but you must return ONLY the compact "
            "blocks of the sections you change, each starting with SECTION <Name>.\n\n"
            f"Current resume (compact format):\n\n{compact}\n\n"
            f"---\n\nUser request: {prompt}\n\n"
            "Constraints: preserve true scope; no fabricated metrics; no buzzword/AI-resume voice."
        )

    messages.append({"role": "user", "content": user_content})

    try:
        data = await _chat_completion(messages, 0.25, 8192)
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
