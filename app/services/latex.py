import asyncio
import gzip
import json
import os
import shutil
import tempfile
import re
from pathlib import Path

from ..paths import MACTEX_BIN_DIR, find_pdflatex


def _flatten_multiline_commands(lines: list[str]) -> list[str]:
    """Join commands whose brace-args are spread across multiple lines.

    Handles the common pattern:
        \\resumeSubheading
        {Company}{Location}
        {Role}{Date}
    """
    out = []
    i = 0
    while i < len(lines):
        stripped = lines[i].strip()
        if re.fullmatch(r"\\(resumeSubheading|role)\s*", stripped):
            joined = stripped
            j = i + 1
            while j < len(lines) and lines[j].strip().startswith("{"):
                joined += lines[j].strip()
                j += 1
            out.append(joined)
            i = j
            continue
        out.append(lines[i])
        i += 1
    return out


def latex_to_compact(latex: str) -> str:
    """Convert LaTeX resume to compact token-efficient plain text.

    Strips LaTeX syntax and encodes structure with short delimiters.
    Saves ~3-5x tokens vs raw LaTeX on Groq.
    """
    lines = latex.split("\n")
    lines = _flatten_multiline_commands(lines)
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

        # moderncv \name{First Last} — set in preamble, rendered by \makecvtitle
        m = re.match(r"\\name\{(.+?)\}", stripped)
        if m:
            out.append(f"NAME {m.group(1)}")
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

        # Name header: \huge \scshape Name, {\LARGE\bfseries Name}
        if any(
            cmd in stripped
            for cmd in ("\\huge", "\\scshape", "\\LARGE", "\\Large", "\\large", "\\normalsize", "\\bfseries")
        ):
            name_text = re.sub(
                r"\\(?:huge|scshape|LARGE|Large|large|normalsize|vspace|textbf|textit|bfseries)\s*\{?[^}]*\}?\s*",
                "", stripped,
            )
            name_text = re.sub(r"\\+\s*\[.*?\]", "", name_text)
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

        # Skip structural brace wrappers like { and {\small (brace may be on next line)
        if stripped in ("}", "{") or re.fullmatch(r"\{\\(?:small|large|LARGE|huge|bfseries|normalsize)\s*(?:}|)", stripped):
            continue

        # Section headers
        m = re.match(r"\\(?:section|resumesection|resumeSection)\*?\{(.+?)\}", stripped)
        if m:
            out.append(f"SECTION {m.group(1)}")
            continue

        m = re.match(r"\\subsection\*?\{(.+?)\}", stripped)
        if m:
            out.append(f"SUBSECTION {m.group(1)}")
            continue

        # Subheading (4-arg, Jake style): \resumeSubheading{Company}{Location}{Role}{Date}
        m = re.match(r"\\resumeSubheading\{(.+?)\}\{(.+?)\}\{(.+?)\}\{(.+?)\}", stripped)
        if m:
            company, loc, role, dates = m.groups()
            out.append(f"@COMPANY {company}")
            out.append(f"@LOC {loc}")
            out.append(f"@ROLE {role}")
            out.append(f"@DATES {dates}")
            continue

        # Subheading (2-arg): \resumeSubheading{Title}{Date}
        m = re.match(r"\\resumeSubheading\{(.+?)\}\{(.+?)\}", stripped)
        if m:
            out.append(f"@COMPANY {m.group(1)}")
            out.append(f"@DATES {m.group(2)}")
            continue

        # Role (4-arg): \role{Company}{Role}{Dates}{Location}
        m = re.match(r"\\role\{(.+?)\}\{(.+?)\}\{(.+?)\}\{(.+?)\}", stripped)
        if m:
            company, role, dates, loc = m.groups()
            out.append(f"@COMPANY {company}")
            out.append(f"@ROLE {role}")
            out.append(f"@DATES {dates}")
            if loc.strip():
                out.append(f"@LOC {loc}")
            continue

        # Role (3-arg): \role{Title}{Company}{Details}
        m = re.match(r"\\role\{(.+?)\}\{(.+?)\}\{(.+?)\}", stripped)
        if m:
            title, company, details = m.groups()
            out.append(f"@TITLE {title}")
            out.append(f"@COMPANY {company}")
            out.append(f"@DETAILS {details}")
            continue

        # Bullet items: \resumeItem{label}{text} (2-arg) first
        m = re.match(r"\\resumeItem\{([^}]*)\}\{(.+)\}\s*$", stripped)
        if m:
            label, text = m.groups()
            out.append(f"- {label}: {text}" if label else f"- {text}")
            continue
        # Bullet items: \resumeItem{...} or \item text (1-arg)
        m = re.match(r"\\(?:resumeItem)\s*\{(.+)\}", stripped)
        if m:
            out.append(f"- {m.group(1)}")
            continue
        m = re.match(r"\\(?:item)\s+(.+)$", stripped)
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

        # Bare text — keep LaTeX escapes meaningful (e.g. \%, \quad, $...$)
        # and only convert \textbf{}/\textit{} to compact ** / * markers.
        cleaned = re.sub(r"\\textbf\{(.+?)\}", r"**\1**", stripped)
        cleaned = re.sub(r"\\textit\{(.+?)\}", r"*\1*", cleaned)
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        if cleaned:
            out.append(cleaned)

    return "\n".join(out)


