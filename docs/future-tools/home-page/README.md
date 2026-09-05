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

The artboards are taller than the viewport on purpose. `H` is the fold — the
viewport the page is composed for — and the footer sits below it, so the canvas
shows both. The generator's anchors are the shipped page's own numbers, so the
canvas and the app agree; change one and change the other.

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

The header, hero and card grid fill one viewport inside a `min-h-dvh` block,
and the footer comes after it. What a visitor sees before scrolling is exactly
that block, at every width. `min-h` rather than `h`, so a viewport too short for
the content pushes the footer further down instead of crushing the grid.

**It is in review, not launched.** It has no URL of its own, so nothing links
to it and no crawler finds it, and `main.tsx` adds `noindex, nofollow` when the
flag is set. Two of the three tool links point at slugs that do not exist yet:

| Card | Links to | Exists |
| --- | --- | --- |
| Custom Pokédex Builder | `/` | yes — the app today |
| Trainer Card & League Builder | `/pokemon-league-builder` | no |
| Favorite Pokémon Picker | `/favorite-pokemon-picker` | no |
| What's next? | opens the feedback sheet | yes |

### The coming-soon version

`?home=soon` is the same page with the favorite picker marked unbuilt: no
screenshots, the words "Coming soon" where the artwork would be, and no link.
The build mark stays with the feedback card, so the two unbuilt cards read as
two different states rather than one repeated card.

Known tradeoff: every cell reserves the overhang so all panels share a baseline,
which is what a card with artwork beside one without needs. In this version the
whole second row is artwork-free at two columns, so that reserve shows up as
empty space above it on phone and tablet. Closing it needs either a different
card order or a rule that knows the column count.

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

### Two things that are measured, not chosen

**The h1 size.** 21px is the largest whole pixel that keeps
"Make a custom Pokédex, pick favorite Pokémon, and more" to two lines at 320px,
the narrowest width the e2e projects cover; 22px spills to three. In the split
hero the h1 gets a 373px column at 1024px, where anything over 1.75rem runs to
four lines, so the large size waits for `xl`. Re-measure both if the copy
changes.

**Breakpoint order.** This repo sets `--breakpoint-md: 1024px`. Tailwind sorts
that px value ahead of `sm`'s 40rem, so it emits the `md` block *first* — and a
bare `sm:` utility then beats its own `md:` override above 1024px. Every tablet
rule on this page is `sm:max-md:`, never a bare `sm:`, so the two bands cannot
overlap. Nothing else in `src/` pairs `sm:` and `md:` on one property today, but
anything that does will hit this.

### Proving it

`e2e/sweeps/home-sweep.spec.ts` drives the real page at 20 widths from 320 to
1920 and reads geometry, never text:

```
npx playwright test e2e/sweeps/home-sweep.spec.ts --project=desktop
```

It checks horizontal overflow, the footer sitting below the fold,
card-on-card overlap, one-line headings, blurb
clipping, the bare strip at each card's right edge, artwork landing on the card
above, the build mark's air above and below, hero copy inside the frame, and
that `--art` resolves to what its band intends — that last one because the
breakpoint inversion above is invisible to every geometric check.
