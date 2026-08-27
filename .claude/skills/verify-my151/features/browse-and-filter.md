# Browse, filter, pick

The picker that feeds the builder: search and filter the National Dex, then choose
a Pokémon (or a whole evolution line).

## Sub-features

- Search by name.
- Filter by type, generation, evolution-line size, category, and archetype.
- Type filter is a `[data-testid="type-filter"]` grid (3×6 mobile, 6×3 desktop).
- Results show as evolution-line cards (`EvoLineCard`).
- On desktop the browser is a slide-in side panel; on mobile a bottom sheet
  (`role="dialog"`, `[data-overlay]`).

## How to get to it (user POV)

Tap a section's "+" add button in the builder, or open the browser panel directly.
The browser opens over or beside the grid.

## Driving it with the harness

The type filter is the one stable `data-testid` in the app, so drive filters
through it. After a filter, assert the visible result set changed (card count or
the ids present). To pick, click a card's add control and confirm the builder's
localStorage section grew (see `build-and-place.md`). On mobile surfaces the
browser is a sheet; assert `[data-overlay]` and `role="dialog"` appear before
driving it.

## Gotchas

- Filter setters are cleared on view change (`App.tsx`), so a filter does not
  persist across tabs; drive it within one browser session.
- Result cards have no stable test id; select structurally (first card, nth card)
  or by the sprite/image inside, not by localized name text.
- The mobile bottom sheet and desktop panel are different DOM shapes; the harness
  should branch on viewport, not assume one.
