# Picker interface localization evidence

The interface uses the existing English catalog and eight translated UI overlays. All nine locales now have picker badges, empty states, settings, buttons, scroll hints, headings, and accessible generation labels.

Pokémon names and power-up terminology remain the name worker's scope. Type names still use the checked-in official game terms. Picker wording is authored UI copy. Shared Gym Leader and Legendary terminology follows the pinned game text in `docs/i18n/sources/picker-interface-terms.json`. The same fixture records German `Starter-Pokémon` from X/Y. German `Starter` and `Generation` match English spelling, so the translation gate has two explicit exceptions.

## Proof

Base commit: `8f1b87fcbb37cbb7da4387fe9c65402a3d545842`.

Command: `flock /tmp/my151-browser.lock npx playwright test e2e/zz-proof-picker-localization.spec.ts --project=desktop --workers=1`.

Before: 2 passed, 8 failed. Each non-English locale expected its localized heading and received `Favorite Pokémon Picker by Type and Generation`.

After: 10 passed. Each locale displayed its translated heading and settings. The temporary proof is removed before commit.

## Screens

The French screens use the same saved picks, `fire|1=6` and `water|1=9`, and open settings. Phone is 390×844. Desktop is 1280×800.

| Screen | Before | After |
| --- | --- | --- |
| Phone | ![English picker text before localization](evidence/before-390.png) | ![French picker text after localization](evidence/after-390.png) |
| Desktop | ![English picker text before localization](evidence/before-1280.png) | ![French picker text after localization](evidence/after-1280.png) |

The after screens pass the render audit with no app hard findings. Existing small-text and sprite-scale warnings remain. Whole-screen screenshots were inspected after the audit.

## Branch checks

- `npm run lint` passes with two pre-existing warnings.
- `npm test` passes all 486 tests in 72 files.
- `npm run build` passes, including `i18n:verify`.
- `flock /tmp/my151-browser.lock npx playwright test e2e/favorites-*.spec.ts --project=desktop --project=mobile --project=narrow --workers=2` passes 94 cases; 4 cases skip.
- Test rules and viewport tags pass.

## Shared controls

The shared controls use `lang.change`, `lang.title`, `feedback.title`,
`footer.report`, `faq.summary`, and `tools.title`, `tools.dex`, `tools.league`,
`tools.favorites`. The feedback form itself is outside this change.

The shared-control proof fails before the change because French shows `Tools`
instead of `Outils`. After the change, all 12 proof cases pass. The last run
also measures the translated document title and HTML language for all nine locales.
The temporary proof is removed before commit.

| Screen | Before shared-control translations | After shared-control translations |
| --- | --- | --- |
| Phone | ![English tool-menu label before translation](evidence/after-390.png) | ![French tool-menu label after translation](evidence/chrome-after-390.png) |
| Desktop | ![English tool-menu label before translation](evidence/after-1280.png) | ![French tool-menu label after translation](evidence/chrome-after-1280.png) |

`evidence/locale-fit.json` records 27 render-audit rounds across all nine
locales at 320, 390, and 1280 pixels. Each round has zero app hard findings.
Each heading takes at most two lines and has no horizontal text overflow.
The shared-header specs pass all 3 cases. Lint, 486 unit tests, and build pass.

## Verification boundary

The coordinator runs verify-my151 on the integrated picker work. This worker does not claim all-engine verification. The stock doctor probes a `data:` URL, which the managed Chromium policy blocks; HTTP localhost works. WebKit and Firefox setup belongs to the coordinator.
