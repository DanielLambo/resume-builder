import { sanitizeLatex } from "@resumate/one-page-lock";

import { HOUSE_LATEX_PREAMBLE } from "@/lib/resume-template";
import { latexValidationError } from "@/lib/import/validate";

export type TexPlan =
  | { mode: "passthrough"; latex: string }
  | { mode: "jake"; latex: string }
  | { mode: "rewrite"; source: string; reason: string };

const STANDARD_CLASS =
  /\\documentclass(?:\[[^\]]*\])?\{(article|extarticle|report|letter)\}/i;

const JAKE_MARKERS =
  /\\resumeItem\b|\\resumeSubheading\b|\\resumeSubHeadingListStart\b|\\resumeProjectHeading\b/;

const NEEDS_REWRITE =
  /\\usepackage\{fontspec\}|\\setmainfont|\\documentclass(?:\[[^\]]*\])?\{(awesome-cv|moderncv|altacv|resume|cv)\}|\\input\{(?!glyphtounicode)/i;

/**
 * Soften common Jake-template paste issues before conversion.
 * Unwraps nested font commands and strips files this host cannot load.
 */
export function softenJakeSource(src: string): string {
  let s = src;

  s = s.replace(/\\input\{glyphtounicode\}/gi, "");
  s = s.replace(/\\pdfgentounicode\s*=\s*1/gi, "");
  s = s.replace(/\\href\{\}\s*\{([^{}]*)\}/g, "$1");

  for (const cmd of ["textbf", "textit", "emph", "underline", "scshape", "bfseries"]) {
    let prev = "";
    while (prev !== s) {
      prev = s;
      s = s.replace(new RegExp(`\\\\${cmd}\\{([^{}]*)\\}`, "g"), "$1");
    }
  }

  s = s.replace(
    /\{\s*(\\(?:resumeItem|resumeSubheading|resumeProjectHeading|resumeItemListStart|resumeSubHeadingListStart)\b)/g,
    "$1",
  );
  s = s.replace(/\|\s*\|/g, "|");

  return s;
}

function extractBraced(src: string, openIdx: number): { inner: string; end: number } | null {
  if (src[openIdx] !== "{") return null;
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    const ch = src[i];
    if (ch === "\\" && i + 1 < src.length) {
      i += 1;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return { inner: src.slice(openIdx + 1, i), end: i + 1 };
      }
    }
  }
  return null;
}

function replaceCommand(
  src: string,
  name: string,
  arity: number,
  replacer: (...args: string[]) => string,
): string {
  const needle = `\\${name}`;
  let out = "";
  let i = 0;
  while (i < src.length) {
    const idx = src.indexOf(needle, i);
    if (idx === -1) {
      out += src.slice(i);
      break;
    }
    const after = src[idx + needle.length];
    if (after && /[A-Za-z*]/.test(after)) {
      out += src.slice(i, idx + needle.length);
      i = idx + needle.length;
      continue;
    }
    out += src.slice(i, idx);
    let pos = idx + needle.length;
    const args: string[] = [];
    let ok = true;
    for (let a = 0; a < arity; a += 1) {
      while (pos < src.length && /\s/.test(src[pos] ?? "")) pos += 1;
      if (src[pos] !== "{") {
        ok = false;
        break;
      }
      const extracted = extractBraced(src, pos);
      if (!extracted) {
        ok = false;
        break;
      }
      args.push(extracted.inner);
      pos = extracted.end;
    }
    if (!ok) {
      out += src.slice(idx, idx + 1);
      i = idx + 1;
      continue;
    }
    out += replacer(...args);
    i = pos;
  }
  return out;
}

function stripTexComments(src: string): string {
  return src
    .split("\n")
    .map((line) => {
      let out = "";
      for (let i = 0; i < line.length; i++) {
        if (line[i] === "%" && (i === 0 || line[i - 1] !== "\\")) {
          break;
        }
        out += line[i];
      }
      return out;
    })
    .join("\n");
}

/** Public for compile-time Jake detection (comments ignored). */
export function stripLatexComments(src: string): string {
  return stripTexComments(src);
}

/**
 * True when live (non-comment) source looks like Jake’s Resume template.
 */
