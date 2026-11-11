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
| Bake the three Pokédex intro screenshots into one image (October 23, unmerged branch `claude/dex-intro-composite`) | At the same look it is 63 KB instead of 96 KB: the tilt, overlap, and shadows compress worse than three upright screenshots (146 KB at the homepage artwork's quality 95). Lab phone over HTTP/2: the whole stack shows 0.33 s sooner (3.84 to 3.51 s), but the phone's LCP element is a text paragraph and stays at 2.08 s. Desktop LCP 0.85 to 0.74 s. It costs the float and a regeneration step for every screenshot or layout change. |
| Preload all three Pokédex intro screenshots on a first visit (October 23, unmerged branch `claude/dex-intro-preload`) | The stack finishes about 0.2 s sooner on the lab phone (3.77 to 3.57 s), but the first paint gets later: FCP 604 to 732 ms and LCP 1,992 to 2,176 ms (`lab.mjs`, 7 runs, separated ranges). Low fetch priority on the two extra preloads does not help (FCP 612 to 724 ms): on a 1.6 Mbps link, any image bytes fetched early delay the stylesheet and scripts. Only the largest screenshot is preloaded. |
| Load the hub's page code with its entry script, not a dynamic import (October 8) | Lab phone first paint 600 → 804 ms (+34%), and the hub was not usable sooner (2110 → 2076 ms, within noise). |
| `fetchpriority="high"` on the hub's largest screenshot (October 8) | No effect, LCP 3484 → 3500 ms: Chrome already raises every image in the viewport to high priority. |
| Load the feedback form on idle or first open (October 8) | First-load text only 2.7 KiB smaller on the hub, about 1 KiB on dex and league: the form's dependencies are needed at startup anyway. |
| Drop the favorites page's sprite prefetch (October 8) | Without it, a selector opened 8 s after landing fills over 0.5 s on a slow phone. Shipped instead: the sprites load in the order a visitor needs them (`src/favorites/model/spritePreload.ts`). Normal / Gen I goes first, then a touch screen loads the cells in view. A hovered, pressed, or focused cell jumps the queue, and the rest follow the first selector. A desktop visitor who leaves downloads 18 KiB of sprites, not 1.5 MiB. Selectors open as fast as before, except a late click on a slow desktop link, which fills over 0.5 s. |
| Start the page code after the first paint on the league page and the hub (October 9) | League: the builder appeared 0.3 to 0.5 s later on a throttled phone, because its code is the largest. Hub: Google's score did not change. Shipped instead on the picker and the Pokédex, for first visits only (`startAppAfterFirstPaint` in `vite.config.ts`): Google's phone score for the picker 84 to 99, the picker's header at 0.5 s instead of 1.5 s, the Pokédex's loading screen at 1.0 s instead of 1.5 s, and each tool at the same time as before. A visitor with saved work starts at once, because with a full Pokédex the builder otherwise appeared 0.2 s later. |
| Drop the "Inter Fallback" font faces, to stop Google's late first frame (October 9) | The late first frame stayed: 2 of 5 hub runs without the faces, 0 of 5 with them. |
| A `sizes` that follows the widest hub shot (October 8) | Accurate, but a 3x iPhone then loaded the 800px originals (722 KiB, not 270 KiB). Browsers pick the smallest copy that covers `sizes` times the pixel ratio. |
| Draw the Pokédex picker's off-screen rows after its first paint (October 29) | No gain. Lab phone, first open after the sprite warm-up, 4 runs: Starters 485–631 to 488–660 ms until every sprite on screen shows, Forest 792–846 to 759–984 ms. |
| Load the Pokédex picker's sprites eagerly, not lazily (October 29) | Mixed. Lab phone, first open after the sprite warm-up, 4 runs: Starters 529–614 to 469–513 ms, but Forest 789–873 to 839–992 ms. Adding `decoding="sync"`: Starters 474–603 ms, Forest 751–895 ms, no gain over lazy. |
| Chrome compile hints (`//# allFunctionsCalledOnLoad`) on the picker's chunks (October 29) | No clear gain. Lab phone, first open, 5 runs: Starters 763 to 711 ms, Forest 1,232 to 1,175 ms, with overlapping ranges. |
| Measure the picker's row height in its first group only (October 29) | No gain, and Forest got slower: 1,232 to 1,537 ms. |

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
The final investigation (`docs/handoff/homepage-early-paint-2026-10-15.md`) records the
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

See the four-group audit and final measurements (`docs/handoff/performance-avenues-2026-10-15.md`).
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

## Mobile-only composed homepage artwork, 19 October

The implementation and full measurement handoff (`docs/handoff/home-mobile-artwork-2026-10-19.md`)
records three composed DPR-3 images on small touch phones and the six originals
with independent hover on desktop. Incoming artwork must decode before a resize
replaces the outgoing artwork. Inter, captions, routes, and the shared initial
loading state stay intact. Regenerate with `node scripts/home-artwork/refresh.mjs`
after screenshot, layout, renderer, or font inputs change; ordinary builds
validate the generated inputs and require no capture tools.

Five quiet cold samples per arm/profile measure slow-4G complete-card readiness
2,184 → 1,567 ms, with separated ranges. Fast medians are 562 → 616 ms, with
overlapping ranges; no fast-network gain is established. These are DOM/decode
proxies, not physical iPhone paint times. Three matched Google homepage mobile
runs have median score 89 → 98 and LCP 3,751 → 2,401 ms, with overlapping LCP
ranges and a changed LCP image. Desktop score stays 100; modeled LCP rises
721 → 761 ms. Local canonical Lighthouse preserves its exit-1 identity guard
for the selected composition, and local lab records DOM growth of 32%.
The handoff retains every negative, full Google reports, unscored insights,
resource prescriptions, source identities, and proportional CI receipts.

## Pokédex picker sprite warm-up, 29 October

When the page is idle, after the hidden View and Analytics code loads,
`src/lib/spriteWarmup.ts` downloads sprites at low priority, 4 at a time, in
idle callbacks. It loads the visitor's own Pokémon first: the grid, the View
page, and the analytics charts show these. Then it loads the grass, fire, and
water starter pickers in full, then about one phone screen (24 sprites) of
every other section's picker, in page order. It follows each picker's own
order: generation first, or a section's subgroups when it has them. It waits
while a picker is open, and it does not run with Data Saver or on 2G.

A new visitor downloads 621 sprites, 455 KB. On the lab phone (1.6 Mbps) they
load from 6.0 s to 31.4 s after the page opens; on desktop from 0.9 s to
7.9 s. A section that the mouse rests on, or that the keyboard focuses, moves
its sprites to the front of the queue. Desktop lab, tap 2 s after load with the
mouse on the section 500 ms first, median of 5: Legendary 278 → 178 ms,
Pseudo-Legendary 211 → 142 ms, Fossil 213 → 111 ms, with separated ranges. After the warm-up, the browser already has 98.8% of the sprites that are
on screen when any section's picker opens on the phone, and 100% on desktop.
Temple, Other Areas, and Legendary each miss 2 on the phone. Legendary draws
two columns side by side, which the warm-up does not follow.

Time from a tap on a section until every sprite on screen in its picker is
decoded, production → warm-up build, median of 5 runs (3 at 35 s):

| Tap | Starters | Regional Bird | Forest | Legendary |
|---|---:|---:|---:|---:|
| Phone, 8 s after load | 674 → 445 ms | 724 → 463 ms | 959 → 972 ms | 1,013 → 1,028 ms |
| Phone, 35 s after load | 630 → 471 ms | | 961 → 810 ms | 1,010 → 844 ms |
| Desktop, 8 s after load | 198 → 132 ms | 214 → 130 ms | 281 → 197 ms | 281 → 181 ms |

At 8 s on the phone, the warm-up has not reached Forest and Legendary yet.
Their ranges overlap with production's. An earlier version started its loads on
plain timers and made that case 134 ms slower; idle callbacks removed it.

`lab.mjs`, 7 runs (11 for the phone `dex` case): every metric's range overlaps
production's. The phone medians are LCP 2,024 → 2,004 ms, FCP 596 → 584 ms,
blocking time 369 → 389 ms, and picker open 416 → 360 ms. Typing stays at 144 ms.
With a full Pokédex, blocking time is 948 → 982 ms on the phone and
115 → 127 ms on desktop.

`lighthouse.mjs` fails one guard: desktop "last visual change" 2,803 →
4,006 ms. In every run, for both builds, that time is the end of the trace,
because the intro screenshots float without stopping. The warm-up keeps the
network busy longer, so Lighthouse ends its trace later. The filmstrip frames
between show no change, and the settled pages match production in pixels.

Before October 29, `lab.mjs` ran Chrome with certificate errors ignored rather
than with the lab certificate trusted. Chrome does not cache such responses, so
a repeat request in a lab run always went to the server. It now trusts the lab
certificate by key, as `lighthouse.mjs` does.

What is left after the warm-up is the picker's own build. Lab phone, Starters,
sprites already loaded: about 300 ms of JavaScript renders the picker, the
first frame shows at about 375 ms, and the sprites at about 445 ms. Production
shows the same first frame, then waits about 300 ms more for the sprites. The
first picker opened in a page costs about 170 ms more than later ones:
opening Forest first brings a first Starters open from 497–537 ms to 304–368 ms
(3 runs). That one-time cost is not investigated yet.

Left out: whole sections, about 0.8 MB, which a phone on a metered plan would
pay for pickers it never opens. Also left out: the analytics drill-downs, which
can list Pokémon outside the visitor's picks but sit behind 25 picks and two
taps.

## Next Pokédex picker avenues, measured October 29

Throwaway prototypes, measured on the lab phone, first picker open after the
sprite warm-up. The machine ran slower that afternoon than in the morning, so
compare the numbers in one row, not across this page.

| Avenue | Measured effect | Cost |
|---|---|---|
| Render a hidden Starters picker once at idle, inside React's `<Activity mode="hidden">`, then remove it | Shipped October 29 (`PickerPracticeRender` in `App.tsx`). First open, 5 runs: Starters 680 to 459 ms, Forest 1,097 to 874 ms. Desktop typing in the search box: lab INP 24 ms in all 7 production runs, 24–40 ms with it (median 32). | It renders into an element that is never attached: a hidden copy in the page let page-wide selectors find its result count, and six browser tests did. It ends at idle as a transition: on a plain timer, its removal landed during typing. |
| Lighter type badges | Upper bound, with no badges at all: Starters 763 to 578 ms, Forest 1,232 to 849 ms, on every open. Each badge is an inline SVG of five elements. | The badges must stay pixel-identical. A real change gains less than the upper bound. |
| Inline the Pokédex stylesheet, as the hub does | First visit, 7 runs: phone FCP 660 to 420 ms and desktop 172 to 100 ms, with separated ranges. Phone LCP 2,244 to 1,944 ms, with overlapping ranges. | A repeat visit downloads 15.5 KB more and is not faster (phone FCP 336 to 344 ms). |


## iPhone home page wait, found October 29

On an iPhone, the hub could show its spinner for 2 to 5 s after the header had
painted. The lab never showed it: it drives Chromium, with the service worker
blocked.

Real-user data, October 21–26, phone home page LCP (Speed Insights API; the
dashboard's score blends all pages, devices and metrics):

| | Android | iPhone |
|---|---:|---:|
| p50 | 546 ms | 432 ms |
| p75 | 1,090 ms | 1,752 ms |
| p90 | 1,956 ms | 4,991 ms |

iPhone FCP was 130 ms at p75: the wait came after the first paint. Only the hub
holds its cards for its artwork; the iPhone Pokédex builder was 1,337 ms at p90.

Cause, from the hidden `?trace` timeline on the owner's iPhone: the three home
images arrived at 3.6 s on the first load after idle, and at 0.13 s and 1.1 s
on the next loads. The service worker answered every `/assets/` request from one
cache that kept every file of every deploy: 7,314 entries and 325 MB on that
phone. WebKit reopens that cache on the first request after idle, before it
answers any image. In WebKitGTK with the same cache size, cold browser starts
delivered the home images in 453–516 ms, against 157–264 ms with an empty cache.

Fix, October 30 (`84b34b2`): the worker caches sprites and icons only, under the
name `p151-sprites-v3`, and skips waiting, so the old cache goes on the next
visit. Built files rely on the HTTP cache: they carry a content hash and are
immutable for a year. In WebKitGTK, cold starts then delivered the home images
in 27–47 ms. On the owner's iPhone, the two loads after the update showed the
artwork at 101 and 104 ms, against 2.0–4.5 s on three of five loads before.
The first visit after the update still ran on the old worker.
Two later loads after long idle, about 5 h and 1 h 50 min, showed the
artwork at 146 and 244 ms. The phone's site storage fell from 325 MB to 1.9 MB.

The same phone measured the cost per entry. Its first touch of the new sprite
cache, at 825 entries, took 278 ms (`caches.has`, in the `?trace` panel): about
0.34 ms per entry, or about 2.5 s for the old 7,314 entries. Pages that show
sprites pay that cost on their first sprite after idle, and the sprite cache
grows toward the 1,547 files under `public/sprites`. The `?trace` panel reports
it on each hub load as the sprite cache's `hasMs`.

Not yet measured: the field effect. Speed Insights stored no data from October
26 at about 08:00 UTC, while visits continued. The pages that show sprites
still read the worker cache; it starts empty and holds sprites only.

## Sprite storage in IndexedDB, October 31

After idle, the iPhone's first sprite page waited about 0.5 s before any sprite
request started: the `?trace` panel on the picker showed every sprite and type
icon waiting until 1,182 ms, while the page's code went out at 30–50 ms, then
113 sprites arrived within 100 ms. The worker's Cache Storage held 1,068
entries and grows toward the 2,900 files under `public/sprites`.

WebKitGTK, cold browser start, first sprite read, each kind alone in its own
profile, 3,000 sprites: Cache Storage one entry per sprite 117–130 ms;
IndexedDB one record per sprite 10–18 ms; 20 bundled Cache Storage entries
5–6 ms. Cache Storage grew with the count (7–11, 36–50, 117–130 ms at 100,
1,000 and 3,000); IndexedDB stayed at 4–20 ms. The owner's iPhone was about
12 times slower than this machine for the same cache.

The worker now keeps each sprite in IndexedDB (`p151-sprites`), as raw bytes
with their type, because WebKit does not store a Blob from a worker. Any
storage error falls back to the network. The picker hands its kept sprites to
the worker by message. Bundles would open slightly faster but need a build
step and download whole groups. Every Cache Storage cache goes on update, so
sprites download once more.

The owner's iPhone confirmed the fix after a long idle, on October 31, with
Chrome on iOS and the `?trace` panel on the picker. The first sprite request
started at 282 ms and took 183 ms; all 113 sprites on screen were drawn at
501 ms. The last idle run on Cache Storage, on October 30, started the first
request at 651 ms, took 532 ms, and drew the last sprite at 1,331 ms. The store
held 1,037 records, opened in 2 ms, and no cache was left. No sprite came over
the network. The fastest earlier runs took 138 ms (IndexedDB) and 150 ms (Cache
Storage) for the first request, so idle now adds about 40 ms instead of about
380 ms. The rest is likely the worker's own time per request, which every run
pays.
