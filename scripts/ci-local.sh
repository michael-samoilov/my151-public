#!/usr/bin/env bash
# Local stand-in for .github/workflows/ci.yml.
# Run from the repo root: bash scripts/ci-local.sh
# Against a Vercel preview: PLAYWRIGHT_BASE_URL=https://….vercel.app bash scripts/ci-local.sh

set -euo pipefail
cd "$(dirname "$0")/.."

npm run lint
npm test

if [ -n "${PLAYWRIGHT_BASE_URL:-}" ]; then
  npx playwright test -c e2e/preview.config.ts
else
  npm run test:e2e
fi

npm run build
