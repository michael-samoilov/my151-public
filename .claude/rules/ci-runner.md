---
paths:
  - "scripts/ci/**"
  - "scripts/ci-local.sh"
  - "scripts/check-*.mjs"
  - "scripts/eslint/**"
  - "e2e/**"
  - "playwright.config.ts"
  - "eslint.config.js"
  - "eslint-suppressions.json"
---

# CI runner and repository checks

This extends "Build Verification" in `CLAUDE.md`.

`bash scripts/ci-local.sh` delegates to affected mode. It accepts `fast`, `affected`,
or `full`, followed by the same options. `--plan` prints the chosen scope and reasons
without running checks. The default base is `origin/claude/pokedex-region-builder-AviYF`;
`--base REF` or `MY151_CI_BASE` overrides it. In a clone without that branch, such as the
public copy, the default falls back to `origin/main`, then `main` (`scripts/ci/base.ts`).
Missing or unusable history runs smoke.
A clean diff still runs fast checks. An explicitly known Markdown-only diff skips code checks.

`scripts/ci/policy.ts` owns selection, and no changed path selects the full suite.
`scripts/ci/test-map.json` records which `src/` files each browser spec runs, measured
with Chromium code coverage during a full run (`e2e/support/testMap.ts`). Every spec
imports `test` from `e2e/support/test.ts` so that the recording sees it; the
`written/specs-record-their-files` lint rule enforces this. A changed `src/` file
selects the specs that ran it, plus the specs that run no browser code (such as the
hub prerender checks). A changed spec selects itself. Paths that only lint, unit
tests, or repository checks read (`api/`, `scripts/`, `data/`, `docs/`, `.claude/`,
`*.test.ts`) select no browser specs. An app input that no recorded test runs (CSS,
a build script, a dependency) runs smoke and names the release checks that cover it.
When the selected specs would take more than 3 minutes, the run keeps one spec for
each changed file and the changed specs, fills the rest of the 3 minutes with the
cheapest other selected specs, and says so; request a full-suite runner run before release when that
change is risky. The selector
includes committed, staged, dirty, deleted, renamed, and untracked paths.

Every code mode runs lint, all unit/API/migration tests, translation verification,
TypeScript, the verify-my151 harness typecheck, repository guards, the sprite credit
and ink checks, analytics-cell verification, and bundle budgets.
The runner builds once with a manifest into its unique Git operational directory.
Browser preview and bundle measurement use that same current-run artifact.
Receipts reject changed source or output. An external preview remains external
evidence; its source identity is not established by a local receipt.

Four lanes run at the same time: lint, unit tests, the repository checks, and the
build with its bundle budget. A failed lane fails the run after every lane stops.
Browser tests start after the lanes. Lint keeps a content cache in
`<git dir>/ci-cache/`, and the type check keeps incremental state in
`node_modules/.tmp/`. Both start cold when the installed packages change, so the
first run in a session is the slow one.

Each invocation records live status, stage logs, selection, identity, and browser
attempts under `git rev-parse --absolute-git-dir` in `ci-runs/<run-id>`. Inspect
those records and the PID after a reconnect. Completed output is copied to
`.audit/ci/<run-id>` after browser shutdown; `.audit/ci/latest.json` locates it.
Browser-lock wait is recorded separately. The canonical runner acquires the shared
`my151-browser.lock` in the platform temporary directory (`os.tmpdir()`) itself;
do not wrap it in the same lock. When another run holds the lock, the runner names
the holder in `browser.log` and on stdout, and repeats the message every 5 minutes.

The other checks, which `scripts/ci-local.sh` also runs:

