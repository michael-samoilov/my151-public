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

### Getting there

The wordmark in the app header links to it, the way a logo does on any other
site (`HOME_HREF` in `src/components/layout/Header.tsx`). It is a link rather
than a fourth nav tab: the router is a separate entry point, and the Pokédex
lives in localStorage, so the full navigation loses nothing. When the page gets
a real route, `HOME_HREF` and the constant in
`e2e/wordmark-home.spec.ts` are the two lines that change.

### The coming-soon version

`?home=soon` is the same page with the favorite picker marked unbuilt: no
screenshots, the words "Coming soon" where the artwork would be, and no link.
The build mark stays with the feedback card, so the two unbuilt cards read as
two different states rather than one repeated card.

The overhang reserve belongs to the artwork, not the card: a card with
screenshots reserves room above itself for them to pop into, a card without
reserves nothing. Panels still line up across a row because each cell stretches
to the row's height and its panel sits at the bottom. So a row where no card has
artwork is simply shorter — in this version the second row sits a plain grid gap
below the first on phone and tablet — and when the picker goes live, its card
gains screenshots and the row drops back down on its own. The card order never
changes.

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

### The screenshots

`capture-shots.mjs` takes them from the real app. It builds, serves, drives a
headless Chromium at the phone viewport, and writes WebP into `src/assets/home/`.

```
node docs/future-tools/home-page/capture-shots.mjs --list   # what each shot is
node docs/future-tools/home-page/capture-shots.mjs          # capture them all
node docs/future-tools/home-page/capture-shots.mjs dex      # just one
```

Three things it settles, so nobody has to do them by hand:

- **No chrome to crop.** A headless viewport is the page and nothing else — no
  URL bar, no notch, no clock or battery. A capture from a real phone has all
  three and needs cropping; this has none.
- **Corners stay out of the image.** The card rounds them at render time with
  `border-radius` and `overflow: hidden`, scaled to the card, so one flat
  rectangle serves the 110px phone card and the 263px desktop card alike.
  Baking them in would fix the radius to one size and leave a hard edge at every
  other. Every asset is a plain rectangle today; all four corners are opaque.
- **Enough resolution.** The widest card is desktop's three-across at 1440:
  409px, showing 263 CSS px of screenshot, which wants 789 device px on a 3x
  display. `OUT_WIDTH` is 800. The assets that predate this script are 286px
  wide and soften on a retina desktop.

To add or change a shot, edit the `SHOTS` map: `url` carries whatever query the
state needs (`?demo=151` seeds a full Pokédex), and `nav` names the view tab to
click first. Nothing else changes.

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
