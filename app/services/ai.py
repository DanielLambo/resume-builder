import asyncio
import httpx
import os
import re
import secrets
from pathlib import Path

from dotenv import load_dotenv

from app.paths import COMPILED_DIR
from app.services.latex import (
    apply_compact_sections,
    extract_custom_commands,
    latex_to_compact,
    split_document,
    compile_latex,
)

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

# Groq (OpenAI-compatible chat completions API)
GROQ_BASE_URL = os.environ.get(
    "GROQ_BASE_URL",
    os.environ.get("OPENAI_BASE_URL", "https://api.groq.com/openai"),
).rstrip("/")
MODEL = os.environ.get("RESUMATE_MODEL", "llama-3.3-70b-versatile")

MAX_RETRIES = 3
BACKOFF_SECONDS = [2, 4, 8]
RETRYABLE_STATUS = {408, 429, 500, 502, 503}

# Phrases that make a resume read like ChatGPT wrote it.
_BANNED_VOICE = [
    r"\bhighly motivated\b",
    r"\bresults[-\s]?driven\b",
    r"\bpassionate\b",
    r"\bleveraged\b",
    r"\butilized\b",
    r"\bspearheaded\b",
    r"\borchestrated\b",
    r"\brevolutionized\b",
    r"\btransformed\b",
    r"\belevated\b",
    r"\bstreamlined\b",
    r"\bcutting[-\s]?edge\b",
    r"\bseamless\b",
    r"\bsynergistic\b",
    r"\bproven track record\b",
    r"\bexpertise in\b",
    r"\bwith expertise\b",
    r"\bdemonstrated ability\b",
    r"\bstrong communicator\b",
    r"\bcross[-\s]?functional stakeholders\b",
    r"\bend[-\s]?to[-\s]?end solutions?\b",
    r"\bdevelopment methodologies\b",
    r"\bprogramming languages:\b",  # prefer Languages:
    r"\brobust\b",
    r"\bscalable\b",
    r"\binnovative\b",
    r"\bcomprehensive\b",
    r"\bfacilitated\b",
    r"\bhelped (?:with|to)\b",
    r"\bresponsible for\b",
    r"\bvarious\b",
    r"\bmultiple aspects\b",
    # Template impact cadence recruiters flag
    r",\s*resulting in (?:a )?\d",
    r",\s*achieving (?:a )?\d",
    r",\s*driving (?:a )?\d",
    r",\s*leading to (?:a )?\d",
]

_BANNED_RE = re.compile("|".join(_BANNED_VOICE), re.I)

# Short typed aliases → full edit instructions
_PROMPT_ALIASES = {
    "polish": (
        "Rewrite Summary, Experience, Projects, Education, and Skills for elite SWE resume quality. "
        "Keep employers, titles, dates, tools, and numeric facts — but rewrite sentence structure so it "
        "sounds like a sharp human, not ChatGPT. "
        "Rules: (1) kill fluff openers and banned buzzwords, "
        "(2) ban ', resulting in / achieving / driving N%' cadence — put the number in the verb phrase "
        "(e.g. 'Cut API p99 ~31%; throughput +25%'), "
        "(3) one claim per bullet, concrete verb + specific object + tool when known, "
        "(4) Summary = 1 short factual line, "
        "(5) Skills = compact labeled rows like **Languages:** … not corporate category names, "
        "(6) do not invent employers, products, or metrics. "
        "Return every section you change."
    ),
    "rewrite": None,  # same as polish — filled below
    "ats": (
        "Make this ATS-cleaner without inventing experience: standard section names if needed, "
        "clear keywords already evidenced by the bullets, plain Skills rows. "
        "No fluff adjectives. Return every section you change."
    ),
    "metrics": (
        "Improve how existing numbers are written. Keep the same figures. "
        "Rephrase away from 'resulting in X%' templates into verb-led claims "
        "(e.g. 'Cut p99 from ~800ms to ~120ms'). "
        "Where impact is implied but no number exists, use [X%] / [N users] — never invent precise fakes. "
        "Return every section you change."
    ),
    "summary": (
        "Rewrite ONLY the Summary as ONE short factual line (two max). "
        "Pattern: '<focus> engineer: <3 concrete domains>.' "
        "Ban: highly motivated, expertise in, passionate, results-driven, Experienced in…, "
        "scalable solutions, supporting product teams with…. "
        "Example: 'Backend engineer: APIs, Postgres, and reliability for product teams.'"
    ),
    "one page": (
        "Fit to ONE page by rewriting for density — not by inventing layout commands. "
        "Compress every bullet to ~one printed line, drop the weakest claims, "
        "Summary to 1 line, keep employers/titles/dates/tools/real numbers. "
        "Human voice only. Return ALL content sections you touch."
    ),
}