# ── Document structure helpers ────────────────────────────────
SECTION_RE = re.compile(r"^\\(?:section|resumesection)\*?\{(.+?)\}")
HEADING_FIELD_RE = re.compile(r"^@(COMPANY|DATES|ROLE|LOC|TITLE|DETAILS)\s+(.*)$")


def split_document(latex: str) -> tuple[str, str] | tuple[None, None]:
    """Split a LaTeX document into (preamble, body).

    The preamble is everything before \\begin{document}. The body is the
    content between \\begin{document} and \\end{document} (exclusive).
    Returns (None, None) if the markers are missing/malformed.
    """
    begin_m = re.search(r"\\begin\{document\}", latex)
    end_m = re.search(r"\\end\{document\}", latex)
    if not begin_m or not end_m or end_m.start() < begin_m.end():
        return None, None
    return latex[:begin_m.start()], latex[begin_m.end():end_m.start()]


def extract_custom_commands(preamble: str) -> list[str]:
    """Find user-defined LaTeX commands/environments in a preamble."""
    commands = re.findall(r"\\(?:re)?newcommand\*?\s*\{\\([a-zA-Z]+)\}", preamble)
    commands += re.findall(r"\\newenvironment\*?\s*\{([a-zA-Z]+)\}", preamble)
    return sorted(set(commands))


def split_blocks(body: str) -> list[dict]:
    """Split a document body into blocks: a leading header block plus one
    block per \\section / \\resumesection section. Each block is
    {"kind": "header"|"section", "name": str|None, "lines": [str]}.
    """
    blocks = []
    current = {"kind": "header", "name": None, "lines": []}
    for line in body.split("\n"):
        m = SECTION_RE.match(line.strip())
        if m:
            if current["lines"] or current["kind"] == "section":
                blocks.append(current)
            current = {"kind": "section", "name": m.group(1), "lines": [line]}
        else:
            current["lines"].append(line)
    blocks.append(current)
    return blocks


def section_at_line(latex: str, line_num: int) -> str | None:
    """Return the nearest \\section / \\resumesection name at or above line_num (1-based)."""
    lines = latex.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    if line_num < 1:
        return None
    idx = min(line_num, len(lines)) - 1
    for i in range(idx, -1, -1):
        m = re.search(r"\\(?:resume)?section\*?\{([^}]+)\}", lines[i], flags=re.I)
        if m:
            return m.group(1).strip()
    return None


