# Contributing

Thanks for helping with Resumate. This project is meant to be forked and run
with **your own** Supabase, Upstash, TeX, and AI provider credentials.

## Prerequisites

- Node.js 20+ and npm (for `web/`)
- Python 3.11+ (optional FastAPI path)
- `pdflatex` for local PDF compile (or a remote `LATEX_COMPILE_URL`)
- Accounts as needed: Supabase, Upstash Redis, and an OpenAI-compatible AI API

## Quick local setup (Next.js)

```bash
cd web
cp .env.example .env.local
# Fill in your keys — see README for the env table
npm install
npm run dev
```

Apply Supabase migrations from `supabase/migrations/` to your project, then
add your site URL under Auth → Redirect URLs.

Offline UI work without an AI key:

```bash
NEXT_PUBLIC_USE_MOCK_AI=true npm run dev
```

## Quick local setup (FastAPI)

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python run.py
```

## AI providers

The app talks OpenAI-compatible `/v1/chat/completions` JSON mode. Set any of:

- `GROQ_API_KEY` / `OPENAI_API_KEY` / `AI_API_KEY`
- `GROQ_BASE_URL` / `OPENAI_BASE_URL` / `AI_BASE_URL`
- `RESUMATE_MODEL` (must match the provider)

Default base URL is Groq’s OpenAI-compatible endpoint; override freely.

## Checks before a PR

```bash
ruff check .
pytest -q
cd web && npm run typecheck && npm run lint
# optional: npm run test:e2e
```

## Guidelines

- Do not commit `.env`, `.env.local`, or real API keys.
- Prefer server components; mark `'use client'` only when needed.
- Validate external AI JSON with Zod before use.
- Keep LaTeX compile failures structured — never crash the request path.
