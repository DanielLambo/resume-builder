import asyncio
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


def parse_log_errors(log_text: str) -> str:
    errors = []
    lines = log_text.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i]
        if line.startswith("!"):
            msg = line.lstrip("! ").strip()
            ctx = []
            j = i + 1
            while j < len(lines) and j <= i + 3:
                if lines[j].startswith("l."):
                    ctx.append(lines[j].strip())
                    break
                elif lines[j].strip() and not lines[j].startswith("!"):
                    ctx.append(lines[j].strip())
                    break
                j += 1
            detail = msg
            if ctx:
                detail += "\n  " + "\n  ".join(ctx)
            errors.append(detail)
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
                    errors.append(s)
                if len(errors) >= 5:
                    break
        if not errors:
            errors = ["Compilation failed — no specific error found in log."]

    return "\n\n".join(errors)


def _count_pages(log_text: str) -> int | None:
    nums = re.findall(r"\[(\d+)\s*\]", log_text)
    return max(int(n) for n in nums) if nums else None


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
            return {
                "success": True,
                "pdf_path": str(final_pdf),
                "pages": _count_pages(log_text),
            }

        error_msg = parse_log_errors(log_text)
        hint = ""
        if "Undefined control sequence" in error_msg:
            hint = "You used a command that doesn't exist. Check for typos in \\command names."
        elif "Missing" in error_msg and "inserted" in error_msg:
            hint = "You're missing a closing brace } somewhere."
        elif "Emergency stop" in log_text:
            hint = "LaTeX hit a fatal error early. Check the first few lines of your document."

        return {"success": False, "error": error_msg, "hint": hint}