_DANGEROUS_PATTERNS = [
    (r"\\write18\b", r"\write18"),
    (r"\\ShellEscape\b", r"\ShellEscape"),
    (r"\\input\s*\{\s*/", r"\input{/…}"),
    (r"\\include\s*\{\s*/", r"\include{/…}"),
    (r"\\openout\b", r"\openout"),
    (r"\\immediate\s*\\write", r"\immediate\write"),
    (r"\\catcode\b", r"\catcode"),
]


def sanitize_latex(content: str) -> dict:
    """Block constructs that enable shell I/O even without -shell-escape."""
    hits = []
    for pat, label in _DANGEROUS_PATTERNS:
        if re.search(pat, content):
            hits.append(label)
    if hits:
        return {
            "ok": False,
            "error": "Blocked unsafe LaTeX: " + ", ".join(hits),
            "content": content,
        }
    return {"ok": True, "content": content, "error": ""}


def auto_page_fit(latex: str, aggressiveness: int = 1) -> str:
    """Tighten geometry / baselineskip / font to help fit one page.

    aggressiveness: 1 = mild margins, 2 = +smaller type, 3 = +tighter leading.
    Does not rewrite content — layout only.
    """
    content = latex
    margin = {1: "0.5in", 2: "0.45in", 3: "0.4in"}[max(1, min(3, aggressiveness))]
    if re.search(r"\\usepackage\[([^\]]*)\]\{geometry\}", content):
        content = re.sub(
            r"\\usepackage\[[^\]]*\]\{geometry\}",
            rf"\\usepackage[margin={margin}]{{geometry}}",
            content,
            count=1,
        )
    elif "\\usepackage{geometry}" in content:
        content = content.replace(
            "\\usepackage{geometry}",
            f"\\usepackage[margin={margin}]{{geometry}}",
            1,
        )
    elif re.search(r"\\usepackage\[empty\]\{fullpage\}", content):
        content = re.sub(
            r"\\usepackage\[empty\]\{fullpage\}",
            rf"\\usepackage[margin={margin}]{{geometry}}",
            content,
            count=1,
        )

    # Jake-style margin tweaks
    if "\\addtolength{\\oddsidemargin}" in content and aggressiveness >= 1:
        content = re.sub(
            r"\\addtolength\{\\oddsidemargin\}\{[^}]+\}",
            r"\\addtolength{\\oddsidemargin}{-0.6in}",
            content,
        )
        content = re.sub(
            r"\\addtolength\{\\evensidemargin\}\{[^}]+\}",
            r"\\addtolength{\\evensidemargin}{-0.6in}",
            content,
        )
        content = re.sub(
            r"\\addtolength\{\\textwidth\}\{[^}]+\}",
            r"\\addtolength{\\textwidth}{1.15in}",
            content,
        )

    if aggressiveness >= 2 and re.search(r"\\documentclass\[([^\]]*)\]", content):
        def _font(m):
            inner = re.sub(r"\d+pt", "10pt", m.group(1))
            if "10pt" not in inner and "9pt" not in inner:
                inner = "10pt," + inner
            return f"\\documentclass[{inner}]"

        content = re.sub(r"\\documentclass\[([^\]]*)\]", _font, content, count=1)

    if aggressiveness >= 3:
        if "\\baselineskip" not in content and "\\begin{document}" in content:
            content = content.replace(
                "\\begin{document}",
                "\\begin{document}\n\\setlength{\\baselineskip}{11.5pt}",
                1,
            )
        content = re.sub(
            r"\\itemsep\}\{[^}]+\}",
            r"\\itemsep}{0.05em}",
            content,
        )

    return content


def _scale_length_token(token: str, factor: float, floor: float | None = None) -> str:
    """Scale a LaTeX length like 0.7em / 12pt / -5pt by factor."""
    m = re.fullmatch(r"([+-]?(?:\d+\.?\d*|\.\d+))(em|ex|pt|in|mm|cm|mu)", token.strip())
    if not m:
        return token
    value = float(m.group(1)) * factor
    if floor is not None and abs(value) < floor and value != 0:
        value = floor if value > 0 else -floor
    unit = m.group(2)
    if abs(value - round(value)) < 1e-6:
        rendered = str(int(round(value)))
    else:
        rendered = f"{value:.2f}".rstrip("0").rstrip(".")
    return f"{rendered}{unit}"


