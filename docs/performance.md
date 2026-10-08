# Performance

How fast my151 must be, how to prove a speed change, and what has been tried.

## Targets

Michael chose these on September 28, 2026. They are field targets: Vercel Speed
Insights, at the 75th percentile (p75) and the 95th percentile (p95), with
phones and desktops read separately.

| Metric | Phone p75 | Desktop p75 | Phone p95 | Desktop p95 |
|---|---:|---:|---:|---:|
| Largest Contentful Paint (LCP) | 1.0 s | 0.6 s | 1.8 s | 1.2 s |
| Interaction to Next Paint (INP) | 75 ms | 50 ms | 150 ms | 100 ms |
| Cumulative Layout Shift (CLS) | 0.01 | 0.01 | 0.05 | 0.05 |

Why these numbers:

- LCP: 1 s is the limit for keeping a user's flow of thought.
- INP: the app's central tap opens the Pokémon browser. On the lab phone
  profile, its sheet costs 56–72 ms and its header and filters 105–136 ms before
  any result row, so a tighter phone target would need rows that appear after
  the sheet. That fails the merge bar below.
- The site has few visitors a day, so Speed Insights collects few phone
  samples a month. Read p75 monthly. p95 rests on very few samples a month, so
  it is a monthly check, not a gate on one change.

## The speed loop

Work one cause at a time, largest first. Stop when the field targets above are
met, not when the PageSpeed Insights list is empty: Lighthouse always lists
something, and some findings conflict with decisions recorded below.

1. Find the cause. `node scripts/performance/lighthouse.mjs --no-base` prints
   the PageSpeed Insights findings for every page, phone and desktop, largest
   estimated saving first. Confirm the cause in a trace before you change code.
2. Make the smallest change that removes it.
3. Run `node scripts/performance/lighthouse.mjs` and
   `node scripts/performance/lab.mjs`. Both compare production with your working
   tree. Paste both tables into the pull request.
4. Ship it when every guard passes and the change is not visible. A visible
   change goes to Michael first, with before and after.
5. Once a month, read the field data: Vercel Speed Insights, or the Core Web
   Vitals report in Search Console. Field data takes up to 28 days to show a
   change. Search Console's report is the same Chrome field data that
   `psi.mjs` prints for the origin, grouped by URL. It names no elements, so
   the causes come from the Lighthouse findings in step 1.

The tools:

- `node scripts/performance/lighthouse.mjs` runs Lighthouse, the engine behind
  PageSpeed Insights, with its mobile and desktop presets. It installs a pinned
  Lighthouse into the user cache on first use. `--url https://my151.app` runs it
  on a deployed site, with `?notme` so the runs stay out of the analytics.
- `node scripts/performance/psi.mjs` runs Google's PageSpeed Insights on the
  live site and prints the scores, the lab metrics, the real-user field data
  for the origin, and the findings. It needs `PAGESPEED_API_KEY` in the
  environment settings. Google may run a newer Lighthouse than
  `lighthouse.mjs`, so its numbers are the reference. Google cannot load a
  Vercel preview: previews need a Vercel login. Measure a change before it
  ships with `lighthouse.mjs`, which runs the same Lighthouse version and
  throttling here. Google's runs vary: one desktop run of the dex measured
  238 ms of blocking time and the next 0 ms, with four times the script time
  on the slower machine. Run 3 or more and read the median. Google answers a
  repeated request from its cache for a short time, so the script waits for a
  fresh run each time.
- `node scripts/performance/lab.mjs` loads each page in a throttled browser and
  measures LCP, blocking time, and INP for each tap step. Lighthouse loads pages
  without tapping them, so this is the only lab measure of INP.
- `node scripts/check-bundle-budget.mjs` runs in `scripts/ci-local.sh`. It
  fails when a page's first-load download grows more than 5% over its baseline
  in `scripts/performance/budgets.json`.

Timing on a shared machine is noisy. Both lab scripts mark a change only when
the samples do not overlap and the medians differ by more than 5%.

## Guards

A change can raise the score without a faster page. These guards stop that.
`lighthouse.mjs` checks the first five and exits with status 1 when one fails.

