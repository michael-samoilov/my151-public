#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mode=affected
if [[ "${1:-}" == fast || "${1:-}" == affected || "${1:-}" == full ]]; then
  mode="$1"
  shift
fi
exec node --import tsx scripts/ci/run.ts "$mode" "$@"
