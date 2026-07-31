#!/usr/bin/env bash
# Deploy web/ to Vercel production with env from web/.env.local
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEB="$ROOT/web"
ENV_FILE="$WEB/.env.local"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi

cd "$WEB"

# Ensure project is linked (creates .vercel/)
if [[ ! -f .vercel/project.json ]]; then
  npx vercel@latest link --yes --project resumate-web || npx vercel@latest link --yes
fi

KEYS=(
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_ANON_KEY
  UPSTASH_REDIS_REST_URL
  UPSTASH_REDIS_REST_TOKEN
  GROQ_API_KEY
  SUPABASE_SERVICE_ROLE_KEY
  SUPABASE_SECRET_KEY
  SUPABASE_URL
  SUPABASE_PUBLISHABLE_KEY
  SUPABASE_JWKS_URL
  NEXT_PUBLIC_USE_MOCK_AI
)

get_env() {
  local key="$1"
  python3 - "$ENV_FILE" "$key" <<'PY'
from pathlib import Path
import sys
path, key = sys.argv[1], sys.argv[2]
for line in Path(path).read_text().splitlines():
    if line.startswith(key + "="):
        print(line.split("=", 1)[1])
        break
PY
}

for key in "${KEYS[@]}"; do
  val="$(get_env "$key" || true)"
  if [[ -z "${val:-}" ]]; then
    continue
  fi
  # Remove existing production value if present, then add
  npx vercel@latest env rm "$key" production --yes >/dev/null 2>&1 || true
  printf '%s' "$val" | npx vercel@latest env add "$key" production --yes >/dev/null
  echo "set $key (production)"
done

npx vercel@latest --prod --yes
