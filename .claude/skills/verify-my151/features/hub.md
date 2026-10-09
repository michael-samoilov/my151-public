# Hub

The landing page at `/`. It links to each tool and asks what to build next.

## Sub-features

- Four cards, each a `[data-card-panel]`. Three are tools: the dex builder
  (`/pokedex-builder`), the League Builder (`/custom-gym-leader`), and the
  favorite Pokémon picker (`/favorite-pokemon-picker`). The fourth, "What
  should we build next?", is a `button` that opens the feedback form on the
  Idea category.
- Each tool card has two links to its tool: the panel link and the link in its
  `h2` title. The first artwork's alt text in each panel link starts with the
  tool name. The header's Tools menu holds a third, hidden link to each tool.
- Each of the three tool cards has a `[data-card-progress]` line under the
  blurb with the saved count, such as "0/151 entries saved in this browser".
  It shows 0 before the tool is used. For a tool with saved work, the
  prerendered page hides the count until the app reads it, so it never shows 0
  first. The hub reads the dex, league, and picker stores and never writes
  them.
- From October 6 to 13, 2026, a returning visitor sees a callout on the Tools
  menu (`[data-testid="favorites-launch-notice"]`, `role="status"`). It does not
  show when `p151-favorites-launch-seen` is set.
- On mount, the hub marks the league promo as seen
  (`p151-league-promo-seen`).
- The header holds the language picker, the feedback button, and the Tools menu
  (`[data-testid="tools-menu"]`).
- Layout: a 2x2 grid on a phone, and four columns on one row on desktop.

## How to get to it (user POV)

Open `/` and tap a card to go to its tool. `/?admin` on the same entry loads
the admin dashboard instead (see `admin.md`).

## Driving it with the harness

The harness has no hub suite. The visual diff (`harness/lib/visual.ts`)
renders the `hub` and `hub-progress` screens. `runFavoritesSuite` visits `/`
and checks the picker card (`favorites:hub-card`). The standard suite starts at
`/pokedex-builder`, and the league suites start at `/custom-gym-leader`.

Manual drive (a Playwright script, local build):

1. At 390px and at 1280px, open `/` and count four `[data-card-panel]`.
2. Read each card link's `href`, and assert no horizontal overflow.
3. Expect each `[data-card-progress]` line to read 0.
4. Seed `personal-151-pokedex-v3` with a dex, reload, and expect the dex line
   to show the count.

## Gotchas

- The panel link and the title link both send `hub-cta-dex`, `hub-cta-league`,
  or `hub-cta-favorites` to `/api/event`. The page sends `hub-shown` on mount.
  No beacon goes out in demo mode or with `?notme`. On local `vite preview`,
  each beacon gets a 404.
- A bare `a[href="/pokedex-builder"]` can match the hidden Tools menu link.
  Scope it to `main` or `[data-card-panel]`.
- The phone's wide bar and the desktop card are different markup, picked in JS
  by `useIsDesktop`, not by CSS. The bar shows only for an odd card count, so
  with four cards it never renders.
- Opening the Tools menu also dismisses the launch callout.
- The standard suite sets `p151-league-promo-seen`, `p151-moved-notice-seen`,
  and `p151-favorites-launch-seen` to keep the launch prompts out of its shots.
  Remove them to see the prompts.
- Most hub copy is translated in every locale. The `home.h1` heading and the
  `home.next.title` card title fall back to English, and the dex and league
  artwork alt texts are hard-coded English (see `language.md`).