def tighten_section_spacing(latex: str, factor: float = 0.55) -> str:
    """Pull sections/entries closer by shrinking vertical skips in the source.

    Compact AI edits cannot change preamble spacing — this is the deterministic
    path for 'make sections closer / less whitespace' requests.
    """
    content = latex
    factor = max(0.35, min(0.85, factor))

    def _vspace(m: re.Match) -> str:
        return f"\\vspace{{{_scale_length_token(m.group(1), factor, floor=0.12)}}}"

    # Body + preamble vspaces (section gaps, entry gaps, Jake negative skips)
    content = re.sub(r"\\vspace\{([^}]+)\}", _vspace, content)

    # Common list density knobs inside \newenvironment / setlength
    for key in ("itemsep", "parsep", "topsep", "partopsep"):
        pat = r"(\\setlength\{\\" + key + r"\}\{)([^}]+)(\})"
        content = re.sub(
            pat,
            lambda m, f=factor: m.group(1)
            + _scale_length_token(m.group(2), f, floor=0.0)
            + m.group(3),
            content,
        )

    # entrygap macro bodies often wrap a vspace — already scaled above.
    # Also shrink parskip if present.
    content = re.sub(
        r"(\\setlength\{\\parskip\}\{)([^}]+)(\})",
        lambda m: m.group(1) + _scale_length_token(m.group(2), factor, floor=0.0) + m.group(3),
        content,
    )

    return content


def _split_compact_sections(compact: str) -> dict[str, list[str]]:
    """Parse compact text into {section_name: [lines]}. Lines before the
    first SECTION marker are grouped under the key None (header content).
    """
    sections = {}
    current_key = None
    for line in compact.split("\n"):
        stripped = line.strip()
        if not stripped:
            continue
        m = SECTION_RE.match(stripped) or re.match(r"^SECTION\s+(.+)$", stripped)
        if m:
            current_key = m.group(1).strip()
            sections.setdefault(current_key, [])
        else:
            if current_key is None:
                current_key = "HEADER"
                sections.setdefault(current_key, [])
            sections[current_key].append(stripped)
    return sections


