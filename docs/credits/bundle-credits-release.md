# Bundle credits release

Historical captures and commands are in this folder's Git history.

Michael approves the bundle-credits design and its release in the coordinator
chat on October 14, 2026. The release combines `claude/credits-audit-fixes`
(`67d7a50c`) with production (`35383747`). The research-only
`claude/handoff-credits-2026-10-13` branch is not merged.

## Changes

- Credit PokéAPI sprites, Pokémon Showdown, the Generation 9 Resource Pack,
  and the Smogon Sprite Project through their source pages and permission quotes.
- Keep KingOfThe-X-Roads as the sole direct artist, for nine sprites from
  their own uploads. Remove the other 55 individual entries from the panel.
- Keep the research in the repository and exclude unused research from the
  browser build. Correct Ting-Lu's research attribution. Add the sprite ledger
  and its verification command. Make no sprite-image changes.
- Change "colours" to "colors" in the Pokémon Showdown description.
- Remove one trailing blank line from the generated evidence document.

## Completed checks

- `npm run i18n:extract` and `npm run i18n:verify`: pass.
- `npm run credits:check-sprites`: 1,419 shown sprite files have matching rows.
- `flock /tmp/my151-browser.lock bash scripts/ci-local.sh`: pass. This includes
  lint, 643 unit tests in 101 files, repository guards, 950 browser tests
  (39 existing skips), the production build, and all bundle budgets.
- The acknowledgments spec passes on desktop, mobile, and narrow projects.
  The previously reported one-cell outline language test also passes.
- The built acknowledgments chunk decreases from 94,271 to 30,999 bytes.

## Proof

Run the handoff's `tools/zz-proof-bundles.spec.ts.txt` as the temporary
`e2e/zz-proof-bundles.spec.ts`, with its spelling expectation changed to
"colors" and a JSON result attached through `testInfo.attach`:

```sh
npx playwright test e2e/zz-proof-bundles.spec.ts --project=desktop
```

- Before (`35383747`): fails because the artist list contains 56 entries
  instead of KingOfThe-X-Roads alone.
- After (`6d77a610`): passes. Each bundle has its expected description,
  one permission quote, source links, and no sprite count. The direct artist
  has nine sprites. No Mega Zygarde credit appears.
- The temporary proof is deleted from both worktrees before release.

## Browser comparison

The full differential run finds zero new regressions. The desktop Chrome,
iOS Safari and Chrome personas, and Android Chrome persona all pass.
WebKit has two pre-existing failures: `gym-export:tm-two-word-wrap` and
`gym-export:tm-one-word-line`. Both have `before=fail`, as the handoff predicts.
The harness labels its aggregate verdict `FAIL` because those checks fail;
this release does not claim that aggregate is green. The repository permits
pre-existing failures with measured baseline evidence.

The visual comparison finds zero changed screens, zero changed regions, four
unstable screens, and zero capture errors. Its fixed screens cover the other
tools; the credits panel has its separate proof and captures.

Each build has 12 whole-screen credits captures at 390 and 1280 pixels.
The final render audit is clean, as is the audit of all 12 comparison sheets.
The capture audit excludes the inert, off-canvas credits pane from measurement;
it does not alter the application or hide active content.

Chrome and WebKit pass their engine health checks.
Firefox fails to start its Marionette listener in this workspace
(`ECONNREFUSED 127.0.0.1:2828`); Firefox coverage is unavailable.

The local browser installations and launch configuration are verification
artifacts only. They do not change the application or its dependencies.

## Evidence

- Measured results
- Mobile overview, before and after
- Desktop overview, before and after
- Mobile Showdown description, before and after
- Desktop Showdown description, before and after
