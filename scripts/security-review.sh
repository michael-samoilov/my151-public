#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -z "${SECURITY_REDIS_RUNTIME:-}" ]]; then
  redis_server="$(command -v redis-server || true)"
  if [[ -z "$redis_server" ]]; then
    echo 'Install local Redis, or set SECURITY_REDIS_RUNTIME to the directory containing redis-server and redis-cli.' >&2
    exit 1
  fi
  export SECURITY_REDIS_RUNTIME="$(dirname "$redis_server")"
fi

npx vitest run scripts/security-access.test.ts scripts/security-limits.test.ts
node scripts/security-redis-caps.mjs
flock /tmp/my151-browser.lock node scripts/security/browser-review.mjs
