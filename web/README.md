# Resumate Typesetter (`web/`)

Next.js app for account-based resume editing (Supabase + AI + PDF).

## Setup

```bash
cp .env.example .env.local
# Add your own Supabase, Upstash, and AI keys — never commit them
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Full env table, privacy model, and deploy notes: **[root README](../README.md)**.
Contributor workflow: **[CONTRIBUTING.md](../CONTRIBUTING.md)**.
Secrets policy: **[SECURITY.md](../SECURITY.md)**.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Local Next.js (Turbopack) |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run test:e2e` | Playwright (mock AI by default in CI) |

## AI keys

Server-only. Use `GROQ_API_KEY`, `OPENAI_API_KEY`, or `AI_API_KEY`, plus optional
base URL / `RESUMATE_MODEL` overrides. See `lib/ai-provider.ts`.
