/** Default structured resume payload stored in resumes.data_json */
export type ResumeDataJson = {
  latex: string;
  template: string;
  version: number;
};

export const DEFAULT_RESUME_TITLE = "Untitled Resume";

export const DEFAULT_RESUME_LATEX = String.raw`\documentclass[11pt,letterpaper]{article}
\usepackage[margin=0.6in]{geometry}
\usepackage[T1]{fontenc}
\usepackage{lmodern}
\usepackage{hyperref}
\usepackage{parskip}

\pagestyle{empty}
\begin{document}
\begin{center}
  {\LARGE\bfseries Your Name}\\[0.35em]
  {\small you@email.com $\cdot$ linkedin.com/in/you}
\end{center}

\section*{Summary}
Backend engineer focused on reliable APIs and clear writing.

\section*{Experience}
\textbf{Software Engineer} \hfill Remote\\
\textit{Company} \quad 2024 -- Present
\begin{itemize}
  \item Shipped features used by thousands of users weekly.
  \item Cut p99 latency with targeted query and cache work.
\end{itemize}

\section*{Education}
\textbf{B.S.\ Computer Science} \hfill 2025\\
\textit{State University}

\section*{Skills}
Python, TypeScript, SQL, Docker
\end{document}
`;

export function createDefaultResumeData(): ResumeDataJson {
  return {
    latex: DEFAULT_RESUME_LATEX,
    template: "blank",
    version: 1,
  };
}

export function getLatexFromDataJson(data: unknown): string {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return DEFAULT_RESUME_LATEX;
  }
  const latex = (data as { latex?: unknown }).latex;
  return typeof latex === "string" && latex.trim() ? latex : DEFAULT_RESUME_LATEX;
}
