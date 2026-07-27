import asyncio
import gzip  # noqa: F401 — used in load_synctex
import json
import os
import shutil
import tempfile
import re
from pathlib import Path

STORAGE_DIR = Path(__file__).parent.parent / "storage"
RESUMES_DIR = STORAGE_DIR / "resumes"
COMPILED_DIR = STORAGE_DIR / "compiled"

RESUMES_DIR.mkdir(parents=True, exist_ok=True)
COMPILED_DIR.mkdir(parents=True, exist_ok=True)


def latex_to_compact(latex: str) -> str:
    """Convert LaTeX resume to compact token-efficient plain text.

    Strips LaTeX syntax and encodes structure with short delimiters.
    Saves ~3-5x tokens vs raw LaTeX on Groq.
    """
    lines = latex.split("\n")
    out = []
    in_preamble = False
    brace_depth = 0

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        # Detect preamble start/end
        if stripped.startswith("\\documentclass"):
            in_preamble = True
            continue
        if stripped == "\\begin{document}":
            in_preamble = False
            continue
        if stripped == "\\end{document}":
            continue

        # Skip everything inside preamble
        if in_preamble:
            if stripped.startswith("\\newcommand") or stripped.startswith("\\renewcommand") or stripped.startswith("\\def"):
                brace_depth = stripped.count("{") - stripped.count("}")
                continue
            if brace_depth > 0:
                brace_depth += stripped.count("{") - stripped.count("}")
                continue
            continue

        # Name header: \huge \scshape Name \\ \vspace{4pt}
        if "\\huge" in stripped or "\\scshape" in stripped:
            m = re.search(r"\\(?:huge|scshape|Large|large|normalsize)\s*", stripped)
            name_text = re.sub(r"\\(?:huge|scshape|Large|large|normalsize|vspace|textbf|textit)\s*\{?[^}]*\}?\s*", "", stripped)
            name_text = re.sub(r"[\\{}]", "", name_text).strip()
            if name_text and len(name_text) > 2:
                out.append(f"NAME {name_text}")
            continue

        # Contact line with \href + \underline wrapper
        if "\\href" in stripped or "\\underline" in stripped:
            # Skip if this is a name line
            if "\\huge" in stripped or "\\scshape" in stripped:
                pass
            else:
                # Extract href URL and text
                urls = re.findall(r"\\href\{(.+?)\}\{\\underline\{(.+?)\}\}", stripped)
                if not urls:
                    urls = re.findall(r"\\href\{(.+?)\}\{(.+?)\}", stripped)
                parts = []
                for url, text in urls:
                    text = text.strip()
                    if url.startswith("mailto:"):
                        parts.append(f"email={text}")
                    elif "linkedin" in url:
                        parts.append(f"linkedin={url}")
                    elif "github" in url:
                        parts.append(f"github={url}")
                    else:
                        parts.append(f"{text}={url}")
                # Phone fallback
                phone = re.search(r"\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}", stripped)
                if phone and not parts:
                    parts.append(f"phone={phone.group()}")
                if parts:
                    out.append(f"CONTACT {' | '.join(parts)}")
                    continue

        # Section headers
        m = re.match(r"\\(?:section|resumeSection)\*?\{(.+?)\}", stripped)
        if m:
            out.append(f"SECTION {m.group(1)}")
            continue

        m = re.match(r"\\subsection\*?\{(.+?)\}", stripped)
        if m:
            out.append(f"SUBSECTION {m.group(1)}")
            continue

        # Subheading: \resumeSubheading{Company}{Date}{Role}{Location}
        m = re.match(r"\\resumeSubheading\{(.+?)\}\{(.+?)\}\{(.+?)\}\{(.+?)\}", stripped)
        if m:
            company, dates, role, loc = m.groups()
            loc_str = f" | {loc}" if loc else ""
            out.append(f"SUB {company} | {dates} | {role}{loc_str}")
            continue

        m = re.match(r"\\resumeSubheading\{(.+?)\}\{(.+?)\}", stripped)
        if m:
            out.append(f"SUB {m.group(1)} | {m.group(2)}")
            continue

        # Role: \role{Company}{Role}{Dates}{Location}
        m = re.match(r"\\role\{(.+?)\}\{(.+?)\}\{(.+?)\}\{(.+?)\}", stripped)
        if m:
            company, role, dates, loc = m.groups()
            loc_str = f" | {loc}" if loc else ""
            out.append(f"ROLE {company} | {role} | {dates}{loc_str}")
            continue

        # Bullet items
        m = re.match(r"\\(?:resumeItem|item)\s*\{(.+)\}", stripped)
        if m:
            out.append(f"- {m.group(1)}")
            continue
        if re.match(r"\\(?:resumeItem|item)\s*$", stripped):
            continue

        # Bold text with trailing content
        m = re.match(r"\\textbf\{(.+?)\}(.+)", stripped)
        if m:
            out.append(f"**{m.group(1)}**{m.group(2)}")
            continue
        m = re.match(r"\\textbf\{(.+?)\}", stripped)
        if m:
            out.append(f"**{m.group(1)}**")
            continue

        # Skip structural/formatting commands
        skip_commands = {
            "\\resumeSubHeadingListStart", "\\resumeSubHeadingListEnd",
            "\\resumeItemListStart", "\\resumeItemListEnd",
            "\\begin{itemize}", "\\end{itemize}",
            "\\begin{enumerate}", "\\end{enumerate}",
            "\\begin{center}", "\\end{center}",
            "\\resumeHeading", "\\resumeEntryStart", "\\resumeEntryEnd",
            "\\newpage", "\\pagestyle{empty}",
            "\\maketitle",
        }
        if stripped in skip_commands:
            continue

        # Skip vspace, hfill, and standalone formatting commands
        if stripped.startswith("\\vspace") or stripped.startswith("\\hrule") or stripped.startswith("\\hfill"):
            continue

        # Skip lines that are just LaTeX commands or env declarations
        if re.match(r"^\\(begin|end)\{", stripped):
            continue
        if re.match(r"^\\[a-zA-Z]+(\[.*?\])?\s*(\\\\)?\s*$", stripped) and not re.match(r"^\\(section|subsection|textbf|textit|text)", stripped):
            continue

        # Generic command with single arg: \command{content} -> content
        m = re.match(r"^\\(\w+)\{(.+?)\}$", stripped)
        if m and m.group(1) not in ("section", "subsection", "textbf", "textit", "href", "usepackage", "documentclass"):
            out.append(m.group(2))
            continue

        # Bare text (strip remaining LaTeX commands)
        cleaned = re.sub(r"\\\w+\s*\{([^}]+)\}", r"\1", stripped)
        cleaned = re.sub(r"\\[a-zA-Z]+", "", cleaned)
        cleaned = re.sub(r"[{}%]", "", cleaned)
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        if cleaned:
            out.append(cleaned)

    return "\n".join(out)


