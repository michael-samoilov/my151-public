#!/usr/bin/env bash
# Vercel's "Ignored Build Step" (`ignoreCommand` in vercel.json). Exit 0 skips
# the build; exit 1 builds. When in doubt, it builds.
#
# Production builds only when a push changes a file the site can serve or
# build from. Docs, tests, and agent tooling cannot change the site.
# Previews build only on request: a `preview/` branch, or `[preview]` in the
# commit message. The local `npm run build` is the compile check for work
# branches.
set -u

if [ "${VERCEL_ENV:-}" != "production" ]; then
  case "${VERCEL_GIT_COMMIT_REF:-}" in preview/*) echo "Preview branch: build."; exit 1 ;; esac
  case "${VERCEL_GIT_COMMIT_MESSAGE:-}" in *"[preview]"*) echo "[preview] in the commit message: build."; exit 1 ;; esac
  echo "Preview skipped. To build one, push a preview/ branch or put [preview] in the commit message."
  exit 0
fi

# The commit of the last production deploy. Vercel sets it only for this step.
previous="${VERCEL_GIT_PREVIOUS_SHA:-}"
current="${VERCEL_GIT_COMMIT_SHA:-HEAD}"
[ -n "$previous" ] || { echo "No previous deploy: build."; exit 1; }
# Vercel clones shallowly, so the previous deploy's commit can be missing.
if ! git cat-file -e "$previous^{commit}" 2>/dev/null; then
  git fetch --quiet --depth=200 origin "$previous" 2>/dev/null || true
fi
changed=$(git diff --name-only "$previous" "$current" 2>/dev/null) || { echo "Cannot compare with $previous: build."; exit 1; }
[ -n "$changed" ] || { echo "No changed files found: build."; exit 1; }

# Paths the site never serves or builds from. A Markdown file under public/
# is served, so only Markdown elsewhere is skipped.
not_site='^(docs|e2e|\.claude|\.github|\.cursor)/|^[^/]+\.md$|^(src|scripts|api)/.*\.md$|\.test\.ts$|^scripts/performance/|^eslint-suppressions\.json$'
site=$(printf '%s\n' "$changed" | grep -v -E "$not_site")
if [ -z "$site" ]; then
  echo "Only docs, tests, or tooling changed since $previous: skip."
  exit 0
fi
echo "Site files changed since $previous: build."
printf '%s\n' "$site" | head -5
exit 1
