#!/usr/bin/env bash
# Local stand-in for .github/workflows/ci.yml.
# Run from the repo root: bash scripts/ci-local.sh
# Against a Vercel preview: PLAYWRIGHT_BASE_URL=https://….vercel.app bash scripts/ci-local.sh

set -euo pipefail
cd "$(dirname "$0")/.."

npm run lint
npm test
node scripts/check-viewport-tags.mjs
node scripts/check-test-rules.mjs
node scripts/check-sprite-revisions.mjs
npx tsx --tsconfig tsconfig.app.json scripts/build-favorite-analytics-cells.ts --check
node scripts/check-speed-test-detection.mjs

if [ -n "${PLAYWRIGHT_BASE_URL:-}" ]; then
  npx playwright test -c e2e/preview.config.ts
else
  npm run test:e2e
fi

npm run build
node scripts/check-bundle-budget.mjs
