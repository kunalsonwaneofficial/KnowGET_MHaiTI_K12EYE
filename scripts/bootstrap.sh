#!/usr/bin/env bash
# One-command onboarding for a fresh clone.
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v corepack >/dev/null 2>&1; then
  echo "corepack not found — please install Node.js >= 22." >&2
  exit 1
fi

corepack enable
pnpm install

echo "✅ Bootstrap complete. Next steps:"
echo "   pnpm infra:up   # start PostgreSQL + Redis"
echo "   pnpm verify     # run all quality gates"
echo "   pnpm dev        # run all apps in dev"
