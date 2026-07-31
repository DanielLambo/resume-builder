# Resumate 2.0

Local-first LaTeX resume builder. FastAPI + aiosqlite + CodeMirror + PDF.js + Groq AI.

## Quick start

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # paste your Groq key as GROQ_API_KEY
python run.py          # → http://127.0.0.1:8000
```

Requires `pdflatex` (MacTeX / TeX Live). PDF text upload also needs `pdftotext` (`brew install poppler`).

## What's in 2.0

- Unified `storage/` for DB + compiled PDFs
- Jake's Resume as the default template
- Env-only Groq API keys (no hardcoded secrets)
- SyncTeX click-to-source with correct PDF coordinates
- Editor focus mode (⌘⇧F), dirty state, inline title rename
- AI prompts tuned to avoid recruiter-detectable “AI resume” voice
- pytest coverage for latex round-trip, compile, AI splice, uploads, routes, extract

## Config

| Variable | Default | Purpose |
|----------|---------|---------|
| `GROQ_API_KEY` | — | Required for AI |
| `RESUMATE_HOST` | `127.0.0.1` | Bind address |
| `RESUMATE_PORT` | `8000` | Port |
| `RESUMATE_RELOAD` | `1` | Hot reload (`0` for prod-ish) |

Health probe: `GET /health`

## Tests

```bash
pytest
```

## Security

`GROQ_API_KEY` is env-only (loaded from `.env`). Get a key at https://console.groq.com/keys.  
`OPENAI_API_KEY` is still accepted as a legacy alias. If a key was ever committed, rotate it.

Delete uses `POST` only (GET is rejected). Uploads are capped at 10 MB.
