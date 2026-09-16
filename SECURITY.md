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
`app/services/ai.py`. It was removed from the working tree, but **git history
still contains that value**. Before making this repository public:

1. **Revoke/rotate** that Groq key in the Groq console immediately.
2. Optionally **rewrite history** (e.g. `git filter-repo`) to purge the string
   from all commits, then force-push only if you understand the implications
   for existing clones.

Treat any key that ever appeared in git as compromised.

## Auth cookies

Session tokens belong in `httpOnly`, `Secure`, `SameSite=Lax` cookies — never
`localStorage` / `sessionStorage`.