export function looksLikeJakeTemplate(tex: string): boolean {
  const live = stripTexComments(tex);
  return (
    JAKE_MARKERS.test(live) ||
    /\\newcommand\{\\resumeItem\}/.test(live) ||
    /\\usepackage\[empty\]\{fullpage\}/.test(live) ||
    /\\resumeSubHeadingListStart/.test(live)
  );
}

function stripLeftoverJakeCommands(body: string): string {
  let next = body;
  // Second pass for macros that failed the first braced extract.
  next = replaceCommand(next, "resumeItem", 1, (text) => `\\item ${text.trim()}`);
  next = replaceCommand(next, "resumeSubItem", 1, (text) => `\\item ${text.trim()}`);
  next = replaceCommand(
    next,
    "resumeSubheading",
    4,
    (org, dates, title, loc) => {
      const subtitle = [title.trim(), loc.trim()].filter(Boolean).join(" $\\cdot$ ");
      return `\\entry{${org.trim()}}{${dates.trim()}}{${subtitle}}`;
    },
  );
  next = replaceCommand(next, "resumeProjectHeading", 2, (heading, dates) => {
    const plain = heading.replace(/\\[a-zA-Z]+\{([^{}]*)\}/g, "$1").replace(/\s+/g, " ").trim();
    return `\\entry{${plain}}{${dates.trim()}}{}`;
  });
  next = next.replace(
    /\\resume(?:SubHeadingListStart|SubHeadingListEnd|ItemListStart|ItemListEnd|SubItem)\b/g,
    "",
  );
  // Drop any remaining Jake command tokens so pdflatex doesn't choke.
  next = next.replace(/\\resume[A-Za-z]+\*?/g, "");
  return next;
}

function balanceTrailingBraces(tex: string): string {
  const delta = unescapedBraceDeltaForTex(tex);
  if (delta <= 0) return tex;
  return tex.replace(/\\end\{document\}/i, `${"}".repeat(delta)}\n\\end{document}`);
}

function unescapedBraceDeltaForTex(text: string): number {
  let opens = 0;
  let closes = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "\\" && i + 1 < text.length) {
      i += 1;
      continue;
    }
    if (text[i] === "{") opens += 1;
    else if (text[i] === "}") closes += 1;
  }
  return opens - closes;
}

/**
 * Always produce house-template LaTeX from a Jake paste (best effort).
 * Prefer this over failing the compile with an opaque error.
 */
export function jakeToHouseLatex(raw: string): string {
  const softened = softenJakeSource(stripTexComments(raw));
  const body = documentBody(softened) ?? softened;
  const { header, rest } = headerFromCenterBlock(body);
  const converted = stripLeftoverJakeCommands(convertJakeBody(rest));
  const latex = `${HOUSE_LATEX_PREAMBLE}
\\begin{document}
${header}
${converted}
\\end{document}
`;
  return balanceTrailingBraces(latex);
}

function documentBody(tex: string): string | null {
  const match = tex.match(/\\begin\{document\}([\s\S]*?)\\end\{document\}/i);
  return match?.[1]?.trim() ? match[1].trim() : null;
}

function convertJakeBody(body: string): string {
  let next = body;
  next = next.replace(/\\resumeSubHeadingListStart/g, "");
  next = next.replace(/\\resumeSubHeadingListEnd/g, "");
  next = next.replace(/\\resumeItemListStart/g, "\\begin{itemize}");
  next = next.replace(/\\resumeItemListEnd/g, "\\end{itemize}");
  next = replaceCommand(next, "resumeItem", 1, (text) => `\\item ${text.trim()}`);
  next = replaceCommand(
    next,
    "resumeSubheading",
    4,
    (org, dates, title, loc) => {
      const subtitle = [title.trim(), loc.trim()].filter(Boolean).join(" $\\cdot$ ");
      return `\\entry{${org.trim()}}{${dates.trim()}}{${subtitle}}`;
    },
  );
  next = replaceCommand(next, "resumeProjectHeading", 2, (heading, dates) => {
    const plain = heading
      .replace(/\\textbf\{([^}]*)\}/g, "$1")
      .replace(/\\emph\{([^}]*)\}/g, "$1")
      .replace(/\\textit\{([^}]*)\}/g, "$1")
      .replace(/\$\\mid\$|\$\|\$|\\textbar\{\}|\\textbar/g, "·")
      .replace(/\s+/g, " ")
      .trim();
    return `\\entry{${plain}}{${dates.trim()}}{}`;
  });
  next = next.replace(/\\section\*?\{/g, "\\section*{");
  next = next.replace(/\\subsection\*?\{/g, "\\subsection*{");
  next = next.replace(/\\vspace\*?\{[^}]*\}/g, "");
  next = next.replace(/\\hspace\*?\{[^}]*\}/g, " ");
  next = next.replace(/\\small\b/g, "");
  next = next.replace(/\\large\b/g, "");
  next = next.replace(/\\Large\b/g, "");
  next = next.replace(/\\huge\b/g, "");
  next = next.replace(/\\Huge\b/g, "");
  next = next.replace(/\\scshape\b/g, "");
  next = next.replace(/\\bfseries\b/g, "");
  next = next.replace(/\\raggedright\b/g, "");
  next = next.replace(/\\centering\b/g, "");
  next = next.replace(/\\hfill\b/g, " ");
  next = next.replace(/\\noindent\b/g, "");
  next = next.replace(/\\item\[\]/g, "\\item");
  return next.trim();
}

