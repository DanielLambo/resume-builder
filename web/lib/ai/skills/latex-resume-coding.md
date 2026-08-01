# LaTeX Resume Coding Skill

Specialist craft for editing Typesetter resumes. Treat every vibe edit as surgical TeX coding — not prose rewriting in a vacuum.

## Non-negotiables

- Output a **full** compilable document: `\documentclass` … `\begin{document}` … `\end{document}`.
- Prefer the **smallest correct diff**. Do not restyle the whole resume when asked to change one bullet.
- Preserve preamble, packages, `\newcommand` / `\renewcommand` macros, geometry, and custom helpers (`\headerblock`, `\entry`, etc.) unless the user explicitly asks to change layout.
- Preserve section titles character-for-character unless asked to rename a section.
- Never emit `\write18`, `\immediate`, `\openout`, `\input{...}`, `\include`, or shell escapes.
- Do not wrap JSON or TeX in markdown fences.

## Document anatomy (Typesetter templates)

Typical shape:

```tex
\documentclass[11pt,letterpaper]{article}
% preamble: geometry, fontenc, lmodern, hyperref, enumitem, custom macros
\begin{document}
\headerblock{Name}{email $\cdot$ phone $\cdot$ links}
\section*{Education}
\entry{School}{Date}{Degree; GPA ...}
\begin{itemize}
  \item ...
\end{itemize}
\section*{Experience|Projects|Skills}
...
\end{document}
```

- Match the **existing** item command shape (`\item` vs project-specific macros). Do not invent a new list style mid-document.
- Keep `\hfill`, `$\cdot$`, and `\\` spacing idioms already used in neighboring entries.
- Skills lines often use `\textbf{Label:} a, b, c\quad` — extend that pattern; do not convert to a new table/layout.

## Escaping & specials (common compile killers)

When inserting user or JD text into TeX:

| Char | Safe form in prose |
| --- | --- |
| `&` | `\&` |
| `%` | `\%` |
| `$` | `\$` (unless intentional math) |
| `#` | `\#` |
| `_` | `\_` |
| `{` `}` | `\{` `\}` when literal |
| `~` | `\textasciitilde{}` or `$\sim$` for approximate |
| `^` | `\^{}` / math mode |

- Money: `\$2.4k` not `$2.4k` (unbalanced `$` breaks compile).
- Percent: `18\%` not `18%`.
- Keep existing math delimiters balanced; never leave an odd number of unescaped `$`.
- URLs belong in `\href{url}{label}` or plain text already used by the template — do not invent fragile catcode tricks.

## Surgical edit patterns

### Add a skill / tool
- Locate the Skills (or equivalent) section.
- Append to the correct `\textbf{...:}` group if one exists.
- Keep comma spacing consistent with neighbors (`Python, TypeScript, SQL`).
- Do not duplicate a tool already listed.

### Add / rewrite a bullet
- Clone the nearest `\item` cadence (verb + object + optional tool/impact).
- One claim per bullet; ~105–125 characters of printed text when possible.
- Escape specials in new prose only; leave untouched bullets byte-identical.

### Rename a field
- Change only the requested name/email/phone/URL/school/employer.
- Leave every unaffected line byte-identical.

### Fix compile / syntax
- Minimal diff to restore compilability.
- Typical fixes: escape `& % $ _`, close missing `}`, balance `$`, restore dropped `\end{itemize}` / `\end{document}`.
- Do not "improve" voice while repairing TeX.

### Tighten for one page
- Micro-condense the wordiest bullets (~5–15%).
- Protect metrics, proper nouns, and tools.
- Do not delete whole roles unless asked.

## Macro hygiene

- If the resume defines `\entry{title}{date}{subtitle}`, keep calling `\entry` — do not expand it into raw `\textbf`/`\textit` unless the file already mixes styles.
- Do not redefine `\section`, `\item`, or geometry mid-edit.
- Do not switch `\documentclass` options (font size, paper) unless asked — validators reject surprise class changes.

## Tailor / JD edits

- Reorder bullets (and optionally entries) so the strongest honest JD matches float first.
- Elevate overlapping tools into Skills only when already evidenced in bullets/entries.
- Never keyword-stuff the JD into every bullet.
- Never invent employers, metrics, or tools from the posting alone.

## Self-check before returning JSON

1. Full document still has `\documentclass`, `\begin{document}`, `\end{document}`.
2. Section count did not collapse to zero.
3. No blocked shell/input commands.
4. `$` count is even (unescaped).
5. New `& % _` in prose are escaped.
6. Diff matches the user prompt — nothing "helpfully" rewritten outside scope.
7. Reply names the concrete TeX/content change (or full review in review mode).
