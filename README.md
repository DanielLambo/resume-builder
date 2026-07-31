# Resumate

Edit a resume cleanly and easily — then tailor a version for each job without starting over.

Local-first: resumes stay in your browser (IndexedDB). The server only serves the UI, shared templates, and ephemeral AI / PDF compile.

## Quick start

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # add GROQ_API_KEY
python run.py
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000).

Requires `pdflatex` (e.g. MacTeX / TeX Live) for PDF preview.

## Privacy model

| Data | Where it lives |
|------|----------------|
| Resume title, LaTeX, chat, version history | **Your browser** (IndexedDB) |
| Templates | Shared seed files on the server |
| AI edits | Sent to Groq only when you click Send |
| PDF compile | Ephemeral on the server — not stored after the response |

No accounts. Clearing site data deletes your library on that device. Clearing browser storage is permanent.

## Public / demo hosting

```bash
export RESUMATE_PUBLIC=1          # hide /docs (default on)
export RESUMATE_HOST=0.0.0.0
export RESUMATE_PORT=8000
export RESUMATE_RELOAD=0
export GROQ_API_KEY=...           # required for AI
python run.py
```

Rate limits (per IP): AI 20/min, compile 30/min, upload 10/min.

**Rotate any Groq key that was ever committed to git history before sharing a deploy.**

## Features

- Plain-English edits that keep your layout intact
- Tailor to a pasted job description
- Paste job notes → bullets
- Live PDF preview
- Templates: Jake, Harvard Classic, Modern SWE, New Grad, Data & ML, Blank
- ATS check, local version history, .tex / PDF download

## Tests

```bash
pytest -q
```
