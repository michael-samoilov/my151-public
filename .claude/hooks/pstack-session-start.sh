#!/bin/sh
set -eu
project=${CLAUDE_PROJECT_DIR:-$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)}
CLAUDE_PLUGIN_ROOT="$project/.claude/vendor/open-pstack/upstream/plugins/pstack"
export CLAUDE_PLUGIN_ROOT
# Project skills and agents have no plugin namespace.
context=$(sh "$CLAUDE_PLUGIN_ROOT/hooks/session-start.sh" claude)
printf '%s\n' "$context" | sed 's/pstack://g'
