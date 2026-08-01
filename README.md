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
