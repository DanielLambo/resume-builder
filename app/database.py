import aiosqlite
from pathlib import Path
from contextlib import asynccontextmanager

DB_PATH = Path(__file__).parent.parent / "storage" / "resume_builder.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS resumes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    latex_content TEXT NOT NULL DEFAULT '',
    compiled_path TEXT,
    chat_history TEXT NOT NULL DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    latex_content TEXT NOT NULL
);
"""

MIGRATIONS = [
    "ALTER TABLE resumes ADD COLUMN chat_history TEXT NOT NULL DEFAULT '[]'",
]

SEED_TEMPLATES = [
    {
        "name": "Blank",
        "description": "Start from scratch",
        "latex_content": r"""\documentclass[11pt,letterpaper]{article}
\usepackage[margin=0.6in]{geometry}
\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}
\usepackage{lmodern}
\usepackage{xcolor}
\usepackage{hyperref}
\usepackage{parskip}

\definecolor{accent}{HTML}{1a365d}
\definecolor{muted}{HTML}{4a5568}

\newcommand{\resumesection}[1]{%
  \par\vspace{0.7em}%
  {\large\bfseries\color{accent}#1}\par
  \vspace{-0.35em}%
  \textcolor{accent}{\rule{\textwidth}{0.6pt}}\par
  \vspace{0.35em}%
}

\newcommand{\role}[3]{%
  \noindent\textbf{#1}\hfill\textit{#2}\\
  \textcolor{muted}{\small #3}\par\vspace{0.15em}
}

\pagestyle{empty}

\begin{document}
\begin{center}
  {\LARGE\bfseries Your Name}\\[0.35em]
  {\small
    \href{mailto:you@email.com}{you@email.com}
    $\cdot$ \href{https://linkedin.com/in/you}{linkedin.com/in/you}
    $\cdot$ \href{https://github.com/you}{github.com/you}
  }
\end{center}

\resumesection{Summary}
Your summary here.

\resumesection{Experience}
\role{Job Title}{Company Name}{City, ST \quad Jan 2024 -- Present}
\begin{itemize}
  \item Achievement or responsibility.
  \item Another achievement with metrics.
\end{itemize}

\resumesection{Education}
\role{B.S.\ Computer Science}{University Name}{City, ST \quad Expected May 2026}

\resumesection{Skills}
\textbf{Languages:} Python, JavaScript, SQL\\
\textbf{Tools:} Git, Docker, AWS
\end{document}""",
    },
    {
        "name": "Daniel's Backend",
        "description": "Backend-focused resume template",
        "latex_content": r"""\documentclass[11pt,letterpaper]{article}
\usepackage[margin=0.6in]{geometry}
\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}
\usepackage{lmodern}
\usepackage{xcolor}
\usepackage{hyperref}
\usepackage{parskip}

\definecolor{accent}{HTML}{1a365d}
\definecolor{muted}{HTML}{4a5568}

\newcommand{\resumesection}[1]{%
  \par\vspace{0.7em}%
  {\large\bfseries\color{accent}#1}\par
  \vspace{-0.35em}%
  \textcolor{accent}{\rule{\textwidth}{0.6pt}}\par
  \vspace{0.35em}%
}

\newcommand{\role}[3]{%
  \noindent\textbf{#1}\hfill\textit{#2}\\
  \textcolor{muted}{\small #3}\par\vspace{0.15em}
}

\newenvironment{resumeitemize}{%
  \begin{list}{\textbullet}{%
    \setlength{\leftmargin}{1.1em}%
    \setlength{\itemsep}{0.15em}%
    \setlength{\parsep}{0pt}%
    \setlength{\topsep}{0.2em}%
    \setlength{\partopsep}{0pt}%
  }%
}{\end{list}}

\newcommand{\entrygap}{\vspace{0.5em}}

\pagestyle{empty}

\begin{document}
\begin{center}
  {\LARGE\bfseries Daniel Lambo}\\[0.35em]
  {\small
    \href{mailto:daniel.lambo@bulldogs.aamu.edu}{daniel.lambo@bulldogs.aamu.edu}
    $\cdot$ \href{https://linkedin.com/in/yourname}{linkedin.com/in/yourname}
    $\cdot$ \href{https://github.com/DanielLambo}{github.com/DanielLambo}
  }
\end{center}

\resumesection{Summary}
Backend-focused engineer: APIs, data stores, reliability, and services. Targeting backend / platform roles.

\resumesection{Experience}
\role{Software Engineer}{Company Name}{City, ST \quad Jan 2024 -- Present}
\begin{resumeitemize}
  \item Designed and shipped APIs / services used by X users (latency, throughput, reliability).
  \item Owned data model and Postgres migrations; cut p99 latency by Y\%.
  \item Built internal tooling and CI that sped up deploys / onboarding.
\end{resumeitemize}
\entrygap
\role{Software Engineering Intern}{Earlier Company}{City, ST \quad May 2023 -- Aug 2023}
\begin{resumeitemize}
  \item Shipped end-to-end features across API + UI for product X.
  \item Wrote tests and monitoring for a service handling N req/s.
\end{resumeitemize}

\resumesection{Projects}
\role{API Platform}{Personal}{GitHub $\cdot$ Demo}
\begin{resumeitemize}
  \item REST/gRPC service with auth, rate limiting, and Postgres; deployed on cloud.
  \item Load-tested to N RPS; documented OpenAPI for clients.
\end{resumeitemize}
\entrygap
\role{Full-Stack App}{Personal}{GitHub $\cdot$ Live demo}
\begin{resumeitemize}
  \item Next.js + Node/Postgres app with auth, CRUD, and responsive UI.
  \item Deployed end-to-end; handled real users / traffic or demo traffic.
\end{resumeitemize}

\resumesection{Education}
\role{B.S.\ Computer Science}{University Name}{City, ST \quad Expected May 2026}
\begin{resumeitemize}
  \item GPA: X.XX/4.00 \quad Relevant coursework: Algorithms, Systems, Databases, ML
\end{resumeitemize}

\resumesection{Skills}
\noindent\textbf{Languages:} Go, Python, TypeScript, SQL\\
\textbf{Systems:} PostgreSQL, Redis, gRPC, REST, message queues\\
\textbf{Infra:} Docker, Kubernetes, AWS, CI/CD, observability
\end{document}""",
    },
    {
        "name": "Daniel's AI/ML",
        "description": "AI/ML-focused resume template",
        "latex_content": r"""\documentclass[11pt,letterpaper]{article}
\usepackage[margin=0.6in]{geometry}
\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}
\usepackage{lmodern}
\usepackage{xcolor}
\usepackage{hyperref}
\usepackage{parskip}

\definecolor{accent}{HTML}{1a365d}
\definecolor{muted}{HTML}{4a5568}

\newcommand{\resumesection}[1]{%
  \par\vspace{0.7em}%
  {\large\bfseries\color{accent}#1}\par
  \vspace{-0.35em}%
  \textcolor{accent}{\rule{\textwidth}{0.6pt}}\par
  \vspace{0.35em}%
}

\newcommand{\role}[3]{%
  \noindent\textbf{#1}\hfill\textit{#2}\\
  \textcolor{muted}{\small #3}\par\vspace{0.15em}
}

\newenvironment{resumeitemize}{%
  \begin{list}{\textbullet}{%
    \setlength{\leftmargin}{1.1em}%
    \setlength{\itemsep}{0.15em}%
    \setlength{\parsep}{0pt}%
    \setlength{\topsep}{0.2em}%
    \setlength{\partopsep}{0pt}%
  }%
}{\end{list}}

\newcommand{\entrygap}{\vspace{0.5em}}

\pagestyle{empty}

\begin{document}
\begin{center}
  {\LARGE\bfseries Daniel Lambo}\\[0.35em]
  {\small
    \href{mailto:daniel.lambo@bulldogs.aamu.edu}{daniel.lambo@bulldogs.aamu.edu}
    $\cdot$ \href{https://linkedin.com/in/yourname}{linkedin.com/in/yourname}
    $\cdot$ \href{https://github.com/DanielLambo}{github.com/DanielLambo}
  }
\end{center}

\resumesection{Summary}
AI/ML-focused engineer: models, data pipelines, and evaluation. Targeting ML engineer / applied scientist roles.

\resumesection{Experience}
\role{ML / Data Intern}{Research Lab or Company}{City, ST \quad May 2022 -- Aug 2022}
\begin{resumeitemize}
  \item Trained / evaluated models for task X; improved metric by Y\%.
  \item Built data pipelines and experiment tracking for the team.
\end{resumeitemize}
\entrygap
\role{Software Engineer}{Company Name}{City, ST \quad Jan 2024 -- Present}
\begin{resumeitemize}
  \item Designed and shipped APIs / services used by X users (latency, throughput, reliability).
  \item Owned data model and Postgres migrations; cut p99 latency by Y\%.
\end{resumeitemize}

\resumesection{Projects}
\role{ML Project Name}{Personal / Course}{GitHub $\cdot$ Writeup}
\begin{resumeitemize}
  \item Model + training pipeline for task X (PyTorch / sklearn); beat baseline by Y\%.
  \item Dataset cleaning, evaluation harness, and short technical writeup.
\end{resumeitemize}
\entrygap
\role{API Platform}{Personal}{GitHub $\cdot$ Demo}
\begin{resumeitemize}
  \item REST/gRPC service with auth, rate limiting, and Postgres; deployed on cloud.
  \item Load-tested to N RPS; documented OpenAPI for clients.
\end{resumeitemize}

\resumesection{Education}
\role{B.S.\ Computer Science}{University Name}{City, ST \quad Expected May 2026}
\begin{resumeitemize}
  \item GPA: X.XX/4.00 \quad Relevant coursework: Algorithms, Systems, Databases, ML
\end{resumeitemize}

\resumesection{Skills}
\noindent\textbf{Languages:} Python, SQL, C++\\
\textbf{ML:} PyTorch, scikit-learn, pandas, NumPy\\
\textbf{Data / MLOps:} feature pipelines, experiment tracking, evaluation harnesses\\
\textbf{Infra:} Docker, cloud GPUs/CPUs, Git
\end{document}""",
    },
    {
        "name": "Daniel's Fullstack",
        "description": "Fullstack-focused resume template",
        "latex_content": r"""\documentclass[11pt,letterpaper]{article}
\usepackage[margin=0.6in]{geometry}
\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}
\usepackage{lmodern}
\usepackage{xcolor}
\usepackage{hyperref}
\usepackage{parskip}

\definecolor{accent}{HTML}{1a365d}
\definecolor{muted}{HTML}{4a5568}

\newcommand{\resumesection}[1]{%
  \par\vspace{0.7em}%
  {\large\bfseries\color{accent}#1}\par
  \vspace{-0.35em}%
  \textcolor{accent}{\rule{\textwidth}{0.6pt}}\par
  \vspace{0.35em}%
}

\newcommand{\role}[3]{%
  \noindent\textbf{#1}\hfill\textit{#2}\\
  \textcolor{muted}{\small #3}\par\vspace{0.15em}
}

\newenvironment{resumeitemize}{%
  \begin{list}{\textbullet}{%
    \setlength{\leftmargin}{1.1em}%
    \setlength{\itemsep}{0.15em}%
    \setlength{\parsep}{0pt}%
    \setlength{\topsep}{0.2em}%
    \setlength{\partopsep}{0pt}%
  }%
}{\end{list}}

\newcommand{\entrygap}{\vspace{0.5em}}

\pagestyle{empty}

\begin{document}
\begin{center}
  {\LARGE\bfseries Daniel Lambo}\\[0.35em]
  {\small
    \href{mailto:daniel.lambo@bulldogs.aamu.edu}{daniel.lambo@bulldogs.aamu.edu}
    $\cdot$ \href{https://linkedin.com/in/yourname}{linkedin.com/in/yourname}
    $\cdot$ \href{https://github.com/DanielLambo}{github.com/DanielLambo}
  }
\end{center}

\resumesection{Summary}
Full-stack engineer: product features across UI and API. Targeting fullstack / product engineering roles.

\resumesection{Experience}
\role{Software Engineering Intern}{Earlier Company}{City, ST \quad May 2023 -- Aug 2023}
\begin{resumeitemize}
  \item Shipped end-to-end features across API + UI for product X.
  \item Wrote tests and monitoring for a service handling N req/s.
\end{resumeitemize}
\entrygap
\role{Software Engineer}{Company Name}{City, ST \quad Jan 2024 -- Present}
\begin{resumeitemize}
  \item Designed and shipped APIs / services used by X users (latency, throughput, reliability).
  \item Owned data model and Postgres migrations; cut p99 latency by Y\%.
\end{resumeitemize}

\resumesection{Projects}
\role{Full-Stack App}{Personal}{GitHub $\cdot$ Live demo}
\begin{resumeitemize}
  \item Next.js + Node/Postgres app with auth, CRUD, and responsive UI.
  \item Deployed end-to-end; handled real users / traffic or demo traffic.
\end{resumeitemize}
\entrygap
\role{API Platform}{Personal}{GitHub $\cdot$ Demo}
\begin{resumeitemize}
  \item REST/gRPC service with auth, rate limiting, and Postgres; deployed on cloud.
  \item Load-tested to N RPS; documented OpenAPI for clients.
\end{resumeitemize}

\resumesection{Education}
\role{B.S.\ Computer Science}{University Name}{City, ST \quad Expected May 2026}
\begin{resumeitemize}
  \item GPA: X.XX/4.00 \quad Relevant coursework: Algorithms, Systems, Databases, ML
\end{resumeitemize}

\resumesection{Skills}
\noindent\textbf{Languages:} TypeScript, Python, SQL\\
\textbf{Frontend:} React, Next.js, CSS/Tailwind\\
\textbf{Backend:} Node.js, PostgreSQL, REST, auth\\
\textbf{Tools:} Git, Docker, Vercel/AWS, CI/CD
\end{document}""",
    },
]


@asynccontextmanager
async def get_db():
    db = await aiosqlite.connect(str(DB_PATH))
    db.row_factory = aiosqlite.Row
    try:
        yield db
    finally:
        await db.close()


async def init_db():
    async with aiosqlite.connect(str(DB_PATH)) as db:
        await db.executescript(SCHEMA)
        for migration in MIGRATIONS:
            try:
                await db.execute(migration)
            except Exception:
                pass
        cursor = await db.execute("SELECT COUNT(*) FROM templates")
        count = (await cursor.fetchone())[0]
        if count == 0:
            for t in SEED_TEMPLATES:
                await db.execute(
                    "INSERT INTO templates (name, description, latex_content) VALUES (?, ?, ?)",
                    (t["name"], t["description"], t["latex_content"]),
                )
        await db.commit()
