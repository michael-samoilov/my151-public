---
paths:
  - "scripts/performance/**"
  - "docs/performance.md"
---

# Speed work

This extends "Build Verification" in `CLAUDE.md`.

Speed changes: prove a change meant to make the app faster with `node scripts/performance/lighthouse.mjs` and `node scripts/performance/lab.mjs`. Both build production and your working tree. `lighthouse.mjs` runs PageSpeed Insights' engine on every page, lists the findings, and fails a change that only games the score (see "Guards" in `docs/performance.md`). `lab.mjs` prints LCP, blocking time, and per-step INP. Paste both tables into the pull request. `node scripts/performance/psi.mjs` reads what Google's PageSpeed Insights shows for the live site, field data included. It needs `PAGESPEED_API_KEY` in the environment settings: the one Google key Michael approved, restricted to PageSpeed Insights. Never print, log, or commit it. Timing is noisy on a shared machine, so the script is evidence, not a ci-local gate. Michael's bar for merging a speed change: it must not hinder the user experience, and it must not overly complicate the code. Prefer the smallest diff that removes the measured cause. A speed change that users can see (content that appears later, a placeholder, a new animation) is a visual choice: show Michael before and after first. The speed targets, and the ideas already tried and left out, are in `docs/performance.md`. Read it before you start speed work.