def parse_log_errors(log_text: str) -> list[dict]:
    """Parse LaTeX log and return structured error list with line numbers."""
    errors = []
    lines = log_text.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i]
        if line.startswith("!"):
            msg = line.lstrip("! ").strip()
            line_num = None
            ctx = []
            j = i + 1
            while j < len(lines) and j <= i + 3:
                if lines[j].startswith("l."):
                    m = re.match(r"l\.(\d+)", lines[j])
                    if m:
                        line_num = int(m.group(1))
                    ctx.append(lines[j].strip())
                    break
                elif lines[j].strip() and not lines[j].startswith("!"):
                    ctx.append(lines[j].strip())
                    break
                j += 1
            errors.append({
                "message": msg,
                "line": line_num,
                "context": "\n  ".join(ctx) if ctx else "",
            })
            i = j + 1
        else:
            i += 1

    if not errors:
        err_lines = re.findall(r"(?i)^(.*(error|undefined|missing).*)$", log_text)
        if err_lines:
            seen = set()
            for m in err_lines:
                s = m.strip()
                if s and s not in seen:
                    seen.add(s)
                    errors.append({"message": s, "line": None, "context": ""})
                if len(errors) >= 5:
                    break
        if not errors:
            errors = [{"message": "Compilation failed — no specific error found in log.", "line": None, "context": ""}]

    return errors


def parse_log_errors_text(log_text: str) -> str:
    """Parse LaTeX log and return human-readable error string."""
    errors = parse_log_errors(log_text)
    parts = []
    for e in errors:
        detail = e["message"]
        if e["context"]:
            detail += "\n  " + e["context"]
        parts.append(detail)
    return "\n\n".join(parts)


def _count_pages(log_text: str) -> int | None:
    nums = re.findall(r"\[(\d+)\s*\]", log_text)
    if nums:
        return max(int(n) for n in nums)
    m = re.search(r"\((\d+)\s+page", log_text)
    if m:
        return int(m.group(1))
    return None


def _patch_packages(content: str) -> str:
    content = re.sub(
        r"\\usepackage\[empty\]\{fullpage\}",
        r"\\usepackage[margin=1in]{geometry}",
        content,
    )
    content = re.sub(
        r"\\usepackage\{fullpage\}",
        r"\\usepackage[margin=1in]{geometry}",
        content,
    )
    content = re.sub(r"\\input\{glyphtounicode\}", "", content)
    content = re.sub(r"\\pdfgentounicode=1", "", content)
    content = re.sub(
        r"\\begin\{itemize\}[^}]*\}\s*\\end\{itemize\}",
        "",
        content,
    )
    content = re.sub(
        r"\\resumeSubHeadingListStart\s*\n\s*\n?\s*\\resumeSubHeadingListEnd",
        "",
        content,
    )
    content = re.sub(
        r"\\resumeItemListStart\s*\n\s*\n?\s*\\resumeItemListEnd",
        "",
        content,
    )
    return content


