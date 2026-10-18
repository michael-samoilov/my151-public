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
  `lighthouse.mjs`, so its numbers are the reference. This project's previews
  are public after Vercel Authentication was disabled on 15 October 2026.
  Verify a direct HTTP 200 without a login redirect before testing.
  Compare a preview of current production code with the candidate preview,
  never a preview with the live site. Previews seed demo Pokémon and a demo
  league; production starts empty. Record both commits, build modes, seeded
  inputs, actual URLs, fetch times, and Lighthouse versions. Keep an actual
  production baseline separate from this controlled comparison.
  `lighthouse.mjs` runs the
  same Lighthouse version and throttling here without a deploy. Google's runs vary: one desktop run of the dex measured
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
| `scripts/check-speed-test-detection.mjs`, in `ci-local.sh`, fails when shipped code mentions Lighthouse, PageSpeed, a headless browser, or WebDriver. One file is exempt: `src/lib/automation.ts` reads `navigator.webdriver` only to mark beacons so the server stores nothing. `e2e/automation-flag.spec.ts` proves the page sends the same requests with and without the flag. | A page that serves a test a lighter page than people get. |
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
| Smaller copies of the hub screenshots (300 and 400 px) | Removed on 9 October. Screens drew them at about their own size, which looked soft. They saved about 450 KiB of images on phones but no measured LCP or score. Every device loads the 800 px originals. |
| Preload the Pokédex intro image for everyone | First paint got slower for returning visitors, who never see the card. Shipped instead (October 8): `pokedex-builder.html` preloads it only when the card will show. Lab phone, first visit: the image appears 1.0 s sooner (3.8 to 2.8 s). |
| `dir="ltr"` on the hub and league HTML | No measurable effect. |
| Load the hub's page code with its entry script, not a dynamic import (October 8) | Lab phone first paint 600 → 804 ms (+34%), and the hub was not usable sooner (2110 → 2076 ms, within noise). |
| `fetchpriority="high"` on the hub's largest screenshot (October 8) | No effect, LCP 3484 → 3500 ms: Chrome already raises every image in the viewport to high priority. |
| Load the feedback form on idle or first open (October 8) | First-load text only 2.7 KiB smaller on the hub, about 1 KiB on dex and league: the form's dependencies are needed at startup anyway. |
| Drop the favorites page's sprite prefetch (October 8) | Without it, a selector opened 8 s after landing fills over 0.5 s on a slow phone. Shipped instead: the sprites load in the order a visitor needs them (`src/favorites/model/spritePreload.ts`). Normal / Gen I goes first, then a touch screen loads the cells in view. A hovered, pressed, or focused cell jumps the queue, and the rest follow the first selector. A desktop visitor who leaves downloads 18 KiB of sprites, not 1.5 MiB. Selectors open as fast as before, except a late click on a slow desktop link, which fills over 0.5 s. |
| Start the page code after the first paint on the league page and the hub (October 9) | League: the builder appeared 0.3 to 0.5 s later on a throttled phone, because its code is the largest. Hub: Google's score did not change. Shipped instead on the picker and the Pokédex, for first visits only (`startAppAfterFirstPaint` in `vite.config.ts`): Google's phone score for the picker 84 to 99, the picker's header at 0.5 s instead of 1.5 s, the Pokédex's loading screen at 1.0 s instead of 1.5 s, and each tool at the same time as before. A visitor with saved work starts at once, because with a full Pokédex the builder otherwise appeared 0.2 s later. |
| Drop the "Inter Fallback" font faces, to stop Google's late first frame (October 9) | The late first frame stayed: 2 of 5 hub runs without the faces, 0 of 5 with them. |
| A `sizes` that follows the widest hub shot (October 8) | Accurate, but a 3x iPhone then loaded the 800px originals (722 KiB, not 270 KiB). Browsers pick the smallest copy that covers `sizes` times the pixel ratio. |

Lighthouse findings left open on purpose:

