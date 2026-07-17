#!/usr/bin/env bash
# Platform certification (P1-M07): run every quality gate, then capture the
# performance baseline. This is the one-command certification used at each phase
# gate. Requires the Prisma engine to be reachable for the full build (CI, or a
# networked dev host); see the technical-debt register (TD-12).
set -euo pipefail

cd "$(dirname "$0")/.."

echo "════════ KnowGET MHaiTI — Platform Certification ════════"

echo "▶ Quality gates"
bash scripts/verify.sh

echo
echo "▶ Performance baseline"
node tools/benchmarks/bench.cjs

echo
echo "✅ Certification complete — quality gates green, baselines captured."