def compact_to_latex_block(block: dict, compact_lines: list[str]) -> list[str]:
    """Rebuild a LaTeX section block from compact lines, using the command
    style detected in the original block. Returns LaTeX lines.
    """
    # Normalize CRLF from uploads / Windows editors so indent detection stays clean.
    bl = [ln.replace("\r", "") for ln in block["lines"]]
    # Flatten so \resumeSubheading\n{...}{...} is detectable
    orig = "\n".join(_flatten_multiline_commands(bl))

    has_resume_item = "\\resumeItem{" in orig
    has_resume_sub = "\\resumeSubheading{" in orig or re.search(r"\\resumeSubheading\s*$", orig, re.M)
    has_role = "\\role{" in orig
    has_entrygap = "\\entrygap" in orig
    has_item_list = "\\resumeItemListStart" in orig
    has_sub_list = "\\resumeSubHeadingListStart" in orig

    sub_multiline = any(
        re.fullmatch(r"\\resumeSubheading\s*", l.strip()) for l in bl
    )

    blank_before_heading = any(
        bl[i].strip() == ""
        and re.fullmatch(r"\\(?:resumeSubheading|role)\s*", bl[i + 1].strip())
        for i in range(len(bl) - 1)
    )

    sub_args = 0
    if has_resume_sub:
        m = re.search(r"\\resumeSubheading\{(.+?)\}\{(.+?)\}\{(.+?)\}\{(.+?)\}", orig)
        if m:
            sub_args = 4
        else:
            m = re.search(r"\\resumeSubheading\{(.+?)\}\{(.+?)\}", orig)
            if m:
                sub_args = 2
        if sub_args == 0 and sub_multiline:
            sub_args = 4
    role_args = 0
    if has_role:
        m = re.search(r"\\role\{(.+?)\}\{(.+?)\}\{(.+?)\}\{(.+?)\}", orig)
        if m:
            role_args = 4
        else:
            m = re.search(r"\\role\{(.+?)\}\{(.+?)\}\{(.+?)\}", orig)
            if m:
                role_args = 3

    item_env = None
    for env in ("resumeitemize", "itemize", "enumerate"):
        if f"\\begin{{{env}}}" in orig:
            item_env = env
            break

    # Jake-style \resumeItem expands to \item — must live inside a list.
    if has_resume_item and not has_item_list and not item_env:
        has_item_list = True

    bullet_cmd = "\\resumeItem" if has_resume_item else "\\item"
    resume_item_args = 2 if re.search(r"\\resumeItem\{[^}]*\}\{", orig) else 1

    item_indent = "        "
    m = re.search(r"^([ \t]*)\\(?:item|resumeItem)\b", orig, re.M)
    if m:
        item_indent = m.group(1)

    item_list_indent = "      "
    m = re.search(r"^([ \t]*)\\resumeItemListStart", orig, re.M)
    if m:
        item_list_indent = m.group(1)

    sub_list_indent = "  "
    m = re.search(r"^([ \t]*)\\resumeSubHeadingListStart", orig, re.M)
    if m:
        sub_list_indent = m.group(1)

    sub_indent = "    "
    m = re.search(r"^([ \t]*)\\resumeSubheading\b", orig, re.M)
    if m:
        sub_indent = m.group(1)

    out_lines = []
    # Keep the section header line verbatim
    if block["kind"] == "section" and bl:
        out_lines.append(bl[0])
    elif block["kind"] == "header":
        return block["lines"]

    if has_sub_list:
        out_lines.append(f"{sub_list_indent}\\resumeSubHeadingListStart")

    items = []
    heading_group = []  # pending @-prefixed heading fields
    prev_heading_emitted = False
    items_flushed = False

    def flush_heading():
        nonlocal heading_group, prev_heading_emitted, items_flushed
        if not heading_group:
            return
        fields = {f: v.strip() for f, v in heading_group}
        heading_group = []
        if has_entrygap and prev_heading_emitted:
            out_lines.append("\\entrygap")
        elif blank_before_heading and items_flushed:
            out_lines.append("")
        items_flushed = False
        prev_heading_emitted = True
        if has_resume_sub and sub_args == 4:
            company, loc = fields.get("COMPANY", ""), fields.get("LOC", "")
            role, dates = fields.get("ROLE", ""), fields.get("DATES", "")
            if sub_multiline:
                out_lines.append(f"{sub_indent}\\resumeSubheading")
                out_lines.append(f"{sub_indent}  {{{company}}}{{{loc}}}")
                out_lines.append(f"{sub_indent}  {{{role}}}{{{dates}}}")
            else:
                out_lines.append(
                    f"{sub_indent}\\resumeSubheading{{{company}}}{{{loc}}}{{{role}}}{{{dates}}}"
                )
        elif has_resume_sub:
            out_lines.append(
                f"{sub_indent}\\resumeSubheading{{{fields.get('COMPANY', '')}}}{{{fields.get('DATES', '')}}}"
            )
        elif has_role and role_args == 4:
            out_lines.append(
                f"\\role{{{fields.get('COMPANY', '')}}}{{{fields.get('ROLE', '')}}}"
                f"{{{fields.get('DATES', '')}}}{{{fields.get('LOC', '')}}}"
            )
        elif has_role:
            out_lines.append(
                f"\\role{{{fields.get('TITLE', '')}}}{{{fields.get('COMPANY', '')}}}"
                f"{{{fields.get('DETAILS', '')}}}"
            )
        else:
            parts = [fields[k] for k in ("COMPANY", "DATES", "ROLE", "LOC") if fields.get(k)]
            out_lines.append(" \\hfill ".join(parts))

    def flush_items():
        nonlocal items, items_flushed
        if not items:
            return
        items_flushed = True
        rendered = []
        for content in items:
            if has_resume_item and resume_item_args == 2:
                fm = re.match(r"^(.*?):\s*(.*)$", content, re.S)
                label, rest = (fm.group(1), fm.group(2)) if fm else ("", content)
                rendered.append(f"{item_indent}\\resumeItem{{{label}}}{{{rest}}}")
            elif has_resume_item:
                rendered.append(f"{item_indent}\\resumeItem{{{content}}}")
            else:
                rendered.append(f"{item_indent}\\item {content}")
        if has_item_list:
            out_lines.append(f"{item_list_indent}\\resumeItemListStart")
            out_lines.extend(rendered)
            out_lines.append(f"{item_list_indent}\\resumeItemListEnd")
        elif item_env:
            out_lines.append(f"\\begin{{{item_env}}}")
            out_lines.extend(rendered)
            out_lines.append(f"\\end{{{item_env}}}")
        else:
            out_lines.extend(rendered)
        items = []

    for line in compact_lines:
        stripped = line.strip()
        if not stripped:
            continue
        m = SECTION_RE.match(stripped) or re.match(r"^SECTION\s+(.+)$", stripped)
        if m:
            continue
        if stripped.startswith("@") and HEADING_FIELD_RE.match(stripped):
            flush_items()
            fm = HEADING_FIELD_RE.match(stripped)
            field, value = fm.group(1), fm.group(2)
            # New entry starts when the same lead field repeats (@TITLE…@TITLE or @COMPANY…@COMPANY).
            # Do NOT flush on @COMPANY after @TITLE — that's the 3-arg \role style.
            if field == "TITLE" and any(f == "TITLE" for f, _ in heading_group):
                flush_heading()
            elif field == "COMPANY" and any(f == "COMPANY" for f, _ in heading_group):
                flush_heading()
            heading_group.append((field, value))
            continue

        if stripped.startswith("- "):
            if heading_group:
                flush_heading()
            items.append(stripped[2:])
            continue

        # Non-heading, non-bullet line → flush pending groups
        if heading_group:
            flush_heading()
        if items:
            flush_items()

        if stripped == "\\\\":
            out_lines.append("\\\\")
            continue
        # Bold markers **text** → \textbf{text}
        cleaned = re.sub(r"\*\*(.+?)\*\*", r"\\textbf{\1}", stripped)
        out_lines.append(cleaned)

    if heading_group:
        flush_heading()
    if items:
        flush_items()

    if has_sub_list:
        out_lines.append(f"{sub_list_indent}\\resumeSubHeadingListEnd")

    # Collapse consecutive blank lines
    result = []
    for line in out_lines:
        if line.strip() == "" and result and result[-1].strip() == "":
            continue
        result.append(line)

    # Preserve the block's trailing blank-line separation
    trailing_blanks = 0
    for ln in reversed(bl):
        if ln.strip() == "":
            trailing_blanks += 1
        else:
            break
    while result and result[-1].strip() == "":
        result.pop()
    result.extend([""] * trailing_blanks)
    return result