| Finding | Why it stays |
|---|---|
| Google's phone runs sometimes draw the first frame about 2 s after the page has loaded, on the hub and the Pokédex | Partly explained on 13 October: under Lighthouse, when a page's linked stylesheet arrives after about 170 ms, Chrome holds the first frame until about 1.3 or 2.3 s. Proof: the stylesheet served instantly gives a first paint at 0.18 s; the same stylesheet 250 ms late gives 1.3-2.3 s; a page with no stylesheet paints at 0.15 s. The app's code, fonts, `rel=expect` and the boot scripts are not involved, and a plain browser is not affected. A requested animation frame does not help (an earlier test that said so was confounded). The hub's stylesheet is inline since 13 October, with Michael's approval: on the live network, Lighthouse phone runs went from a score of 65-66 to 81-89 and a Speed Index of 5.6-5.8 s to 1.6-1.9 s (5 runs each). The cost, in `lab.mjs` on a throttled phone: the main screenshot finishes 9% later (4040 to 4408 ms), because without a pending stylesheet Chrome no longer holds the other screenshots back. Low-priority hints on those screenshots did not help. But Google's own PageSpeed Insights runs after the deploy still drew the first frame late in 3 of 5 phone runs (2365, 2447 and 1297 ms, after the load event at 343-870 ms), with no request pending: the linked stylesheet is one trigger, not the only one, in Google's environment (`psi.mjs --page hub --runs 5`, 13 October; median score 82, Speed Index 2.7 s). In the late runs, the report form's idle prefetch starts at the same moment as the first frame, so the page gets no frame or idle time until then. The Pokédex still links its stylesheet; inlining it there is not measured yet. The October 13 plain-browser cases did not reproduce that particular delay; the origin then reported about 0.7 s FCP at p75. This does not rule out the later iPhone card-paint regression documented below. |
| "Image elements do not have explicit width and height" on the hub screenshots | Each screenshot's shadow would show as an empty frame while the image loads. CLS is already 0. |
| PageSpeed's robots.txt and llms.txt checks fail on the favorites page only ("Failed to fetch"), so its SEO score reads 92 | Google's runs only; no local tool reproduces it. The sprite prefetch (1,474 requests on the first load before October 8) is the likely cause, not a proven one. Googlebot reads robots.txt on its own, so search is not affected. Serving Google's run without the prefetch would serve a test a different page, which this repo forbids. |
| "Improve image delivery": compression of the hub's back shots | These are UI screenshots with small text and sprites at quality 86. A lower quality saves about 20–30 KiB and risks visible artifacts. |
| "Background and foreground colors do not have a sufficient contrast ratio" on the type filter chips in the Pokémon browser | White text on the official type colors: 13 of the 18 are under 4.5:1. They are the games' own badge colors, and Michael keeps them (October 8). |

The first plan, with earlier targets and a phase list, is on the unmerged
branch `codex/performance-program-plan`. This page replaces its targets.

## Homepage card-paint regression, 15 October

The final correction is merged in PR 218, production `f23bc760`.
Michael confirms the candidate is clearly faster on his iPhone.
The [final investigation](handoff/homepage-early-paint-2026-10-15.md) records the
commit history, full evidence and remaining limits. PR 214 was an earlier,
insufficient correction; do not report its measurements as the final release.

The 9 October sharpness change increased screenshot pixels fourfold and
transfer from 275,970 to 739,180 bytes on affected phones. Later format work
reduced all six screenshots to 325,347 bytes. A gate then kept every card and
caption hidden until every screenshot decoded. Initial JavaScript could
still compete with those images and prevent the ready cards from painting.
Waiting for decoding alone therefore did not explain the longer delay.

The final release gives the six original-dimension screenshots first use of
the network and starts app modules after their load/decode barrier. An early
interaction can start handlers sooner. The parser barrier and service-worker
miss handling preserve normal startup. All four cards and their captions
appear together; no screenshot, feature or image resolution was removed.

Five quiet cold runs per connection measured complete-card medians 774 → 635 ms
on fast mobile and 2,771 → 2,312 ms on slow 4G, with separate sample ranges.
The matched ten-run Google mobile comparison measured FCP 1,852.5 → 913 ms,
Speed Index 2,473.75 → 913 ms and score 86.5 → 89. LCP 3,721.75 → 3,751 ms stayed
effectively flat. The final live three-run mobile medians were score 89,
FCP 912 ms, LCP 3,751 ms and Speed Index 912 ms. These do not establish 0.2-second
mobile FCP or the field targets above.

The complete 989-case CI plan passed: 950 successful cases and 39 expected skips.
All 12 live cold/new-tab checks passed. Six-configuration differential
verification found zero regressions and zero changed screens in 44 visual
comparisons. Two WebKit gym-export assertions also failed on the base, with
byte-identical before/after PNGs; the absolute verdict remained FAIL. All raw
failures, complete Google JSON, screenshots and prescriptions are preserved
on the evidence branch linked from the investigation. An animation frame or
DOM presence alone is not proof of composited complete paint.

## Further optimization batch, 15 October

See [the four-group audit and final measurements](handoff/performance-avenues-2026-10-15.md).
The retained application is `47ef7b1b` versus the shipped homepage baseline
`f23bc760`. It keeps original-dimension Dex intro AVIF with WebP fallback,
parallel independent UI/terms catalogs, file sharing before optional export
metadata, and decoded League sprites scoped to one mounted card. The three
intro screenshots fall 133,722 → 95,625 bytes (28.5%); no performance budget
ceiling increases. Optional tool-name prefetch and debug splitting are
removed from this batch after mixed measurements and a local CPU audit
failure. Their individual causal contribution remains unproven.

Final CI passes all 997 browser cases (958 successful, 39 expected skips),
including one passing retry. Final paired Lighthouse passes all guards.
The six-configuration comparison finds zero regressions and zero changed
screens across 44 comparisons; its raw FAIL retains two unchanged WebKit
assertions. The final 20 cold-card cases pass: 602 → 600 ms on fast mobile,
2,494 → 2,302 ms on slow 4G, with overlapping ranges.

Google results remain mixed: final-preview mobile homepage score 89 → 84
with separated slower timing ranges. A distinct identical-application
control also reproduces observed late paint on both URLs. Its first-party
resources match, but preview-toolbar delivery is not fully verified. This
does not erase the candidate negative or establish a clean Google pass.
Full metrics, resource prescriptions, remaining opportunities and limitations
are in the handoff. No 0.2-second FCP or universal improvement is claimed.
