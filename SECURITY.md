# Security Policy

## Reporting a vulnerability

Please open a private GitHub security advisory on this repository (or email the
maintainer listed on the repo) if you find a security issue. Do not file a
public issue for credential leaks or auth bypasses.

## Secrets & API keys

Resumate is designed for **bring-your-own keys**:

| Secret | Where it lives | Never |
|--------|----------------|-------|
| `GROQ_API_KEY` / `OPENAI_API_KEY` / `AI_API_KEY` | Server env only | `NEXT_PUBLIC_*`, client bundles, git |
| `SUPABASE_SERVICE_ROLE_KEY` | Server env only | Browser / `NEXT_PUBLIC_*` |
| Upstash Redis token | Server env only | Client |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public by design | Treat as public; protect data with RLS |

Copy `.env.example` → `.env` / `web/.env.local`. Those files are gitignored.

## Historical note (rotate before going public)

An early commit briefly hardcoded a Groq API key as a default in
`app/services/ai.py`.

1. **Revoke/rotate** that Groq key in the Groq console — do this regardless
   of the history rewrite below; treat any key that ever appeared in git as
   compromised.
2. The string has been **purged from git history** on all branches/tags via
   `git filter-repo`, with a force-push to `origin`. Existing local clones
   must re-clone or hard-reset onto the rewritten history.

Note: GitHub's own PR-review refs (`refs/pull/N/head`) cannot be rewritten by
a normal push and may still reference old commit objects internally, so key
rotation is the real mitigation — the history rewrite only prevents new
clones/checkouts from seeing the string.

## Auth cookies

Session tokens belong in `httpOnly`, `Secure`, `SameSite=Lax` cookies — never
`localStorage` / `sessionStorage`.