_PROMPT_ALIASES["rewrite"] = _PROMPT_ALIASES["polish"]
_PROMPT_ALIASES["make this one page"] = _PROMPT_ALIASES["one page"]
_PROMPT_ALIASES["1 page"] = _PROMPT_ALIASES["one page"]
_PROMPT_ALIASES["fit to one page"] = _PROMPT_ALIASES["one page"]


def _api_key() -> str:
    return (
        os.environ.get("GROQ_API_KEY", "").strip()
        or os.environ.get("OPENAI_API_KEY", "").strip()  # legacy alias
    )


def _normalize_prompt(prompt: str) -> str:
    """Expand short/common phrases into clear edit instructions."""
    raw = (prompt or "").strip()
    body = re.sub(r"^\[Target role:[^\]]*\]\s*", "", raw, flags=re.I).strip()
    key = re.sub(r"[.!]+$", "", body.lower()).strip()
    alias = _PROMPT_ALIASES.get(key)
    if alias:
        m = re.match(r"^(\[Target role:[^\]]*\]\s*)", raw, flags=re.I)
        return (m.group(1) if m else "") + alias
    return raw


def _find_banned_voice(text: str) -> list[str]:
    """Return unique banned-phrase hits in AI output or resulting body."""
    hits = []
    for m in _BANNED_RE.finditer(text or ""):
        hit = m.group(0).strip()
        if hit and hit.lower() not in {h.lower() for h in hits}:
            hits.append(hit)
    return hits[:8]


def _compact_format_doc() -> str:
    return r"""- `NAME Name` = header name
- `CONTACT label=value` = contact info
- `SECTION Name` = section header
- `@COMPANY` / `@LOC` / `@ROLE` / `@DATES` = job/education entry fields (4-arg style)
- `@TITLE` / `@COMPANY` / `@DETAILS` = job/education entry fields (3-arg style)
- `- Bullet text` = resume bullet
- `**Bold text**` = bold formatting

Keep @-field sets complete for each entry.
Preserve LaTeX escapes inside values: \quad, --, \%, \&, $\cdot$."""


def _stylesheet(latex: str) -> str:
    """Few concrete command examples from the live document so the model mirrors them."""
    examples = []
    for pat, label in (
        (r"\\resumesection\{[^}]+\}", "section"),
        (r"\\section\{[^}]+\}", "section"),
        (r"\\role\{[^\n]+", "role"),
        (r"\\resumeSubheading\{[^\n]+", "heading"),
        (r"\\begin\{resumeitemize\}", "items"),
        (r"\\begin\{itemize\}", "items"),
        (r"\\resumeItem\{[^\n]+", "bullet"),
        (r"\\entrygap", "gap"),
    ):
        m = re.search(pat, latex)
        if m:
            examples.append(f"- {label}: `{m.group(0)[:120]}`")
    if not examples:
        return "(no special commands detected — preserve the compact field layout)"
    return "\n".join(examples[:8])


_FEW_SHOT = r"""## Quality bar (match this voice)

BAD: Highly motivated backend engineer with expertise in API design and scalable solutions.
GOOD: Backend engineer: APIs, Postgres, and reliability for product teams.

BAD: Developed and deployed high-performance APIs, resulting in 31% latency reduction and 25% throughput increase.
GOOD: Shipped Go/Postgres APIs; cut p99 latency ~31% and raised throughput ~25%.

BAD: Improved data modeling and migration strategies using Postgres, achieving 40% reduction in p99 latency.
GOOD: Redesigned Postgres schemas and migrations; p99 dropped ~40%.

BAD: Created full-stack features, driving a 20% increase in user engagement.
GOOD: Shipped API + UI features that lifted engagement ~20%.

BAD: **Programming Languages:** Go, Python
GOOD: **Languages:** Go, Python, TypeScript, SQL

BAD: **Development Methodologies:** CI/CD
GOOD: **Infra:** Docker, Kubernetes, AWS, CI/CD

BAD: Maintain a 3.8/4.00 GPA.
GOOD: GPA: 3.8/4.00

BAD (prior role, wrong tense): Deliver API features that lift engagement ~20%.
GOOD: Shipped API + UI features that lifted engagement ~20%."""


