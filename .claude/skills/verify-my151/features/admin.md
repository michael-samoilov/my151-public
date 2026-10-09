# Admin dashboard

The owner's analytics dashboard at `/?admin`, on the hub's entry. It is not
public product UI.

## Sub-features

- A token form. The token saves under `p151-admin-token` and goes out as a
  bearer header to `/api/submissions`, `/api/search-performance`,
  `/api/feedback-list`, and `/api/archive-entry`.
- `[data-testid="admin-this-browser"]` at the top of each section shows
  whether this browser is excluded by `?notme` (`p151-opt-out`), with its short
  ID, and a button that flips the flag.
- `/?admin&demo` loads bundled fixtures, signs in without a token, and makes no
  API call.
- Section nav (`nav[aria-label="Admin section"]`, buttons with
  `aria-pressed`): Suite, Dex, League, Picker, Search, and Feedback. The last
  tool read saves under `p151-admin-tool` (`all`, `dex`, `league`, or
  `favorites`).
- A date range ribbon (`[role="group"][aria-label="Date range"]`, buttons with
  `aria-pressed`) sits on every tab except Feedback. The range saves under
  `p151-admin-range`.
- The Suite, Dex, League, and Picker tabs are stacks of `main > section`
  panels, such as active users, flows, build depth, and who. Suite holds
  cross-tool panels only. What people pick and Newest browsers sit on Dex,
  League, and Picker. Search performance (`[data-testid="search-performance"]`)
  has its own Search tab. With a token, opening it asks
  `/api/search-performance?refresh=1`. Search and Feedback hold no
  `main > section` panels.
- What people pick opens a picks page. On Dex, its sections are the build
  page sections. On League, the first section is `[data-section-id="ace"]`,
  then one per card type in type order, then `none`, each capped at 4 rows
  of 9 faces. League numbers are league counts.
- The Picker picks page (`PickerPicksPage`) is a favorites grid,
  `[data-testid="admin-picker-picks"]`. A selected cell's pane or sheet is
  `[data-testid="favorites-picker"]`. It has no `[data-section-id]` or
  `[data-face-id]`.
- A user preview (`[data-user-preview][role="link"]`) opens one browser's
  detail: `[data-testid="league-visit-board"]`,
  `[data-testid="admin-gym-card"]`, `[data-testid="admin-slot-N"]`,
  `[data-testid="admin-dex-snapshot"]`,
  `[data-testid="admin-favorite-snapshot"]`, and a session scrubber,
  `input[aria-label="Scrub sessions"]`. When that browser sent feedback, the
  detail header shows `[data-testid="admin-feedback-chip"]`, which opens its
  reports on the Feedback tab.

## How to get to it (user POV)

Open `/?admin` and paste the token, or open `/?admin&demo` for fixtures. On a
phone the section nav is a bar at the bottom. On desktop it sticks to the top.

## Driving it with the harness

The harness has no admin suite. Most of the repo's `e2e/admin-*.spec.ts`
specs run against `/?admin&demo`. Five of the 12 seed a token and
route-stub the APIs with `buildDashboard` from `api/_dashboard.ts` (see
`e2e/admin-feedback-links.spec.ts`).

Manual drive (a Playwright script):

1. At 390px and at 1280px, open `/?admin&demo`.
2. Press each nav button and count the visible `main > section` panels.
3. Assert that no panel is wider than the viewport.
4. Compare the counts with the base build.

Other handles: `[data-testid="heatmap-grid"]` and
`[data-testid="heatmap-cell"]`, `[data-testid="cross-tool-venns"]`,
`[data-who-*]` on the who panel, and `[data-section-id]` and `[data-face-id]`
on the Dex and League picks pages.

## Gotchas

- Use `/?admin&demo`. It needs no token, and without a token the archive
  toggle writes nothing. Demo mode has no token, so the Feedback tab shows
  "Sign in to read feedback." and Search makes no refresh request.
- With a real token, the archive toggle posts to `/api/archive-entry` and
  changes production data. Do not press it in a drive.
- Section titles are hard-coded English `h2` text. Count sections. Do not match
  their text.
- The panel set depends on the data and the tab, so compare with the base build
  instead of a fixed count.
