#!/bin/bash
# Session setup for Claude Code on the web. Runs on every session start; each
# step is idempotent and the container is cached once it completes.
set -euo pipefail

[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

npm install --no-audit --no-fund
# Reports a missing engine as DOWN and keeps going; do not let that fail the hook.
bash .claude/skills/verify-my151/harness/setup-engines.sh || true