_PRINCIPLES = r"""## Role
You are a senior hiring manager's favorite resume editor for software engineers.
Your edits should make a recruiter trust the candidate in 6 seconds.

## Truth first
- Keep real employers, titles, dates, tools, and numbers.
- Never invent products, employers, tools, or fake-precise metrics.
- Only mention a tool in a bullet if it already appears in that bullet or the Skills section.
- Missing numbers → qualitative claim OR `[X%]` / `[N users]`.

## Voice (non-negotiable)
- Write like a sharp human who edited by hand.
- Concrete verb + specific object (+ tool when known) (+ honest impact).
- One claim per bullet. Roughly one printed line.
- Present tense for current role, past tense for previous roles/internships. No "I/we".
- Vary rhythm — not every bullet ends with a percentage clause.
- Education GPA line stays factual: `GPA: 3.8/4.00` — not "Maintain a GPA…".

## Hard bans
Never output: highly motivated, results-driven, passionate, leveraged, utilized,
spearheaded, orchestrated, cutting-edge, seamless, robust, innovative, synergistic,
proven track record, expertise in, demonstrated ability, responsible for, facilitated,
"Development Methodologies", or the cadence ", resulting in / achieving / driving N%".

## Skills
Use short labels: **Languages:** **Systems:** **Infra:** — never corporate taxonomy.

## Edit discipline
- Change what the request needs. Prefer returning only changed sections.
- Preserve section order and entry order unless asked to reorder.
- Header/contact is not editable — never invent SECTION Contact.
- For simple renames (school/employer/city), change ONLY the matching @ field values —
  keep every bullet byte-identical. Never rewrite surrounding content for a rename.

## Output contract
- Compact text ONLY. No LaTeX. No markdown fences. No commentary.
- Changed sections only, each starting with `SECTION <ExactName>`.
- ExactName must match an existing section title character-for-character.
- If nothing should change: NO_CHANGES"""


SYSTEM_PROMPT = r"""You are a technical resume editor. You edit resumes via a compact text format.
The host app maps your compact sections back onto the original LaTeX — you must NOT output LaTeX.

## Compact format
{compact_format}

## This document's real LaTeX command shapes (mirror via compact fields; do not emit these)
{stylesheet}

## Custom commands present
{commands}

{few_shot}

{principles}""".format(
    compact_format=_compact_format_doc(),
    stylesheet="{stylesheet}",
    commands="{commands}",
    few_shot=_FEW_SHOT,
    principles=_PRINCIPLES,
)


CONVERT_PROMPT = r"""You convert plain resume text (from PDF/DOCX/TXT) into a LaTeX resume that follows the given template exactly.

Match the template's commands and preamble. Fill it with the extracted content.
Rewrite weak/AI-sounding source text into sharp human bullets — but never invent facts.

## Voice
- Concrete verb + specific object + real tools
- Ban: passionate, results-driven, leveraged, spearheaded, cutting-edge, robust, seamless,
  proven track record, highly motivated, expertise in, ", resulting in N%"
- Prefer: "Cut API p99 ~31%" over "resulting in a 31% latency reduction"
- Skills as **Languages:** / **Systems:** / **Infra:**

## Job
1. Identify name, contact, summary, experience, education, skills, projects
2. Map into the template's structure and commands
3. Tighten weak bullets without inflating claims
4. Do not invent missing jobs, employers, or metrics

## Output
- Raw .tex only — no markdown, no explanations
- First line: \documentclass
- Last line: \end{document}
- Preserve template commands exactly
- Format email/LinkedIn/GitHub as \href when present"""


def _strip_markdown_fences(text: str) -> str:
    lines = text.split("\n")
    if lines and lines[0].strip().startswith("```"):
        lines = lines[1:]
    if lines and lines[-1].strip() == "```":
        lines = lines[:-1]
    return "\n".join(lines).strip()


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
                    f"{GROQ_BASE_URL}/v1/chat/completions",
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
    if "one page" in p or "1 page" in p or ("fit" in p and "page" in p):
        return "Compressed to one page. Voice tightened; facts kept."
    if "polish" in p or "rewrite" in p or "elite" in p or "quality" in p:
        return "Rewrote for sharper human voice. Facts and numbers kept."
    if "ats" in p:
        return "Cleared ATS friction. No invented experience."
    if "metric" in p or "quantif" in p or "number" in p:
        return "Reframed existing numbers into verb-led claims."
    if "summary" in p:
        return "Summary is now one factual line."
    if "tailor" in p or "target" in p:
        return "Reordered emphasis for the target role."
    if "roast" in p or "critique" in p or "feedback" in p:
        return "Called out weak spots and fixed the top ones."
    return "Updated."


