<div align="center">

# Resumate

**Edit a resume cleanly, then tailor a version for every job — without starting over.**

[![CI](https://github.com/DanielLambo/resume-builder/actions/workflows/ci.yml/badge.svg)](https://github.com/DanielLambo/resume-builder/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](web)
[![FastAPI](https://img.shields.io/badge/FastAPI-legacy%20runtime-009688?logo=fastapi)](.)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

[Quick start](#quick-start) · [Features](#features) · [Architecture](#architecture) · [Deploying](#deploying-to-vercel) · [Contributing](CONTRIBUTING.md)

</div>

---

Resumate is a LaTeX-based resume editor. Write once in a clean, ATS-friendly
template, then use AI to tailor a copy for each job posting — rewrite bullets,
shorten sections, and auto-fit to one page — while keeping the underlying
LaTeX source fully editable by hand.

**Fully open source, bring-your-own-everything.** Point it at your own
Supabase project, your own AI provider (Groq, OpenAI, OpenRouter, or a local
model), and your own TeX host. Nothing in this repo depends on the original
author's cloud accounts, and no resume data is ever sent anywhere you didn't
configure yourself.

## Features

- **LaTeX resume editor** — CodeMirror-based editor with live PDF preview, syntax highlighting, and one-click compile
- **AI vibe-edit** — describe a change in plain English; the AI edits the LaTeX source directly, in your voice
- **Job tailoring** — paste a job description and get a tailored version of your resume for that role
- **ATS scoring** — local heuristics flag graphics, tables, and other patterns that trip up applicant tracking systems
- **Auto one-page lock** — iteratively tightens spacing and re-compiles until the resume fits one page
- **Import existing resumes** — pull an existing PDF/DOCX resume into the editor as a starting point
- **Six ready-made templates** — Jake's Resume (the r/EngineeringResumes default), Harvard Classic, and more
- **Two deployment models** — a full account-based Next.js app, or a no-login, local-first FastAPI app (see below)

## Architecture

This repo ships **two independent runtimes** that solve the same problem with different privacy trade-offs. Pick one — most contributors only need the Next.js app.

| | **Next.js** (`web/`) — primary | **FastAPI** (repo root) — legacy/local |
|---|---|---|
| **Storage** | Your Supabase project (RLS-scoped rows) | Browser IndexedDB — no server storage, no accounts |
| **Auth** | Supabase Auth (email) | None needed |
| **Best for** | Deploying a real, multi-device product | Running fully local, or a minimal self-hosted demo |
| **Run it** | `cd web && npm run dev` | `python run.py` |

> Resume templates are defined **independently** in each runtime — the Next.js
> app's live in `web/lib/resume-template.ts`, FastAPI's in `app/catalog.py` +
> `app/seed/*.tex`. Editing one does not update the other.

```
resume-builder/
├── web/              # Next.js app (primary) — editor, auth, AI actions
│   ├── app/          # Routes, server actions, API handlers
│   ├── components/   # UI
│   ├── lib/          # Supabase clients, resume templates, utilities
│   └── packages/     # @resumate/one-page-lock (PDF auto-fit engine)
├── app/              # FastAPI app (legacy/local runtime)
│   ├── routers/      # /api/ai, /api/compile, /api/ats, ...
│   ├── services/     # LaTeX parsing/compile, AI prompting, ATS heuristics
│   └── seed/          # Seed .tex templates
├── supabase/         # SQL migrations for the Next.js app's schema
├── tests/            # pytest suite for the FastAPI runtime
└── templates/        # Server-rendered HTML (FastAPI's own UI)
```

## Quick start

### Next.js (recommended)

```bash
cd web
cp .env.example .env.local   # fill in your Supabase + AI keys
npm install
npm run dev
```

Apply the SQL in `supabase/migrations/` to your Supabase project, then add
your local/deployed URL under Supabase Auth → Redirect URLs. No AI key yet?
Run with `NEXT_PUBLIC_USE_MOCK_AI=true` for offline UI work.

<details>
<summary><b>Environment variables</b></summary>

| Variable | Required | Notes |
|----------|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Publishable anon key (RLS-backed) |
| `NEXT_PUBLIC_SITE_URL` | yes (auth) | Stable public origin for redirects |
| `SUPABASE_SERVICE_ROLE_KEY` | recommended | Server-only; never `NEXT_PUBLIC_` |
| `GROQ_API_KEY` (or `OPENAI_API_KEY` / `AI_API_KEY`) | yes (live AI) | Server-only |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | recommended | Daily AI quota |
| `LATEX_COMPILE_URL` | yes for PDF | Your TeX compile host |
| `NEXT_PUBLIC_USE_MOCK_AI` | set `false` for prod | `true` = offline synthetic AI |

</details>

<details>
<summary><b>Where your data goes</b></summary>

| Data | Where it goes |
|------|----------------|
| Resume LaTeX / title | **Your** Supabase `resumes` table (owner-only RLS) |
| Auth email | **Your** Supabase Auth |
| Vibe-edit prompt + resume text | **Your** configured AI provider |
| PDF compile | **Your** `LATEX_COMPILE_URL` TeX host (required in prod) |
| AI token counters | **Your** Upstash Redis (`userId` + daily count only) |

Production refuses `latexonline.cc` by default so resume PII is never sent to
a public third-party compiler — set `LATEX_COMPILE_URL` to a host you control.

</details>

### FastAPI (local-only, no accounts)

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # add your AI API key
python run.py
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000). Requires `pdflatex` for
PDF preview. Resume title, LaTeX, and version history live entirely in your
browser's IndexedDB; the server is stateless and ephemeral, used only for
AI calls and PDF compilation.

<details>
<summary><b>Public / demo hosting</b></summary>

```bash
export RESUMATE_PUBLIC=1
export RESUMATE_HOST=0.0.0.0
export RESUMATE_PORT=8000
export RESUMATE_RELOAD=0
export GROQ_API_KEY=...   # or OPENAI_API_KEY / AI_API_KEY
python run.py
```

</details>

## Bring-your-own AI

Both runtimes call any OpenAI-compatible `POST /v1/chat/completions` endpoint
in JSON mode — Groq, OpenAI, OpenRouter, or a local Ollama/LM Studio shim all
work.

| Variable | Role |
|----------|------|
| `GROQ_API_KEY` **or** `OPENAI_API_KEY` **or** `AI_API_KEY` | Server-only API key |
| `GROQ_BASE_URL` / `OPENAI_BASE_URL` / `AI_BASE_URL` | Optional base URL (default: Groq) |
| `RESUMATE_MODEL` | Model id for that provider |

## Deploying to Vercel

The Next.js app lives in **`web/`**, not the repo root.

1. Set the host's **Root Directory** to `web`, framework **Next.js**.
2. Set the production env vars from the table above.
3. Add your deployment URL under Supabase Auth → Redirect URLs.
4. Do **not** set `ALLOW_LATEX_ONLINE=1` in production unless you accept
   sending resume PII to `latexonline.cc`.

## Testing

```bash
ruff check .
pytest -q
cd web && npm run typecheck && npm run lint && npm run test:e2e
```

## Contributing

Issues and PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for local
setup and the pre-PR checklist. Please read [SECURITY.md](SECURITY.md) before
reporting a vulnerability.

## License

[MIT](LICENSE) © Resumate contributors
