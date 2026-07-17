# GitHub CI/CD assets

Supporting assets for GitHub Actions. The executable workflows live in
`../../.github/workflows` (GitHub requires that location); this directory holds
reusable composite actions and CI helper scripts as the pipeline grows
(P1-M06 / P5-D05).

Current pipeline: `.github/workflows/ci.yml` — verify (format, lint, typecheck,
test, build), dependency audit, and Playwright E2E.