| Command | Covers |
|---|---|
| `npm run lint` | ESLint, including the comment ban and the written rules (see "Rules live in checks"). Pre-existing violations are recorded in `eslint-suppressions.json`, so this passes today and any *new* violation fails. Regenerate with `npx eslint . --suppress-all` only when deliberately accepting a new one. **If you *fix* a suppressed violation, run `npx eslint . --prune-suppressions`** — a stale entry exits 2 and fails CI just as loudly as a new violation. |
| `npm test` | Vitest unit tests (`src/**/*.test.ts`, `scripts/**/*.test.ts`). |
| `node scripts/check-viewport-tags.mjs` | Fails when a test that is not tagged `@viewport` skips `desktop`. That test runs in no project. Tag a test or describe `@viewport` when its result depends on the project width or device: a measured box, overflow, wrap, scroll, fit, touch, or a sheet-versus-pane branch. Leave a test untagged when it checks only state, copy, storage, or network, or when it pins its own viewport. |
| `node scripts/check-test-rules.mjs` | Enforces two rules from `AGENTS.md` section 4. It fails on a committed proof test: a test or spec named `proof-*` or `zz-proof*`, or one with a `// proof:` comment. It also fails on a unit test that is new since the merge base with production, unless the test imports `api/` or `scripts/` code, touches saved data (`store`, `persist`, `migrat`), or has `// keeps: <bug E2E misses>` in its first 5 lines. |
| `node scripts/check-sprite-revisions.mjs` | Fails when a file under `public/sprites` was replaced under the same name since production without a matching entry in `src/data/spriteRevisions.json`, or when an entry no longer matches its file. Sprites are cached `immutable` for a year and the service worker keeps them forever, so a replaced file needs a new URL. `src/lib/spriteUrl.ts` adds the entry as `?v=`. The error prints the entry to add. |
| `node scripts/check-shiny-masks.mjs` | Fails when a shiny sprite under `public/sprites/pokemon/shiny/` has an outline (alpha mask) that differs from its normal sprite's in any pixel. A different outline means the shiny shows another design. It also fails when a shiny has no normal sprite, or when `src/data/shinySprites.json` and the folder list different files. `scripts/fetch-shiny-sprites.ts` applies the same test and deletes a shiny that fails it. |
| `npm run credits:check-sprites` | Fails when a sprite file that a page shows has no row in `docs/credits/sprite-evidence.json`, or its bytes changed since its row, unless `scripts/sprite-reencodes.json` lists the change as a lossless re-encode. It also fails when `src/data/bundleCredits.json` (the Acknowledgements credit counts) or `docs/credits/pokeapi-delivery.json` is out of date. Each error names the row value to set or the command to run. See `docs/credits/README.md`. |
| `node scripts/build-favorite-sprite-ink.mjs --check` | Fails when a file in `public/sprites/pokemon` changed after its ink value in `src/favorites/model/spriteInk.json` was measured. The picker grid sizes each sprite by that value. `scripts/sprite-ink-measured.json` records the md5 of each file that was measured. Fix it with `npm run sprites:measure`, which needs a browser, and commit both files. |
| `node scripts/check-speed-test-detection.mjs` | Fails when code a browser or the server runs mentions Lighthouse, PageSpeed, a headless browser, or WebDriver. A page must never serve a speed test something different from what people get. |
| `node scripts/check-live-site-visits.mjs` | Fails when committed tooling opens `my151.app` in a browser and the file neither calls `protectLiveSite` (`scripts/live-site.ts`) nor opens `?notme`. Agent visits must never count as users. See AGENTS.md, "Visits to the live site". |
| `node scripts/check-bundle-budget.mjs` | Fails when the first-load download of the hub, the Pokédex builder, or the league builder grows more than 5% over its baseline in `scripts/performance/budgets.json`. Text is measured with Brotli, images as emitted, every `srcset` size included. It builds its own copy with a Vite manifest, so `dist/` does not change. After a change that shrinks a page, or an increase that was agreed on, run it with `--rebase` and commit the new baselines. |
| `node scripts/check-skill-triggers.mjs` | Fails when a skill this repository owns says "types `/<command>`" for a command other than its own name. Such a claim captures that command, including a Claude Code built-in such as `/doctor`. Vendored pstack skills are symbolic links, and the check skips them. |
| `npm run ontology:check` | Loads `data/ontology/` (the authored species, forms, evolutions, `AppId` ledger, tool verdicts, and the pinned PokeAPI snapshot), resolves form inheritance, and runs the checks in `docs/data-model/pokemon-ontology.md`: dangling links, a missing core fact, an ability outside the vocabulary, duplicate coordinates, missing or false tool verdicts, ledger changes against production, state twins, two forms with one PokeAPI identity, an unsourced mark on a fact the snapshot knows, and a disagreement with the snapshot that `data/ontology/reports/*-audit.json` does not list as reviewed. It then fails when `src/data/pokemon.json`, a file in `src/data/generated/`, or `data/ontology/reports/tool-verdicts.json` differs from the projection. These catalog files are generated: edit the species file, then run `npm run ontology:build`. `npm run ontology:audit` rewrites the audit reports and keeps hand reviews. `scripts/ontology/parity.test.ts` (in `npm test`, or `npm run ontology:parity`) proves the Favorite Picker and League catalogs assemble, from their generated files, the records the full projections hold. See `data/ontology/README.md`. |
| `node scripts/check-published-source.mjs` | Fails when a file under `public/licenses/source/` differs from the source file that `scripts/published-source.json` maps it to, when a published or fenced file is not in the manifest, or when a source file does not start with its license notice. Run it with `--write` to refresh the copies. See `.claude/rules/published-license-source.md`. |
| `npm run test:e2e` | Standalone full Playwright suite. The canonical CI runner selects its scope. Auto-starts isolated preview and development servers on ports derived from the worktree path. Use `PLAYWRIGHT_PREVIEW_PORT` and `PLAYWRIGHT_DEV_PORT` to override them. Projects: `mobile`, `desktop`, `narrow` (320px). `desktop` runs every test; `mobile` and `narrow` run only `@viewport` tests. Specs under `e2e/sweeps/` drive their own viewports and run only in `desktop`. |

Against a Vercel preview, skip the local web servers. A preview builds only on request (see "Vercel builds"):

```bash
PLAYWRIGHT_BASE_URL=https://<preview>.vercel.app bash scripts/ci-local.sh
```

The canonical runner keeps its local gates, then records external browser evidence. It drops the `dev` project, which needs `PREVIEW_FEATURES`. Standalone `e2e/preview.config.ts` retains its existing behavior.
