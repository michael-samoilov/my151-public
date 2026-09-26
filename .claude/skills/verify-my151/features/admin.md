# Admin dashboard

The owner's analytics dashboard at `/?admin`, on the hub's entry. It is not
public product UI.

## Sub-features

- A token form. The token saves under `p151-admin-token` and goes out as a
  bearer header to `/api/submissions`.
- `/?admin&demo` loads bundled fixtures, signs in without a token, and makes no
  API call.
- Section nav (`nav[aria-label="Admin section"]`, buttons with
  `aria-pressed`): Suite, Dex, League, and Feedback. The last tool read saves
  under `p151-admin-tool` (`all`, `dex`, or `league`).
- Each tab is a stack of `main > section` panels, such as active users, flows,
  build depth, and who. Search performance shows on Suite only.
- A user preview (`[data-user-preview][role="link"]`) opens one browser's
  detail: `[data-testid="league-visit-board"]`,
  `[data-testid="admin-gym-card"]`, `[data-testid="admin-slot-N"]`,
  `[data-testid="admin-dex-snapshot"]`, and a session scrubber,
  `input[aria-label="Scrub sessions"]`.

## How to get to it (user POV)

Open `/?admin` and paste the token, or open `/?admin&demo` for fixtures. On a
phone the section nav is a bar at the bottom. On desktop it sticks to the top.

## Driving it with the harness

The harness has no admin suite. The repo's `e2e/admin-*.spec.ts` specs run
against `/?admin&demo`.

Manual drive (a Playwright script):

1. At 390px and at 1280px, open `/?admin&demo`.
2. Press each nav button and count the visible `main > section` panels.
3. Assert that no panel is wider than the viewport.
4. Compare the counts with the base build.

Other handles: `[data-testid="heatmap-grid"]` and
`[data-testid="heatmap-cell"]`, `[data-testid="cross-tool-venns"]`,
`[data-who-*]` on the who panel, and `[data-section-id]` and `[data-face-id]`
on the picks page.

## Gotchas

- Use `/?admin&demo`. It needs no token, and without a token the archive
  toggle writes nothing.
- With a real token, the archive toggle posts to `/api/archive-entry` and
  changes production data. Do not press it in a drive.
- Section titles are hard-coded English `h2` text. Count sections. Do not match
  their text.
- The panel set depends on the data and the tab, so compare with the base build
  instead of a fixed count.