def _looks_like_latex(content: str) -> bool:
    return bool(
        re.search(r"\\begin\{document\}", content)
        or re.search(r"\\documentclass", content)
        or re.search(r"\\resumesection\{", content)
        or re.search(r"\\resumeSubheading\{", content)
        or re.search(r"\\role\{", content)
    )


async def _compiles_ok(latex: str) -> tuple[bool, str]:
    """Return (ok, error). Skip-soft if pdflatex is missing.

    Uses a random high id so validation never clobbers a real resume PDF.
    """
    vid = 900_000 + secrets.randbelow(90_000)
    try:
        try:
            result = await compile_latex(vid, latex)
        except Exception:
            return True, ""
        err = (result.get("error") or "").strip()
        if not result.get("success") and "pdflatex not found" in err.lower():
            return True, ""
        if result.get("success"):
            return True, ""
        first = err.split("\n")[0][:240]
        return False, first or "LaTeX compile failed"
    finally:
        for suffix in (".pdf", ".synctex.json"):
            (COMPILED_DIR / f"{vid}{suffix}").unlink(missing_ok=True)


def _apply_compact_edit(latex_content: str, content: str) -> dict:
    if content.strip().upper() == "NO_CHANGES":
        return {
            "success": True,
            "latex_content": latex_content,
            "ai_reply": "I reviewed your resume — no changes were needed.",
            "no_changes": True,
        }
    if _looks_like_latex(content):
        return {
            "success": False,
            "error": "AI returned LaTeX instead of compact sections. Try again with a clearer request.",
        }
    has_section = re.search(r"^SECTION\s+.+$", content, re.M)
    if not has_section:
        return {"success": False, "error": "AI returned no edited sections. Try a more specific request."}
    final_latex = apply_compact_sections(latex_content, content)
    if final_latex == latex_content:
        return {"success": False, "error": "AI returned no usable edits. Try a more specific request."}
    return {"success": True, "latex_content": final_latex}


def _voice_repair_message(banned: list[str]) -> str:
    joined = ", ".join(f'"{b}"' for b in banned)
    return (
        f"Quality gate failed. Your draft still contains banned AI-resume voice: {joined}. "
        "Rewrite the SAME sections in compact form. Keep facts/numbers/tools. "
        "Use verb-led bullets (e.g. 'Cut API p99 ~31%') — never ', resulting in N%'. "
        "Summary must be one factual line. Skills labels: Languages / Systems / Infra. "
        "Compact sections only — no LaTeX, no commentary."
    )


async def convert_resume(plain_text: str, template_latex: str) -> dict:
    if not _api_key():
        return {"success": False, "error": "AI not configured. Set GROQ_API_KEY environment variable."}

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


def _canonicalize_school_name(raw: str) -> str:
    s = re.sub(r"\s+", " ", (raw or "").strip())
    s = re.sub(r"\ba\s*(?:and|&)\s*m\b", "A\\&M", s, flags=re.I)
    parts = []
    for w in s.split(" "):
        low = w.lower()
        if low in {"of", "in", "the", "and", "at"}:
            parts.append(low)
        elif re.fullmatch(r"A\\&M", w, flags=re.I):
            parts.append("A\\&M")
        else:
            parts.append(w[:1].upper() + w[1:] if w else w)
    name = " ".join(parts)
    name = re.sub(r"A\\&M\b", r"A \\& M", name)
    if re.search(r"A \\& M$", name) and "university" not in name.lower():
        name += " University"
    return name


