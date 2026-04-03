# CLAUDE.md

## Context Resumption

When resuming from a context summary (e.g. after running out of context), only act on items explicitly listed under "Pending Tasks." Do not revisit, verify, or re-investigate completed work. Treat the summary's completed items as done — pick up exactly where things left off.

## Build Verification

Always run `npm run build` to verify the build compiles before committing and pushing. Never push code that has not been build-verified. The build includes sprite caching and stricter type checking than `tsc --noEmit` alone.

## Deployment

Vercel auto-deploys from the `claude/pokedex-region-builder-AviYF` branch. After committing to any work branch, always merge into and push `claude/pokedex-region-builder-AviYF` so changes go live. Do not push only to the work branch — the deploy branch must be updated every time.
