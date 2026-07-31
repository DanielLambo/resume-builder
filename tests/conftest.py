"""Fixtures and helpers for Resumate tests."""
from __future__ import annotations

import pytest
import pytest_asyncio


@pytest.fixture(autouse=True)
def _isolate_storage(monkeypatch, tmp_path):
    storage = tmp_path / "storage"
    compiled = storage / "compiled"
    storage.mkdir()
    compiled.mkdir()
    db_path = storage / "resume_builder.db"

    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    monkeypatch.setattr("app.paths.STORAGE_DIR", storage)
    monkeypatch.setattr("app.paths.COMPILED_DIR", compiled)
    monkeypatch.setattr("app.paths.DB_PATH", db_path)
    monkeypatch.setattr("app.database.DB_PATH", db_path)
    monkeypatch.setattr("app.services.latex.COMPILED_DIR", compiled)
    monkeypatch.setattr("app.routers.resumes.COMPILED_DIR", compiled)

    yield {"storage": storage, "compiled": compiled, "db": db_path}


SAMPLE_LATEX = r"""\documentclass[11pt,letterpaper]{article}
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
  {\LARGE\bfseries Jane Doe}\\[0.35em]
  {\small
    \href{mailto:jane@example.com}{jane@example.com}
    $\cdot$ \href{https://github.com/jane}{github.com/jane}
  }
\end{center}

\resumesection{Summary}
Backend engineer focused on APIs and reliability.

\resumesection{Experience}
\role{Software Engineer}{Acme Corp}{Remote \quad Jan 2024 -- Present}
\begin{resumeitemize}
  \item Built payment APIs serving 10K requests/day with 99.9\% uptime.
  \item Cut p99 latency from 800ms to 120ms by rewriting the query layer.
\end{resumeitemize}
\entrygap
\role{Intern}{Beta Labs}{City, ST \quad May 2023 -- Aug 2023}
\begin{resumeitemize}
  \item Shipped internal tooling used by 12 engineers.
\end{resumeitemize}

\resumesection{Education}
\role{B.S.\ Computer Science}{State University}{City, ST \quad May 2025}

\resumesection{Skills}
\noindent\textbf{Languages:} Python, Go, SQL\\
\textbf{Tools:} Docker, Postgres, AWS
\end{document}
"""


@pytest_asyncio.fixture
async def app_client(_isolate_storage):
    from httpx import ASGITransport, AsyncClient

    from app.database import init_db
    from app.main import app

    await init_db()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