def apply_compact_sections(latex: str, compact: str) -> str:
    """Apply AI edits expressed as compact section text to a LaTeX document.

    The preamble and the header block (before the first section) are always
    preserved verbatim. Only sections that appear in the compact text are
    rebuilt; all others are kept exactly as-is.
    """
    preamble, body = split_document(latex)
    if preamble is None or body is None:
        return latex

    new_sections = _split_compact_sections(compact)
    blocks = split_blocks(body)

    new_body_lines = []
    for block in blocks:
        if block["kind"] == "header":
            new_body_lines.extend(block["lines"])
            continue
        name = block["name"]
        if name in new_sections:
            new_body_lines.extend(compact_to_latex_block(block, new_sections[name]))
        else:
            new_body_lines.extend(block["lines"])

    return _replace_body(latex, "\n".join(new_body_lines))


def apply_ai_body(latex: str, ai_output: str) -> str:
    """Splice the AI's document body into the original preamble.

    Preserves the user's preamble and custom command definitions; only the
    body between \\begin{document} and \\end{document} is taken from the AI.
    """
    begin_m = re.search(r"\\begin\{document\}", ai_output)
    end_m = re.search(r"\\end\{document\}", ai_output)
    if not begin_m or not end_m:
        return ai_output

    body = ai_output[begin_m.end():end_m.start()]
    return _replace_body(latex, body)


