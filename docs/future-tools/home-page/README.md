# Home page

The router page: four cards, one per tool. Two things live here.

## The mockup

`build-artboards.mjs` generates the design canvas — 12 artboards across three
directions, published at
<https://claude.ai/code/artifact/282c8e5d-530e-48d3-8616-c3047a629b0a>.

```
node docs/future-tools/home-page/build-artboards.mjs   # regenerate canvas/
node docs/future-tools/home-page/sweep.mjs             # 45 frames, 320-2560px
node docs/future-tools/home-page/sweep.mjs --mutate all # prove the sweep can fail
node docs/future-tools/home-page/sweep.mjs --floor      # shortest viewport that fits
```

The generator throws rather than rendering a broken card. Four rules:

1. A screenshot must run past the card's bottom, or the effect collapses into
   a picture pasted on a tile.
2. The grid's top padding must clear the overhang, or row one's artwork lands
   on the hero.
3. The gradient must end above the point where the artwork starts hanging off
   the card's left edge.
4. A bare red strip must remain at the card's right edge.

## The page

`src/components/home/HomePage.tsx`, reached at `?home`.

**It is in review, not launched.** It has no URL of its own, so nothing links
to it and no crawler finds it, and `main.tsx` adds `noindex, nofollow` when the
flag is set. Two of the three tool links point at slugs that do not exist yet:

| Card | Links to | Exists |
| --- | --- | --- |
| Custom Pokédex Builder | `/` | yes — the app today |
| Trainer Card & League Builder | `/pokemon-league-builder` | no |
| Favorite Pokémon Picker | `/favorite-pokemon-picker` | no |
| What's next? | opens the feedback sheet | yes |

The slugs come from `../HANDOFF.md` and `../league-builder/DECISIONS.md`. Give
the page a real route only when the tools it routes to are ready. That move also
decides whether the dex builder keeps `/`; see the SEO note in `HANDOFF.md`.

### How the card scales

Every measurement inside a card is a share of the card's own width, expressed in
`cqw` against a cell wrapper that carries `container-type: inline-size`. A
breakpoint only picks how many cards fit in a row; the card scales itself. That
is the container-relative knob CLAUDE.md sanctions, not a `vw` clamp — a `vw`
clamp would fight the root font-size and shrink under an iOS pinch-zoom.

Each cell reserves its own overhang with `padding-top`, so a card can never land
on the one above it however the grid reflows.

The ratios match the generator's, written against the same 166-unit card, so the
two stay comparable.

### Proving it

`e2e/sweeps/home-sweep.spec.ts` drives the real page at 20 widths from 320 to
1920 and reads geometry, never text:

```
npx playwright test e2e/sweeps/home-sweep.spec.ts --project=desktop
```

It checks horizontal overflow, card-on-card overlap, one-line headings, blurb
clipping, the bare strip at each card's right edge, artwork landing on the card
above, the build mark's air above and below, and hero copy inside the frame.
