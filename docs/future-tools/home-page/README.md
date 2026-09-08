# Home page

The router page: one card per tool, plus a call to action. Two things live here.

For the launch view of this work — what the branch owns, what it waits on, and
what is still undecided — read [HANDOFF.md](HANDOFF.md). This file is how the
page and its tooling work.

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
| Custom Region & Pokédex Builder | `/` | yes — the app today |
| Trainer Card & League Builder | `/pokemon-league-builder` | on its own branch |
| What should we build next? | opens the feedback sheet | yes |

The favorite Pokémon picker is off the page until it is built. Adding it back is
one entry in `useTools()`: the grid's column count, the overhang reserve, and
whether the call to action spans a row all follow from the count.

### Getting there

The wordmark in the app header links to it, the way a logo does on any other
site (`HOME_HREF` in `src/components/layout/Header.tsx`). It is a link rather
than a fourth nav tab: the router is a separate entry point, and the Pokédex
lives in localStorage, so the full navigation loses nothing. When the page gets
a real route, `HOME_HREF` and the constant in
`e2e/wordmark-home.spec.ts` are the two lines that change.

### The call to action's two shapes

Three tools leave an orphan in the phone's two-up grid, so the call to action
fills that row on its own: a wider, shorter panel with the build mark beside its
copy rather than above it. It is not a tool, and this is the one place the page
says so in shape rather than in words. At the desktop breakpoint it is an
ordinary card in a three-across rail. The two are different markup and exactly
one mounts, through `useIsDesktop` — the same pattern the browser panel and the
analytics drilldown already use.

### Where the overhang comes from

The room above a panel belongs to the artwork, not to the card, so a row with no
artwork in it simply sits higher. That is how the call-to-action row closes the
gap under the tools today, and how it drops back down by itself when the
favorite picker arrives with screenshots of its own.

The reserve is shared across a row, though. One card keeping room it does not
need is the price of every panel in that row sharing a top edge, and that edge
is what puts the first line of every title on one baseline. Alignment has to be
structural: the app ships in eight languages, and a translated title wraps
differently, so copy tuned to equal line counts in English cannot hold it.

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

Each row reserves its overhang with `padding-top` on the cells in it, so a card
can never land on the one above it however the grid reflows.

The ratios match the generator's, written against the same 166-unit card, so the
two stay comparable.

### Two things that are measured, not chosen

**The h1 size.** 21px is the largest whole pixel that keeps
"Make a custom Pokédex, build a league, and more" to two lines at 320px, the
narrowest width the e2e projects cover; 22px spills to three. The copy is
measured too: the longer "build a gym leader league" ran to three lines there. In the split
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

Five things it settles, so nobody has to do them by hand:

- **No chrome to crop.** A headless viewport is the page and nothing else — no
  URL bar, no notch, no clock or battery. A capture from a real phone has all
  three and needs cropping; this has none.
- **The app's own headers, cut.** On a page shot the wordmark bar and the
  per-page bar under it are chrome too, and they are in the viewport. The
  capture measures where they end and starts below them, in a viewport a phone's
  height taller, so what is left is exactly a phone's worth of content.
  `scrollTo` names a heading to bring to the top of that frame — the analytics
  shot uses it to start at the type charts rather than at What's Missing.
- **Edge to edge.** Every shot is taken at a phone's width, so the page lays
  itself out for a phone and nothing is cut off at the sides. The assets that
  predate this were a wider render cropped to a phone's shape, which read as
  zoomed in.
- **Corners stay out of the image.** The card rounds them at render time with
  `border-radius` and `overflow: hidden`, scaled to the card, so one flat
  rectangle serves the 110px phone card and the 263px desktop card alike.
  Baking them in would fix the radius to one size and leave a hard edge at every
  other. `PHONE_RADIUS` in `HomePage.tsx` holds the proportion, and it is a
  phone's — 47.3pt on a 390pt screen — not this app's card radius, because the
  shot is a picture of a phone screen.
- **Enough resolution.** The widest card is desktop's three-across at 1440:
  409px, showing 263 CSS px of screenshot, which wants 789 device px on a 3x
  display. `OUT_WIDTH` is 800, captured at 3x and resampled once. The assets
  that predate this script are 286px wide and soften on a retina desktop.

### Three of the four are exports

The dex's View page and the league's two cards all export a PNG, and the export
is the honest thing to show: it is the file a visitor would get, footer line and
all, without the app's editing chrome around it. Each one goes through the
button a person presses, so a change to what the export draws reaches these
assets on the next run. Only the analytics shot is the app itself, because
analytics has nothing to export.

An export is shorter than a phone in proportion, so the frame ends at the
image's own bottom edge rather than padding out to a full phone's height. What
that saves is a fifth of the file and a band of dead colour in the asset — the
card clips every shot well above there in any case.

### The band at the top

The card rounds each shot's corners at a phone's radius, and that curve eats
into the first rows of pixels. Every shot gets a band of 2.5% of its width above
it, in its own top-left colour — the page's grey on the analytics shot, the
card's frame on the trainer card export. Sampled rather than named, so a change
to either colour follows.

The script then refuses to write an asset with ink inside that curve, reading
the pixels the curve would cut against the radius the card rounds at. Ink, not
every pixel: the dex export's top-right section outline is a pale hairline the
curve grazes by three pixels, which is 0.4 of a pixel at the card's phone size.
Drop `PAD` to zero and the run stops on the first shot.

### The league shots' state

The league builder is still on `claude/pokemon-league-builder-soqxj6`, so the
script checks that branch out into `.league-shot-tree/`, builds it, and serves
it beside this one. Once `pokemon-league-builder.html` is in this tree the
worktree is skipped and both apps come from the same build.

The state behind them is `league-fixture.json`, written into the league store's
persisted key before the app boots. A fixture rather than the app's own Kanto
seed, because that seed deliberately leaves two rows blank to keep the empty
state in front of whoever is working on the page. The fixture is that seed with
the vacancies filled, Brock's card as the shot wants it, and the champion
carrying neither a Mega nor a legendary. Nothing in `src/` is patched to take
the shot.

To add or change a shot, edit the `SHOTS` map: `url` carries whatever query the
state needs (`?demo=151` seeds a full Pokédex), `nav` names the view tab to press
first, `scrollTo` names a heading to bring to the top of a page shot, and
`exportButton` finds the button that makes an export. Nothing else changes.

### Proving it

`e2e/sweeps/home-sweep.spec.ts` drives the real page at 20 widths from 320 to
1920 and reads geometry, never text:

```
npx playwright test e2e/sweeps/home-sweep.spec.ts --project=desktop
```

It checks horizontal overflow, the footer sitting below the fold, panels in a
row sharing a top edge, card-on-card overlap, the call to action having exactly
one shape per band, one-line headings, blurb clipping, the bare strip at each
card's right edge, artwork landing on the card above or running off the window's
left edge, the build mark sitting centred, hero copy inside the frame, and that
the page gutter resolves to what its band intends — that last one because the
breakpoint inversion above is invisible to every geometric check.

Seven mutations of the page each turn it red: an unshared overhang reserve, a
call to action that stops spanning, one that mounts on desktop, screenshots
grown until the red strip closes, a bare `sm:` gutter, an off-centre build mark,
artwork popped far enough left to leave the window, and a shot too short to
reach the panel's bottom edge — that last one because the assets are cropped to
their own content, and one cropped too far would leave bare red under the
artwork without failing a type check.