def _replace_body(latex: str, new_body: str) -> str:
    """Replace the body of a LaTeX document in-place, preserving all other
    text (including whitespace around the \\begin/\\end markers) exactly.
    Falls back to returning `latex` if the markers can't be found.
    """
    begin_m = re.search(r"\\begin\{document\}", latex)
    end_m = re.search(r"\\end\{document\}", latex)
    if not begin_m or not end_m or end_m.start() < begin_m.end():
        return latex
    orig_body = latex[begin_m.end():end_m.start()]
    leading = len(orig_body) - len(orig_body.lstrip("\n"))
    trailing = len(orig_body) - len(orig_body.rstrip("\n"))
    return (
        latex[:begin_m.end()]
        + "\n" * leading
        + new_body.strip("\n")
        + "\n" * trailing
        + latex[end_m.start():]
    )


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
    r"""Parse synctex text content.

    Handles the real SyncTeX format:
      Input:LINE:FILE     — file index mapping
      x|g|k|h|$\ldots<form>,<line>:<x>,<y>  — positions in scaled points (sp)

    Coordinates are PDF points with origin at the TOP-LEFT (y grows downward).
    """
    pages: dict[int, list] = {}
    files: dict[int, str] = {}
    current_page = 1
    main_file_ids: set[int] = set()

    for line in text.split("\n"):
        line = line.strip()
        if not line:
            continue

        if line.startswith("Input:"):
            rest = line[len("Input:"):]
            parts = rest.split(":", 1)
            if len(parts) == 2 and parts[0].isdigit():
                fid = int(parts[0])
                fpath = parts[1]
                files[fid] = fpath
                # Prefer the job's .tex (not .cls/.sty)
                if fpath.endswith(".tex") and "/texmf" not in fpath.replace("\\", "/"):
                    main_file_ids.add(fid)
        elif line.startswith("Page:"):
            try:
                current_page = int(line.split(":")[1])
            except (IndexError, ValueError):
                pass
        elif line.startswith("Content:"):
            pass
        elif len(line) > 1 and line[0] in "xgkh$":
            try:
                after = line[1:]
                file_line, coords = after.split(":", 1)
                file_id_str, line_str = file_line.split(",", 1)
                file_id = int(file_id_str)
                line_num = int(line_str)
                # Skip package / class sources — only map the resume .tex
                if main_file_ids and file_id not in main_file_ids:
                    continue
                x_sp, y_sp = coords.split(",", 1)[:2]
                # Some records append more fields after y — take first two
                y_sp = y_sp.split(",")[0]
                x = float(x_sp) / 65536.0
                y = float(y_sp) / 65536.0

                file_path = files.get(file_id, "")
                pages.setdefault(current_page, []).append({
                    "x": x, "y": y,
                    "line": line_num, "file": file_path,
                })
            except (ValueError, IndexError):
                pass

    # JSON object keys must be strings for the frontend
    return {"pages": {str(k): v for k, v in pages.items()}}