def _find_latex_phrase(latex: str, needle: str) -> str | None:
    """Find a real employer/school phrase in the .tex that matches a loose needle."""
    needle_l = re.sub(r"[^a-z0-9]+", " ", needle.lower()).strip()
    if len(needle_l) < 3:
        return None
    candidates = re.findall(
        r"\{([^{}]*(?:University|College|School|Institute|Inc\.?|Corp\.?|Labs?)[^{}]*)\}",
        latex,
        flags=re.I,
    )
    candidates += re.findall(r"\{([^{}]{3,60})\}", latex)
    best = None
    best_score = 0
    for c in candidates:
        cl = re.sub(r"[^a-z0-9]+", " ", c.lower()).strip()
        if needle_l in cl or cl in needle_l or needle_l.split()[0] in cl:
            score = len(set(needle_l.split()) & set(cl.split()))
            if score > best_score:
                best_score = score
                best = c
    return best


def _try_simple_rename(latex: str, prompt: str) -> dict | None:
    """Handle 'I'm at X not Y' corrections with a surgical string replace."""
    p = (prompt or "").strip()
    # Only short, user-typed corrections — never expanded system aliases.
    if len(p) > 120:
        return None
    m = re.search(
        r"(?:i'?m\s+(?:in|at|from)\s+|it'?s\s+|change\s+(?:it\s+)?to\s+)(.+?)\s+not\s+(.+)$",
        p,
        flags=re.I,
    )
    if not m:
        # "alabama a&m not southwestern" (no leading I'm)
        m = re.search(
            r"^([a-z0-9][a-z0-9 .&'/\\-]{1,60}?)\s+not\s+([a-z0-9][a-z0-9 .&'/\\-]{1,40})$",
            p,
            flags=re.I,
        )
    if not m:
        return None

    new_raw, old_raw = m.group(1).strip(), m.group(2).strip()
    # Reject if this looks like instruction prose ("do not invent…")
    if new_raw.lower() in {"do", "does", "did", "please", "just"}:
        return None
    old_raw = re.sub(r"\b(university|college)\b\.?$", "", old_raw, flags=re.I).strip() or old_raw

    old_phrase = _find_latex_phrase(latex, old_raw)
    if not old_phrase:
        m2 = re.search(re.escape(old_raw), latex, flags=re.I)
        if not m2:
            return None
        start = latex.rfind("{", 0, m2.start())
        end = latex.find("}", m2.end())
        old_phrase = latex[start + 1 : end] if start != -1 and end != -1 else m2.group(0)

    new_phrase = _canonicalize_school_name(new_raw)
    if not new_phrase or new_phrase.lower() == old_phrase.lower():
        return None

    if old_phrase not in latex:
        pattern = re.compile(re.escape(old_phrase), re.I)
        if not pattern.search(latex):
            return None
        updated = pattern.sub(new_phrase, latex)
    else:
        updated = latex.replace(old_phrase, new_phrase)

    if updated == latex:
        return None
    return {
        "success": True,
        "latex_content": updated,
        "user_message": prompt,
        "ai_reply": f'Updated "{old_phrase}" → "{new_phrase.replace(chr(92) + "&", "&")}".',
    }


