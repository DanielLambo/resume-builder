# Resumate

![CI](https://github.com/DanielLambo/resume-builder/actions/workflows/ci.yml/badge.svg)

Edit a resume cleanly — then tailor a version for each job without starting over.

**Open source / BYOK:** bring your own Supabase, Upstash, TeX host, and any
OpenAI-compatible AI API key. Nothing in this repo should require the original
author’s cloud accounts.

See [LICENSE](LICENSE), [SECURITY.md](SECURITY.md), and [CONTRIBUTING.md](CONTRIBUTING.md).

## Two runtimes

| Runtime | Path | Privacy model |
|---------|------|---------------|
| **Legacy FastAPI** | repo root (`python run.py`) | Local-first: resumes in **browser IndexedDB**; server is ephemeral for AI/PDF |
| **Typesetter (Next.js)** | `web/` (Vercel or self-host) | Account-based: resumes in **your private Supabase row** (RLS); AI via your provider; PDF via your `LATEX_COMPILE_URL` |

Do not market the Next.js app as “local-only IndexedDB” — that applies to the FastAPI path only.

Resume templates are defined **independently** in each runtime — FastAPI's live in
`app/catalog.py` + `app/seed/*.tex`, the Next.js app's in `web/lib/resume-template.ts` —
with different ids and names. Editing one does not update the other.

## Bring-your-own AI

The stack calls OpenAI-compatible `POST /v1/chat/completions` with JSON mode.

| Variable | Role |
|----------|------|
| `GROQ_API_KEY` **or** `OPENAI_API_KEY` **or** `AI_API_KEY` | Server-only API key |
| `GROQ_BASE_URL` / `OPENAI_BASE_URL` / `AI_BASE_URL` | Optional base URL (default: Groq) |
| `RESUMATE_MODEL` | Model id for that provider |

Examples: Groq, OpenAI, OpenRouter, or a local Ollama/LM Studio OpenAI shim.

## Next.js (`web/`) privacy

| Data | Where it goes |
|------|----------------|
| Resume LaTeX / title | **Your** Supabase `resumes` (owner-only RLS) |
| Auth email | **Your** Supabase Auth |
| Vibe-edit prompt + resume text | **Your** configured AI provider |
| PDF compile | **Your** `LATEX_COMPILE_URL` TeX host (required in prod) |
| AI token counters | **Your** Upstash Redis (`userId` + daily count only) |

**Production refuses latexonline.cc by default** so resume PII is not sent to a public third-party compiler. Set `LATEX_COMPILE_URL` to a host you control.

## Vercel (or any host) checklist

The Next.js app lives in **`web/`** — not the repo root.

1. Set the host’s **Root Directory** to `web`.
2. Framework: **Next.js**.
3. Set these **Production** env vars (see `web/.env.example`):

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

4. Supabase Auth → add your deployment URL(s) under **Redirect URLs** / site URL.
5. Do **not** set `ALLOW_LATEX_ONLINE=1` in production unless you accept sending resume PII to latexonline.cc.

## FastAPI quick start

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # add your AI API key
python run.py
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000). Requires `pdflatex` for PDF preview.

### FastAPI privacy model

| Data | Where it lives |
|------|----------------|
| Resume title, LaTeX, chat, version history | **Your browser** (IndexedDB) |
| Templates | Shared seed files on the server |
| AI edits | Sent to your AI provider only when you click Send |
| PDF compile | Ephemeral on the server — not stored after the response |

No accounts. Clearing site data deletes your library on that device.

## Public / demo hosting (FastAPI)

```bash
export RESUMATE_PUBLIC=1
export RESUMATE_HOST=0.0.0.0
export RESUMATE_PORT=8000
export RESUMATE_RELOAD=0
export GROQ_API_KEY=...   # or OPENAI_API_KEY / AI_API_KEY
python run.py
```

## Tests

```bash
pytest -q
cd web && npm run typecheck && npm run lint && npm run test:e2e
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full pre-PR checklist.