function stripInlineTex(value: string): string {
  return value
    .replace(/\\href\{[^}]*\}\{([^}]*)\}/g, "$1")
    .replace(/\\underline\{([^}]*)\}/g, "$1")
    .replace(/\\textbf\{([^}]*)\}/g, "$1")
    .replace(/\\textit\{([^}]*)\}/g, "$1")
    .replace(/\\emph\{([^}]*)\}/g, "$1")
    .replace(/\\(?:Huge|huge|Large|large|small|tiny|scshape|bfseries|mdseries)\b/g, "")
    .replace(/\$\|\$|\\textbar\{\}|\\textbar|\$\\mid\$/g, "·")
    .replace(/[{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function headerFromCenterBlock(body: string): { header: string; rest: string } {
  const match = body.match(/\\begin\{center\}([\s\S]*?)\\end\{center\}/i);
  if (!match || match.index === undefined) {
    return { header: "", rest: body };
  }
  const lines = match[1]
    .split(/\\\\/)
    .map((line) => stripInlineTex(line))
    .filter(Boolean);
  const name = lines[0] ?? "Your Name";
  const contact = lines
    .slice(1)
    .join(" · ")
    .split(/·|\|/)
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" $\\cdot$ ");
  const header = `\\headerblock{${name}}{${contact}}`;
  const rest = `${body.slice(0, match.index)}${body.slice(match.index + match[0].length)}`;
  return { header, rest };
}

export function planTexImport(raw: string): TexPlan {
  const stripped = stripTexComments(raw).trim();
  if (!stripped) {
    return { mode: "rewrite", source: raw, reason: "empty" };
  }

  const sanitized = sanitizeLatex(stripped);
  const source = sanitized.content;

  if (NEEDS_REWRITE.test(source) && !JAKE_MARKERS.test(source)) {
    return {
      mode: "rewrite",
      source,
      reason: "Custom class or extra files this compiler cannot load.",
    };
  }

  if (JAKE_MARKERS.test(source) || looksLikeJakeTemplate(source)) {
    const body = documentBody(softenJakeSource(source)) ?? softenJakeSource(source);
    const { header, rest } = headerFromCenterBlock(body);
    const converted = stripLeftoverJakeCommands(convertJakeBody(rest));
    const latex = balanceTrailingBraces(`${HOUSE_LATEX_PREAMBLE}
\\begin{document}
${header}
${converted}
\\end{document}
`);
    if (latexValidationError(latex) || /\\resume[A-Z]/.test(latex)) {
      // Still try best-effort house output rather than forcing an AI rewrite.
      const fallback = jakeToHouseLatex(source);
      if (!latexValidationError(fallback) && !/\\resume[A-Z]/.test(fallback)) {
        return { mode: "jake", latex: fallback };
      }
      return {
        mode: "rewrite",
        source,
        reason: "Jake-style macros could not be fully rewritten.",
      };
    }
    return { mode: "jake", latex };
  }

  if (STANDARD_CLASS.test(source) && !latexValidationError(source)) {
    return { mode: "passthrough", latex: source };
  }

  return {
    mode: "rewrite",
    source,
    reason: "Source needs to be set in the house template.",
  };
}
