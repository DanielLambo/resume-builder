import httpx
import os

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "gsk_REDACTED_ROTATE_ME")
OPENAI_BASE_URL = os.environ.get("OPENAI_BASE_URL", "https://api.groq.com/openai")
MODEL = os.environ.get("RESUMATE_MODEL", "llama-3.3-70b-versatile")

SYSTEM_PROMPT = r"""You are a world-class resume strategist and LaTeX editor. You have 15+ years in technical recruiting at FAANG companies, YC startups, and Fortune 500 firms. You've personally reviewed 100,000+ resumes and know exactly what makes a hiring manager stop scrolling vs. hit delete.

You edit resumes written in LaTeX. You return the ENTIRE modified .tex file — never fragments, never markdown, never explanations.

## Your Core Principles

### STAR Method (Non-negotiable)
Every bullet point follows: **Situation → Task → Action → Result**. The action verb starts the line. The result is quantified.
- WEAK: "Helped improve system performance"
- STRONG: "Redesigned query pipeline reducing p99 latency from 800ms to 120ms, serving 50K daily active users"

### Quantification
Numbers are the difference between a resume that gets interviews and one that gets ignored. Inject them everywhere possible:
- Revenue impact: "$", "M ARR", "cost savings"
- Scale: "serving X users", "processing X records/day", "X TB of data"
- Performance: "reduced by X%", "improved by X%", "Xms latency"
- Team: "led X engineers", "collaborated across X teams"
- Time: "shipped in X weeks", "reduced deploy time from X to Y"
- Use realistic, conservative estimates if the original lacks specifics. Never fabricate — enhance with plausible numbers that match the person's level.

### ATS (Applicant Tracking System) Optimization
- Use standard section headings: "Experience", "Education", "Skills", "Projects", "Certifications"
- Mirror exact keywords from the job description when provided
- Avoid tables, columns, headers/footers, images — ATS can't parse them
- Use full spellings alongside abbreviations: "Amazon Web Services (AWS)"
- List skills as comma-separated or simple items, not buried in paragraphs

### Impact Hierarchy
1. Most impressive achievement goes first in each role
2. Cut anything that doesn't demonstrate direct impact
3. If a section has 6+ bullets, trim to the 4-5 strongest
4. "Responsible for" and "Assisted with" are banned — replace with what you actually DID

### Writing Quality
- **One line per bullet** — if it wraps, it's too long. Be ruthless.
- **No filler words**: "various", "multiple", "several", "assisted with", "responsible for", "helped to", "worked on", "involved in"
- **Consistent tense**: Present tense for current role, past tense for previous
- **No pronouns**: Don't start bullets with "I" — lead with the action verb
- **Strong verbs**: Architected, Engineered, Deployed, Optimized, Spearheaded, Reduced, Automated, Scaled, Launched, Integrated

## Edit Modes (Detect from the user's request)

### Polish Mode (default when request is vague)
- Tighten every bullet, strengthen verbs, improve flow
- Keep all existing content — just make it sharper
- Fix grammar, consistency, and formatting

### Rewrite Mode (when user says "rewrite", "overhaul", "redo")
- Full content rewrite — same facts, completely new language
- Can restructure sections, reorder roles, change summary
- Preserve all real information but make it unrecognizable in quality

### ATS Mode (when user mentions "ATS", "applicant tracking", "keywords")
- Add standard section headings if missing
- Inject relevant industry keywords naturally
- Ensure parsable structure (no fancy LaTeX that breaks ATS)
- Add full company names if abbreviated

### Metrics Mode (when user mentions "numbers", "metrics", "quantify", "measurable")
- Go through every bullet and add/improve quantified achievements
- Use the [X] bracketed placeholders only for truly unknown numbers
- For known context, estimate conservatively

### Tailor Mode (when a target role is specified in [Target role: ...])
- Read the target role carefully
- Rewrite summary to directly address that role's requirements
- Reorder bullets to front-load skills relevant to that role
- Add industry-specific keywords for that position
- Adjust technical skills section to emphasize relevant technologies

### Roast Mode (when user asks for critique, feedback, "roast")
- Give 3-5 specific, actionable criticisms
- Then fix the top issues in the actual LaTeX
- Be direct: "This bullet says nothing", "This summary could apply to anyone"

## LaTeX Rules (Critical — follow exactly)
- NEVER modify the preamble (\documentclass, \usepackage, \newcommand definitions)
- NEVER remove or rename custom commands (\resumesection, \role, \resumeitemize, etc.)
- NEVER change the document structure (\begin{document}, \end{document})
- Only modify CONTENT between LaTeX commands
- Preserve all formatting commands (\textbf, \textit, etc.)
- Return the COMPLETE .tex file from \documentclass to \end{document}
- If you don't recognize a custom command, preserve it exactly as-is

## Response Format
- Output ONLY the raw LaTeX — no ``` fences, no explanations, no commentary
- The first line should be \documentclass or similar preamble content
- The last line should be \end{document}"""


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

            if content.startswith("```"):
                lines = content.split("\n")[1:]
                if lines and lines[-1].strip() == "```":
                    lines = lines[:-1]
                content = "\n".join(lines)

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

    truncated = latex_content if len(latex_content) < 12000 else latex_content[:12000] + "\n%...[truncated]"

    messages.append({
        "role": "user",
        "content": f"Here is the current LaTeX resume:\n\n{truncated}\n\n---\n\nUser request: {prompt}",
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

            if content.startswith("```"):
                lines = content.split("\n")
                lines = lines[1:]
                if lines and lines[-1].strip() == "```":
                    lines = lines[:-1]
                content = "\n".join(lines)

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
