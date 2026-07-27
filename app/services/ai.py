import httpx
import os

from app.services.latex import latex_to_compact

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "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")
OPENAI_BASE_URL = os.environ.get("OPENAI_BASE_URL", "https://api.groq.com/openai")
MODEL = os.environ.get("RESUMATE_MODEL", "llama-3.3-70b-versatile")

SYSTEM_PROMPT = r"""You are a world-class resume strategist and LaTeX editor.

You edit resumes written in LaTeX. You return the ENTIRE modified .tex file — never fragments, never markdown, never explanations.

## How to read the input
The user sends a **compact representation** of the resume, not raw LaTeX. Here's the format:
- `SECTION Name` = section header
- `SUB Name | Dates | Role | Location` = job/education entry
- `- Bullet text` = resume bullet
- `**Bold text**` = bold formatting
- `CONTACT label=url` = contact info

You must output the COMPLETE .tex file from \documentclass to \end{document}. Map the compact input back to proper LaTeX commands.

## Your Core Principles

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
- **Roast**: 3-5 specific criticisms, then fix them

## LaTeX Rules (Critical)
- NEVER modify preamble (\documentclass, \usepackage, \newcommand)
- NEVER rename custom commands (\resumeSubheading, \resumeItem, etc.)
- NEVER change \begin{document} / \end{document}
- Preserve all formatting commands (\textbf, \textit, etc.)
- Output the COMPLETE .tex file

## Response Format
- Output ONLY raw LaTeX — no ``` fences, no explanations
- First line: \documentclass or preamble
- Last line: \end{document}"""


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
    # strip leading ``` or ```latex etc.
    if lines and lines[0].strip().startswith("```"):
        lines = lines[1:]
    # strip trailing ```
    while lines and lines[-1].strip() in ("```", "") and "\\end{document}" not in lines[-1]:
        if lines[-1].strip() == "```":
            lines.pop()
        elif lines[-1].strip() == "" and lines and lines[-1].strip() != "```":
            break
        else:
            break
    return "\n".join(lines)


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
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                f"{OPENAI_BASE_URL}/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {OPENAI_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": MODEL,
                    "messages": messages,
                    "temperature": 0.3,
                    "max_tokens": 8192,
                },
            )
            resp.raise_for_status()
            data = resp.json()

            content = data["choices"][0]["message"]["content"].strip()

            content = _strip_markdown_fences(content)

            if "\\documentclass" not in content:
                return {"success": False, "error": "AI returned incomplete output. Please try again."}

            return {"success": True, "latex_content": content}

    except httpx.TimeoutException:
        return {"success": False, "error": "AI timed out. Try with a shorter resume."}
    except httpx.HTTPStatusError as e:
        return {"success": False, "error": f"API error ({e.response.status_code})."}
    except Exception as e:
        return {"success": False, "error": f"Conversion failed: {str(e)}"}


async def ai_assist(latex_content: str, prompt: str, history: list | None = None) -> dict:
    if not OPENAI_API_KEY:
        return {
            "success": False,
            "error": "AI not configured. Set OPENAI_API_KEY environment variable.",
        }

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]

    if history:
        recent = history[-8:]
        for msg in recent:
            content = msg["content"]
            if len(content) > 500:
                content = content[:500] + "...[trimmed]"
            messages.append({"role": msg["role"], "content": content})

    compact = latex_to_compact(latex_content)
    if len(compact) > 6000:
        compact = compact[:6000] + "\n...[truncated]"

    messages.append({
        "role": "user",
        "content": f"Current resume (compact format):\n\n{compact}\n\n---\n\nUser request: {prompt}",
    })

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                f"{OPENAI_BASE_URL}/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {OPENAI_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": MODEL,
                    "messages": messages,
                    "temperature": 0.4,
                    "max_tokens": 8192,
                },
            )
            resp.raise_for_status()
            data = resp.json()

            content = data["choices"][0]["message"]["content"]
            content = content.strip()

            content = _strip_markdown_fences(content)

            if "\\documentclass" not in content:
                return {
                    "success": False,
                    "error": "AI returned incomplete output. Please try again.",
                }

            if content.count("{") != content.count("}"):
                open_b = content.count("{")
                close_b = content.count("}")
                diff = abs(open_b - close_b)
                if diff <= 3:
                    if open_b > close_b:
                        content = content.rstrip() + "\n" + "}" * diff
                    else:
                        for _ in range(diff):
                            idx = content.rfind("}")
                            content = content[:idx] + content[idx+1:]
                else:
                    return {
                        "success": False,
                        "error": f"AI returned malformed LaTeX ({diff} unmatched braces). Please try again.",
                    }

            reply = "Done — your resume has been updated."
            p = prompt.lower()
            if "polish" in p:
                reply = "Polished your resume — tightened verbs, removed filler, sharpened every bullet."
            elif "ats" in p:
                reply = "ATS-optimized — standardized headings, injected relevant keywords, ensured parsable structure."
            elif "metric" in p or "quantif" in p or "number" in p:
                reply = "Added quantified metrics throughout — numbers make the difference."
            elif "rewrite" in p or "overhaul" in p or "redo" in p:
                reply = "Full rewrite complete — same achievements, completely elevated language."
            elif "summary" in p:
                reply = "Rewrote your summary — now a tight elevator pitch with clear value proposition."
            elif "tailor" in p or "target" in p:
                reply = "Tailored your resume for the target role — reordered bullets, added relevant keywords."
            elif "roast" in p or "critique" in p or "feedback" in p:
                reply = "Roasted and fixed — addressed the top issues I found."

            return {
                "success": True,
                "latex_content": content,
                "user_message": prompt,
                "ai_reply": reply,
            }

    except httpx.TimeoutException:
        return {"success": False, "error": "AI timed out. The response may be too long — try a shorter request."}
    except httpx.HTTPStatusError as e:
        return {"success": False, "error": f"Groq API error ({e.response.status_code}). Check your API key."}
    except Exception as e:
        return {"success": False, "error": f"Request failed: {str(e)}"}
