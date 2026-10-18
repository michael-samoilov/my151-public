# Security review verification, October 16, 2026

Historical captures and commands are in this folder's Git history.

Base application commit: `40aceaf91e2262f93dff843ebe9128ce0bc93e68`.
Fix commit: `e4ea66c956603acf8068bfabcfe53f9186fd718c`.
Evidence commits after the fix change documentation only.

| Check | Result |
| --- | --- |
| Local security command | 63 handler checks, seven actual Redis checks, and eight Chromium checks pass. |
| Before/after proof | Dex budget and feedback cache assertions fail before, pass after. Local protection-removal control fails again; exact source restoration passes. |
| Real Redis capacity proof | Before: each route admits 20 new records with one slot left. After: one admitted, 19 refused, ending at 50,000. Existing records still update at capacity. |
| Independent source review | Access reviewer approves the API fixes. Both evidence-hygiene concerns are corrected before the final run. |
| `npm run lint` | No errors. Two existing hook warnings in AdminPage and ViewPage. |
| `npm test` | 730 tests pass across 106 files. |
| Repository guards | Viewport tags, test rules, sprite revisions, generated analytics cells, speed-test detection, and published source pass. |
| Full Playwright run | 957 pass, 39 skip, one pre-existing failure. No other browser failure appears. |
| Baseline reproduction | Exact unchanged `40aceaf9`: the same stale-deploy test fails three times at line 45; three no-deploy controls pass. |
| `npm run build` | Passes, including i18n verification and TypeScript project checks. |
| `node scripts/check-bundle-budget.mjs` | Passes all budgets. |

The full command is `CI=1 flock /tmp/my151-browser.lock bash scripts/ci-local.sh`.
Its browser stage exits 1 because of the pre-existing failure. Therefore the
build and bundle budget run separately afterward and exit 0. This is not a
clean full-suite pass. Repository policy permits unrelated failures with an
observed failure on unchanged production source.

The failing test is `e2e/stale-deploy.spec.ts:38`, desktop, “a tab opened before
a deploy reloads when it opens Export, keeps the picks, and then exports”.
After a simulated reload, its `favorites-export-open` locator is absent at
line 45. The baseline remains at “Loading the picker…”. The startup cause is
not established. No product or test change is made for this unrelated failure.

The server-only changes do not use the visual-diff harness: its Vite preview
does not serve serverless APIs and cannot observe these fixes. Actual handlers,
installed rate-limit SDK, real Redis Lua, and local Chromium supply the relevant
runtime proof. No deployed attack, production database probe, or hosting-setting
change occurs.

Evidence:

- Full run status and log.
- [Baseline method and results](../evidence/security-review-2026-10-16/browser/stale-deploy-baseline/README.md).
- Final build status and log.
- Combined security log and mutation control.

No test accounts exist in this app. Synthetic browser contexts and isolated
Redis processes are closed after execution. No real visitor selections or
production analytics records are changed by the probes.