async def ai_assist(latex_content: str, prompt: str, history: list | None = None) -> dict:
    if not _api_key():
        return {
            "success": False,
            "error": "AI not configured. Set GROQ_API_KEY environment variable.",
        }

    raw_prompt = (prompt or "").strip()
    # Surgical renames must see the user's short text, not expanded aliases.
    simple = _try_simple_rename(latex_content, raw_prompt)
    if simple:
        ok, _err = await _compiles_ok(simple["latex_content"])
        if ok:
            return simple

    prompt = _normalize_prompt(raw_prompt)

    preamble, _ = split_document(latex_content)
    custom_cmds = extract_custom_commands(preamble) if preamble else []
    commands_text = (
        ", ".join(f"\\{c}" for c in custom_cmds)
        if custom_cmds
        else "(none detected)"
    )

    compact = latex_to_compact(latex_content)
    system_prompt = (
        SYSTEM_PROMPT
        .replace("{commands}", commands_text)
        .replace("{stylesheet}", _stylesheet(latex_content))
    )

    messages = [{"role": "system", "content": system_prompt}]

    if history:
        for msg in history[-4:]:
            content = msg.get("content", "")
            if len(content) > 300:
                content = content[:300] + "...[trimmed]"
            messages.append({"role": msg.get("role", "user"), "content": content})

    user_content = (
        "Edit the resume below for maximum credible quality. "
        "Return ONLY changed compact SECTION blocks (or NO_CHANGES). Do not output LaTeX.\n\n"
        f"Current resume (compact):\n\n{compact}\n\n"
        f"---\n\nUser request: {prompt}"
    )
    messages.append({"role": "user", "content": user_content})

    try:
        data = await _chat_completion(messages, 0.2, 4096)
        choice = data["choices"][0]
        finish = choice.get("finish_reason")
        content = _strip_markdown_fences(choice["message"]["content"])

        if finish == "length":
            return _finish_error()

        applied = _apply_compact_edit(latex_content, content)
        if not applied.get("success"):
            repair_messages = messages + [
                {"role": "assistant", "content": content[:1500]},
                {
                    "role": "user",
                    "content": (
                        f"That output was invalid ({applied.get('error', 'bad format')}). "
                        "Return ONLY compact SECTION blocks. Example:\n"
                        "SECTION Summary\n"
                        "Backend engineer: APIs, Postgres, and reliability for product teams.\n\n"
                        "SECTION Experience\n"
                        "@TITLE Software Engineer\n"
                        "@COMPANY Acme\n"
                        "@DETAILS Remote \\quad Jan 2024 -- Present\n"
                        "- Shipped billing APIs in Go; cut p99 ~40%."
                    ),
                },
            ]
            data = await _chat_completion(repair_messages, 0.1, 4096)
            finish = data["choices"][0].get("finish_reason")
            content = _strip_markdown_fences(data["choices"][0]["message"]["content"])
            if finish == "length":
                return _finish_error()
            applied = _apply_compact_edit(latex_content, content)
            if not applied.get("success"):
                return applied

        if applied.get("no_changes"):
            return {
                "success": True,
                "latex_content": latex_content,
                "user_message": prompt,
                "ai_reply": applied["ai_reply"],
            }

        final_latex = applied["latex_content"]

        # Voice quality gate — rewrite once if banned AI-slop remains in NEW text
        banned = _find_banned_voice(content) or _find_banned_voice(
            latex_to_compact(final_latex)
        )
        # Only gate phrases that are new vs the original (don't loop on pre-existing slop forever,
        # but DO force a rewrite when the model introduced or kept slop in changed sections)
        if banned:
            voice_messages = messages + [
                {"role": "assistant", "content": content[:1800]},
                {"role": "user", "content": _voice_repair_message(banned)},
            ]
            data = await _chat_completion(voice_messages, 0.1, 4096)
            finish = data["choices"][0].get("finish_reason")
            content2 = _strip_markdown_fences(data["choices"][0]["message"]["content"])
            if finish != "length":
                applied2 = _apply_compact_edit(latex_content, content2)
                if applied2.get("success") and not applied2.get("no_changes"):
                    banned2 = _find_banned_voice(content2)
                    # Prefer the cleaner draft even if not perfect
                    if len(banned2) <= len(banned):
                        final_latex = applied2["latex_content"]
                        content = content2

        ok, compile_err = await _compiles_ok(final_latex)
        if not ok:
            repair_messages = messages + [
                {"role": "assistant", "content": content[:1500]},
                {
                    "role": "user",
                    "content": (
                        "Your compact edit was applied but the resulting LaTeX failed to compile:\n"
                        f"{compile_err}\n\n"
                        "Return a corrected compact SECTION edit that preserves field shapes "
                        "(@TITLE/@COMPANY/@DETAILS or @COMPANY/@LOC/@ROLE/@DATES) and bullet lines. "
                        "Compact only — no LaTeX."
                    ),
                },
            ]
            data = await _chat_completion(repair_messages, 0.1, 4096)
            finish = data["choices"][0].get("finish_reason")
            content2 = _strip_markdown_fences(data["choices"][0]["message"]["content"])
            if finish == "length":
                return {
                    "success": False,
                    "error": f"AI edit broke LaTeX compile ({compile_err}). Try a narrower request.",
                }
            applied2 = _apply_compact_edit(latex_content, content2)
            if not applied2.get("success"):
                return {
                    "success": False,
                    "error": f"AI edit broke LaTeX compile ({compile_err}). Try a narrower request.",
                }
            final_latex = applied2["latex_content"]
            ok2, compile_err2 = await _compiles_ok(final_latex)
            if not ok2:
                return {
                    "success": False,
                    "error": f"AI edit broke LaTeX compile ({compile_err2 or compile_err}). Try a narrower request.",
                }

        return {
            "success": True,
            "latex_content": final_latex,
            "user_message": prompt,
            "ai_reply": _reply_for_prompt(prompt),
        }

    except Exception as e:
        return _api_error(e)
