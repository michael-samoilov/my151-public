---
paths:
  - ".claude/vendor/**"
  - ".claude/agents/**"
  - ".agents/**"
  - "scripts/check-pstack.mjs"
---

# pstack snapshot and setup

This extends "pstack" in `CLAUDE.md`.

This repo vendors pstack-claude, a third-party MIT project, version 0.9.146.
The complete upstream distribution lives in
`.claude/vendor/open-pstack/upstream/`. Skills and agents link to that snapshot.
Codex discovers the same skills through `.agents/skills`.
Provenance, local deviations, and resync steps are in
`.claude/vendor/open-pstack/README.md`.

`/setup-pstack` configures models for the current runtime. The latest upstream
uses native model defaults, optional external providers, and per-role effort.
Do not reuse the previous distribution's provider-qualified model sheet without
following the updated setup instructions. This update does not change personal
model sheets or probe provider accounts.

Run `node scripts/check-pstack.mjs` to check the upstream snapshot and active
skill and agent links. The upstream tests run separately from app tests.