def parse_synctex_text(text: str) -> dict:
    """Parse synctex text content.

    Handles the real SyncTeX format:
      Input:LINE:FILE     — file index mapping
      x<file>,<line>:<x>,<y>  — character positions in scaled points (sp)
    """
    pages = {}
    files = {}
    current_page = 1

    for line in text.split("\n"):
        line = line.strip()
        if not line:
            continue

        if line.startswith("Input:"):
            rest = line[len("Input:"):]
            parts = rest.split(":", 1)
            if len(parts) == 2 and parts[0].isdigit():
                files[int(parts[0])] = parts[1]
        elif line.startswith("Page:"):
            try:
                current_page = int(line.split(":")[1])
            except (IndexError, ValueError):
                pass
        elif line.startswith("Content:"):
            pass
        elif len(line) > 1 and line[0] == "x":
            try:
                after_x = line[1:]
                file_line, coords = after_x.split(":", 1)
                file_id_str, line_str = file_line.split(",", 1)
                file_id = int(file_id_str)
                line_num = int(line_str)
                x_sp, y_sp = coords.split(",", 1)
                x = float(x_sp) / 65536.0
                y = float(y_sp) / 65536.0

                file_path = files.get(file_id, "")
                pages.setdefault(current_page, []).append({
                    "x": x, "y": y,
                    "line": line_num, "file": file_path,
                })
            except (ValueError, IndexError):
                pass

    return {"pages": pages}


def load_synctex(tmpdir: Path, jobname: str) -> dict:
    """Load synctex data from the compilation temp directory."""
    gz_path = tmpdir / f"{jobname}.synctex.gz"
    if gz_path.exists():
        try:
            import gzip
            with gzip.open(gz_path, "rt", encoding="utf-8", errors="replace") as f:
                return parse_synctex_text(f.read())
        except Exception:
            pass

    json_path = tmpdir / f"{jobname}.synctex.json"
    if json_path.exists():
        try:
            data = json.loads(json_path.read_text(encoding="utf-8"))
            return data if isinstance(data, dict) and "pages" in data else {"pages": {}}
        except Exception:
            pass

    return {"pages": {}}


async def compile_latex(resume_id: int, latex_content: str) -> dict:
    pdflatex = shutil.which("pdflatex")
    if not pdflatex:
        mac_tex = "/Library/TeX/texbin/pdflatex"
        if Path(mac_tex).exists():
            pdflatex = mac_tex
    if not pdflatex:
        return {
            "success": False,
            "error": "pdflatex not found on system.",
            "hint": "Install TeX Live: brew install --cask mactex",
        }

    jobname = f"resume_{resume_id}"

    latex_content = _patch_packages(latex_content)

    with tempfile.TemporaryDirectory(prefix="resumate_") as tmpdir:
        src = Path(tmpdir) / f"{jobname}.tex"
        src.write_text(latex_content, encoding="utf-8")

        log_text = ""
        env = os.environ.copy()
        env["PATH"] = "/Library/TeX/texbin:" + env.get("PATH", "")
        for _ in range(2):
            proc = await asyncio.create_subprocess_exec(
                pdflatex,
                "-interaction=nonstopmode",
                "-halt-on-error",
                "-synctex=1",
                f"-jobname={jobname}",
                str(src),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=tmpdir,
                env=env,
            )
            await proc.communicate()

            log_file = Path(tmpdir) / f"{jobname}.log"
            if log_file.exists():
                log_text = log_file.read_text(encoding="utf-8", errors="replace")

            if proc.returncode != 0 and "Emergency stop" in log_text:
                break

            if not (Path(tmpdir) / f"{jobname}.aux").exists():
                break

        compiled_pdf = Path(tmpdir) / f"{jobname}.pdf"
        final_pdf = COMPILED_DIR / f"{resume_id}.pdf"

        if compiled_pdf.exists():
            shutil.copy2(compiled_pdf, final_pdf)

            synctex_data = load_synctex(Path(tmpdir), jobname)
            synctex_json = COMPILED_DIR / f"{resume_id}.synctex.json"
            try:
                synctex_json.write_text(json.dumps(synctex_data), encoding="utf-8")
            except Exception:
                pass

            return {
                "success": True,
                "pdf_path": str(final_pdf),
                "pages": _count_pages(log_text),
                "errors": [],
            }

        structured_errors = parse_log_errors(log_text)
        error_msg = parse_log_errors_text(log_text)
        hint = ""
        if "Undefined control sequence" in error_msg:
            hint = "You used a command that doesn't exist. Check for typos in \\command names."
        elif "Missing" in error_msg and "inserted" in error_msg:
            hint = "You're missing a closing brace } somewhere."
        elif "Emergency stop" in log_text:
            hint = "LaTeX hit a fatal error early. Check the first few lines of your document."

        return {
            "success": False,
            "error": error_msg,
            "hint": hint,
            "errors": [e for e in structured_errors if e.get("line")],
        }