def load_synctex(tmpdir: Path, jobname: str) -> dict:
    """Load synctex data from the compilation temp directory."""
    gz_path = tmpdir / f"{jobname}.synctex.gz"
    if gz_path.exists():
        try:
            with gzip.open(gz_path, "rt", encoding="utf-8", errors="replace") as f:
                return parse_synctex_text(f.read())
        except Exception:
            pass

    json_path = tmpdir / f"{jobname}.synctex.json"
    if json_path.exists():
        try:
            data = json.loads(json_path.read_text(encoding="utf-8"))
            if isinstance(data, dict) and "pages" in data:
                # Normalize keys to strings
                pages = data["pages"]
                data["pages"] = {str(k): v for k, v in pages.items()}
                return data
            return {"pages": {}}
        except Exception:
            pass

    return {"pages": {}}


_compile_locks: dict[str, asyncio.Lock] = {}
_locks_guard = asyncio.Lock()


async def _lock_for(job_id: str | int) -> asyncio.Lock:
    key = str(job_id)
    async with _locks_guard:
        lock = _compile_locks.get(key)
        if lock is None:
            lock = asyncio.Lock()
            _compile_locks[key] = lock
        return lock


async def _compile_latex_unlocked(
    job_id: str | int,
    latex_content: str,
    *,
    auto_fit: bool = False,
    max_pages: int = 1,
) -> dict:
    safe = sanitize_latex(latex_content)
    if not safe["ok"]:
        return {
            "success": False,
            "error": safe["error"],
            "hint": "Remove shell/file I/O commands from your source.",
            "errors": [],
        }

    pdflatex = find_pdflatex()
    if not pdflatex:
        return {
            "success": False,
            "error": "pdflatex not found on system.",
            "hint": "Install TeX Live: brew install --cask mactex",
        }

    working = safe["content"]
    fitted_level = 0
    last_result = None

    for attempt in range(1, 5 if auto_fit else 2):
        if attempt > 1 and auto_fit:
            fitted_level = attempt - 1
            working = auto_page_fit(safe["content"], aggressiveness=fitted_level)

        result = await _run_pdflatex(job_id, working, pdflatex)
        last_result = result
        if not result.get("success"):
            return result

        pages = result.get("pages") or 1
        result["latex_content"] = working
        result["auto_fit_level"] = fitted_level if fitted_level else None
        if not auto_fit or pages <= max_pages or fitted_level >= 3:
            return result

    return last_result or {"success": False, "error": "Compile failed", "errors": []}


async def _run_pdflatex(job_id: str | int, latex_content: str, pdflatex: str) -> dict:
    safe_id = re.sub(r"[^A-Za-z0-9_-]", "", str(job_id))[:40] or "job"
    jobname = f"resume_{safe_id}"
    latex_content = _patch_packages(latex_content)

    with tempfile.TemporaryDirectory(prefix="resumate_") as tmpdir:
        src = Path(tmpdir) / f"{jobname}.tex"
        src.write_text(latex_content, encoding="utf-8")

        log_text = ""
        env = os.environ.copy()
        env["PATH"] = f"{MACTEX_BIN_DIR}:" + env.get("PATH", "")
        for _ in range(2):
            proc = await asyncio.create_subprocess_exec(
                pdflatex,
                "-interaction=nonstopmode",
                "-halt-on-error",
                "-no-shell-escape",
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

        if compiled_pdf.exists():
            return {
                "success": True,
                "pdf_bytes": compiled_pdf.read_bytes(),
                "synctex": load_synctex(Path(tmpdir), jobname),
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


async def compile_latex(
    job_id: str | int,
    latex_content: str,
    *,
    auto_fit: bool = False,
    max_pages: int = 1,
) -> dict:
    """Compile LaTeX ephemerally. Returns pdf_bytes + synctex in memory (no durable store)."""
    lock = await _lock_for(job_id)
    async with lock:
        return await _compile_latex_unlocked(
            job_id,
            latex_content,
            auto_fit=auto_fit,
            max_pages=max_pages,
        )
