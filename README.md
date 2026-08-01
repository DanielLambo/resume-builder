# Resumate

Edit a resume cleanly and easily — then tailor a version for each job without starting over.

## Two runtimes

| Runtime | Path | Privacy model |
|---------|------|---------------|
| **Legacy FastAPI** | repo root (`python run.py`) | Local-first: resumes in **browser IndexedDB**; server is ephemeral for AI/PDF |
| **Typesetter (Next.js)** | `web/` (Vercel) | Account-based: resumes in **your private Supabase row** (RLS); AI via Groq; PDF via your `LATEX_COMPILE_URL` |

Do not market the Next.js app as “local-only IndexedDB” — that applies to the FastAPI path only.

## Next.js (`web/`) privacy

| Data | Where it goes |
|------|----------------|
| Resume LaTeX / title | Supabase `resumes` (owner-only RLS) |
| Auth email | Supabase Auth |
| Vibe-edit prompt + resume text | Groq (when you run vibe edit) |
| PDF compile | Your `LATEX_COMPILE_URL` TeX host (required in prod) |
| AI token counters | Upstash Redis (`userId` + daily count only) |

**Production refuses latexonline.cc by default** so resume PII is not sent to a public third-party compiler. Set `LATEX_COMPILE_URL` to a host you control.

## Vercel (GitHub) production checklist

The Next.js app lives in **`web/`** — not the repo root.

1. In the Vercel project → **Settings → General → Root Directory** → set to `web` (and redeploy).
2. Framework preset: **Next.js**. Install/build can stay default (`npm install` / `npm run build`).
3. Set these **Production** env vars (Project → Settings → Environment Variables):

| Variable | Required | Notes |
|----------|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Publishable anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | recommended | Server-only; never `NEXT_PUBLIC_` |
| `GROQ_API_KEY` | yes (live AI) | Server-only |
| `UPSTASH_REDIS_REST_URL` | recommended | Daily AI quota |
| `UPSTASH_REDIS_REST_TOKEN` | recommended | Daily AI quota |
| `LATEX_COMPILE_URL` | yes for PDF | Your TeX compile host (Vercel has no pdflatex) |
| `NEXT_PUBLIC_USE_MOCK_AI` | set `false` for prod | `true` = offline synthetic AI |

4. Supabase Auth → add your Vercel URL(s) under **Redirect URLs** / site URL.
5. Do **not** set `ALLOW_LATEX_ONLINE=1` in production unless you accept sending resume PII to latexonline.cc.

## FastAPI quick start

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # add GROQ_API_KEY
python run.py
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000). Requires `pdflatex` for PDF preview.

### FastAPI privacy model

| Data | Where it lives |
|------|----------------|
| Resume title, LaTeX, chat, version history | **Your browser** (IndexedDB) |
| Templates | Shared seed files on the server |
| AI edits | Sent to Groq only when you click Send |
| PDF compile | Ephemeral on the server — not stored after the response |

No accounts. Clearing site data deletes your library on that device.

## Public / demo hosting (FastAPI)

```bash
export RESUMATE_PUBLIC=1
export RESUMATE_HOST=0.0.0.0
export RESUMATE_PORT=8000
export RESUMATE_RELOAD=0
export GROQ_API_KEY=...
python run.py
```

## Tests

```bash
pytest -q
cd web && npm run typecheck && npm run test:e2e
```
