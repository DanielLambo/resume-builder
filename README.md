# Resumate 2.0

Local-first LaTeX resume builder. FastAPI + aiosqlite + CodeMirror + PDF.js + Groq AI.

## Quick start

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # paste your Groq key as OPENAI_API_KEY
python run.py          # → http://127.0.0.1:8000
```

Requires `pdflatex` (MacTeX / TeX Live). PDF text upload also needs `pdftotext` (`brew install poppler`).

## What's in 2.0

- Unified `storage/` for DB + compiled PDFs
- Jake's Resume as the default template
- Env-only API keys (no hardcoded secrets)
- SyncTeX click-to-source with correct PDF coordinates
- Quieter editor UX (focus mode, dirty state, less toast noise)
- AI prompts tuned to avoid recruiter-detectable “AI resume” voice
- pytest coverage for latex round-trip, compile, AI splice, uploads

## Tests

```bash
pytest
```

## Security

`OPENAI_API_KEY` is env-only (loaded from `.env`). If a key was ever committed, rotate it at https://console.groq.com/keys.
