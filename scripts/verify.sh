#!/usr/bin/env bash
# Run every local quality gate in sequence. Mirrors the CI "verify" job.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "▶ format:check"
pnpm format:check
echo "▶ lint"
pnpm lint
echo "▶ typecheck"
pnpm typecheck
echo "▶ test"
pnpm test
echo "▶ build"
pnpm build

echo "✅ All quality gates passed."
