# CLAUDE.md

## Context Resumption

When resuming from a context summary (e.g. after running out of context), only act on items explicitly listed under "Pending Tasks." Do not revisit, verify, or re-investigate completed work. Treat the summary's completed items as done — pick up exactly where things left off.

## Build Verification

Always run `npm run build` to verify the build compiles before committing and pushing. Never push code that has not been build-verified. The build includes sprite caching and stricter type checking than `tsc --noEmit` alone.