| Guard | Stops |
|---|---|
| FCP, LCP, Speed Index, TBT, CLS, and the last visual change must not get worse. | Content moved later so that the first paint is early. |
| The LCP element must stay the same element. | Content hidden, cut, or replaced by a smaller element. |
| Accessibility, best practices, and SEO: no score drop and no audit that passed before and fails now. | Speed bought with a worse page. "Serves images with appropriate resolution" is in best practices. |
| Every image must stay at least as sharp as before on the screen. | Smaller image copies that look blurry. |
| After load, each page must match production in pixels and text, phone and desktop. | Any change that people can see. A difference is not a failure: it means Michael decides before it ships. |
| `scripts/check-speed-test-detection.mjs`, in `ci-local.sh`, fails when shipped code mentions Lighthouse, PageSpeed, a headless browser, or WebDriver. | A page that serves a test a lighter page than people get. |
| `lab.mjs`: INP of each tap step must not get worse. | Startup work moved into the first tap. |

## Merge bar

Ship every speed change that does not hinder the user experience and does not
overly complicate the code. Prefer the smallest diff that removes the measured
cause. A change that users can see (content that appears later, a placeholder,
a new animation) goes to Michael first, with before and after.

## Tried and left out

| Idea | Why it was left out |
|---|---|
| Keep the Pokémon data off the hub (`claude/perf-hub-data`) | Hub phone LCP −12%, but 13 files, a manual chunk group, an async feedback context, and a slower first language pick. |
| Render the builder's first frame in a transition | Blocking time −58%, but the grid can appear later. |
| Show result rows after the phone sheet | Rows arrive 31 ms later than before. |
| Preload the Pokédex intro image for everyone | First paint got slower for returning visitors, who never see the card. Shipped instead (October 8): `pokedex-builder.html` preloads it only when the card will show. Lab phone, first visit: the image appears 1.0 s sooner (3.8 to 2.8 s). |
| `dir="ltr"` on the hub and league HTML | No measurable effect. |
| Load the hub's page code with its entry script, not a dynamic import (October 8) | Lab phone first paint 600 → 804 ms (+34%), and the hub was not usable sooner (2110 → 2076 ms, within noise). |
| `fetchpriority="high"` on the hub's largest screenshot (October 8) | No effect, LCP 3484 → 3500 ms: Chrome already raises every image in the viewport to high priority. |
| Load the feedback form on idle or first open (October 8) | First-load text only 2.7 KiB smaller on the hub, about 1 KiB on dex and league: the form's dependencies are needed at startup anyway. |
| Drop the favorites page's sprite prefetch (October 8) | Without it, a selector opened 8 s after landing fills over 0.5 s on a slow phone. Shipped instead: the sprites load in the order a visitor needs them (`src/favorites/model/spritePreload.ts`). Normal / Gen I goes first, then a touch screen loads the cells in view. A hovered, pressed, or focused cell jumps the queue, and the rest follow the first selector. A desktop visitor who leaves downloads 18 KiB of sprites, not 1.5 MiB. Selectors open as fast as before, except a late click on a slow desktop link, which fills over 0.5 s. |
| A `sizes` that follows the widest hub shot (October 8) | Accurate, but a 3x iPhone then loaded the 800px originals (722 KiB, not 270 KiB). Browsers pick the smallest copy that covers `sizes` times the pixel ratio. |

Lighthouse findings left open on purpose:

| Finding | Why it stays |
|---|---|
| "Image elements do not have explicit width and height" on the hub screenshots | Each screenshot's shadow would show as an empty frame while the image loads. CLS is already 0. |
| PageSpeed's robots.txt and llms.txt checks fail on the favorites page only ("Failed to fetch"), so its SEO score reads 92 | Google's runs only; no local tool reproduces it. The sprite prefetch (1,474 requests on the first load before October 8) is the likely cause, not a proven one. Googlebot reads robots.txt on its own, so search is not affected. Serving Google's run without the prefetch would serve a test a different page, which this repo forbids. |
| "Improve image delivery": compression of the hub's back shots | These are UI screenshots with small text and sprites at quality 86. A lower quality saves about 20–30 KiB and risks visible artifacts. |
| "Background and foreground colors do not have a sufficient contrast ratio" on the type filter chips in the Pokémon browser | White text on the official type colors: 13 of the 18 are under 4.5:1. They are the games' own badge colors, and Michael keeps them (October 8). |

The first plan, with earlier targets and a phase list, is on the unmerged
branch `codex/performance-program-plan`. This page replaces its targets.
