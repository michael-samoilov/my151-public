# Hub

The landing page at `/`. It links to each tool and asks what to build next.

## Sub-features

- Three cards, each a `[data-card-panel]`: the dex builder
  (`a[href="/pokedex-builder"]`), the League Builder
  (`a[href="/custom-gym-leader"]`), and a "next tool" card. The last one is a
  `button` that opens the feedback form on the Idea category.
- A saved dex turns the dex card's blurb into a "continue" line with the placed
  count. The hub reads the dex store and never writes it.
- A returning visitor with a saved dex sees a one-time notice on the Tools menu
  (`[data-testid="moved-notice"]`, `role="status"`) that says where the builder
  went. Showing it also marks the league promo as seen.
- The header holds the language picker, the feedback button, and the Tools menu
  (`[data-testid="tools-menu"]`).
- Layout: two columns on a phone, where an odd last card becomes a wide bar
  across both (`col-span-2`). Desktop puts every card on one row.

## How to get to it (user POV)

Open `/` and tap a card to go to its tool. `/?admin` on the same entry loads
the admin dashboard instead (see `admin.md`).

## Driving it with the harness

The harness has no hub suite. The standard suite starts at `/pokedex-builder`,
and the league suites start at `/custom-gym-leader`.

Manual drive (a Playwright script, local build):

1. At 390px and at 1280px, open `/` and count three `[data-card-panel]`.
2. Read each card link's `href`, and assert no horizontal overflow.
3. Seed `personal-151-pokedex-v3` with a dex, remove `p151-moved-notice-seen`,
   and reload.
4. Expect `[data-testid="moved-notice"]`, and `p151-league-promo-seen` set to
   `1`.
5. Click `[data-testid="moved-notice"] button` and expect
   `p151-moved-notice-seen` set to `1`.

## Gotchas

- A card link sends a `hub-cta-dex` or `hub-cta-league` event to `/api/event`
  unless demo mode or `?notme` is on. On local `vite preview` it gets a 404.
- The phone's wide bar and the desktop card are different markup, picked in JS
  by `useIsDesktop`, not by CSS. Exactly one mounts.
- Opening the Tools menu also dismisses the moved notice.
- The standard suite sets `p151-league-promo-seen` and `p151-moved-notice-seen`
  to keep the launch prompts out of its shots. Remove them to see the prompts.
- Hub copy is English in every locale (see `language.md`).
