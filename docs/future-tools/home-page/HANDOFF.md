# Home page — branch handoff

Written for a launch orchestrator that reads this branch beside the league
builder's and the SEO work. It covers the whole branch, not one sitting.

- Branch: `claude/home-page-tool-cards-r0j42w`
- Head at the time of writing: `2d866b4`
- State: merged with production, all gates green, **not approved for
  production**
- Read `README.md` in this folder for how the page and its tooling work. This
  file is the launch view: what exists, what it depends on, what is unresolved.

## 1. What the branch delivers

A router page that sends a visitor to each of the app's tools. It is reachable
only at `/?home`. It has no route of its own.

Three cards:

| Card | Goes to | Target exists |
| --- | --- | --- |
| Custom Region & Pokédex Builder | `/` | Yes, the app today |
| Trainer Card & League Builder | `/pokemon-league-builder` | No — see section 4 |
| What should we build next? | Opens the feedback sheet in place | Yes |

The favorite Pokémon picker is off the page. It does not ship in this wave.

Layout, in one paragraph: a red panel per tool with two app screenshots breaking
out of its top and left edges, and the copy in a caption below the panel. On a
phone the tools sit two up and the call to action fills the third row as a wide
bar. At 1024px and above all three sit in one row as ordinary cards. Every
measurement inside a card is a share of the card's own width in `cqw`, so a
breakpoint only picks how many cards fit in a row.

## 2. Files the branch owns

Tier 2, meaning a browser receives them and a production merge needs the
owner's approval:

- `src/components/home/HomePage.tsx` — new, the page
- `src/main.tsx` — the `?home` branch that mounts it, plus the `noindex` meta
- `src/components/layout/Header.tsx` — the wordmark is now a link to `/?home`
- `src/i18n/catalogs/en.ts` — nine `home.*` keys
- `src/assets/home/*.webp` — four screenshots, 439KB together

Tier 1, which merges to production on its own:

- `docs/future-tools/home-page/` — this file, `README.md`, `capture-shots.mjs`,
  `league-fixture.json`, and the mockup tooling. On production already.

Tier 1 by path, but held on this branch on purpose:

- `e2e/sweeps/home-sweep.spec.ts` and `e2e/wordmark-home.spec.ts`. Both drive
  `/?home`, which production does not serve, so landing them alone would turn
  production's CI red. They ship with the page, not before it.
- `.gitignore` — one entry for the screenshot script's scratch worktree, which
  is only useful beside the script's caller.

## 3. Verification that exists

Run these on the branch. The last full run was on `2d866b4`.

| Command | Result |
| --- | --- |
| `npm run build` | passes |
| `npm run lint` | 0 errors, 3 pre-existing warnings |
| `npm test` | 172 passed |
| `npx playwright test` | 270 passed, 0 skipped, 0 failed |

`e2e/sweeps/home-sweep.spec.ts` drives the real page at 20 widths from 320 to
1920 and reads geometry, never text. Eight mutations of `HomePage.tsx` each turn
it red, so it is evidence rather than decoration:

1. The overhang reserve stops being shared across a row.
2. The wide call to action stops spanning.
3. The wide call to action mounts at desktop width.
4. The screenshots grow until the red strip at the card's right edge closes.
5. A screenshot is too short to reach the panel's bottom edge.
6. A tablet rule is written as a bare `sm:` instead of `sm:max-md:`.
7. The build mark stops sitting centred.
8. The artwork pops far enough left to leave the window.

`capture-shots.mjs` carries its own guard: it refuses to write a screenshot with
ink inside the curve the card's rounded corner cuts. Set its `PAD` to zero and
the run stops on the first shot.

## 4. Cross-session dependencies

### 4.1 The league link needs the league builder — order matters

The league card points at `/pokemon-league-builder`. This branch's build emits
only `index.html`, and its `vercel.json` has no rewrite, so that path has no
file. The route comes from the league builder's branch, which adds:

- a second Rollup input in `vite.config.ts` for `pokemon-league-builder.html`
- `"cleanUrls": true` in `vercel.json`

Both are tier 2 files that branch owns. This branch does not touch either, so
there is no conflict between them today — but only that branch supplies the
route.

**Consequence for the launch order:** either the league builder reaches
production first, or this page ships pointing at a path that does not resolve.
Under `vite preview` the path returns 200 because the preview server falls back
to the single-page app. That is not what a static host does with a missing file.

### 4.2 `robots.txt` has no `/?home` rule — SEO's file

Production's `robots.txt` disallows `/?admin`, `/?tune` and `/?demo=`. It says
nothing about `/?home`. The page's protection today is a `noindex, nofollow`
meta tag that `main.tsx` injects at runtime, verified present on the merged
build. A crawler that does not run JavaScript never sees it.

The exposure is small, because the canonical on `/` points every query view of
the root at `/`. Adding `Disallow: /?home` beside the other three is one line and
matches the pattern already there. It belongs to whoever owns `robots.txt`, and
it is tier 2.

### 4.3 The page has no route, and the decision collides with SEO

`/?home` was the owner's call while the page was in review. Giving it a real
route is the largest open question on this branch, and it is not this branch's
to answer alone:

- The dex builder owns `/` today.
- `sitemap.xml` has exactly one entry, `https://my151.app/`.
- Section "SEO rationale" in `../HANDOFF.md` argues for one page per tool.

If the router page takes `/`, the dex builder moves and the canonical, the
sitemap and every internal link move with it. If the router page takes a slug
instead, it splits authority away from `/` and needs its own canonical. Neither
is a home page change on its own.

When the page does get a route, two constants change and nothing else:
`HOME_HREF` in `src/components/layout/Header.tsx`, and the constant of the same
name in `e2e/wordmark-home.spec.ts`.

### 4.4 The page is English only

All nine `home.*` keys live in `src/i18n/catalogs/en.ts`. The eight locale files
under `src/i18n/catalogs/ui/` have none. `npm run i18n:verify` passes, because
an absent key falls back to English by design. A Japanese or German visitor sees
an English router page while the rest of the app is translated.

This is a launch decision, not a defect. Translating first means running the
i18n pipeline, which is the one step that touches the network and is not part of
the build.

## 5. A merge hazard every session should know

Production carries `ac1908e`, a revert of an accidental deploy of this page's
files. Merging production into a branch that holds those files produces
modify/delete conflicts across all of them. That part is loud and easy.

The quiet part cost a real bug on this branch. The revert also removed the
`?home` branch from `src/main.tsx`. This branch had no later commit on that
file, so git took production's side **cleanly**, with no conflict, and the page
lost its only entry point. Nothing in `tsc -b` or `npm run lint` noticed. The
sweep caught it: every width failed on a missing `<main>`. The fix is `2d866b4`.

The rule that follows: against that revert, a clean merge is not a correct
merge. Run the branch's own end-to-end tests after merging production, not just
the type check.

## 6. Decisions already made, so nobody reopens them

- **Copy is the owner's, word for word.** Titles and blurbs in `en.ts` were
  measured in a browser at 390px and then chosen by the owner. The h1 is
  "Make a custom Pokédex, build a league, and more"; a longer variant naming the
  gym leader league ran to three lines at 320px.
- **Alignment is structural, not editorial.** Panels in a row share a top edge
  because the cells top-align and share the row's overhang reserve. The app
  ships in eight languages, so copy tuned to equal line counts in English cannot
  hold the alignment.
- **Three of the four screenshots are exports.** The dex View page and both
  league cards export a PNG, and the export is what the card shows: the file a
  visitor would get, footer line and all, without editing chrome. Only the
  analytics shot is the app itself, because analytics exports nothing.
- **Screenshot corners stay out of the assets.** The card rounds them at render
  time at a phone's proportion, so one flat rectangle serves the 110px phone card
  and the 263px desktop card.
- **The call to action has two shapes, and exactly one mounts.** A wide bar
  below 1024px, an ordinary card above it, through `useIsDesktop` — the pattern
  the browser panel and the analytics drilldown already use.

## 7. Known costs, stated plainly

- The four screenshots total 439KB. They are above the fold and carry
  `loading="lazy"`, which delays images a visitor sees immediately.
- `PHONE_RADIUS` exists in two files, `HomePage.tsx` and `capture-shots.mjs`.
  Each names the other. They have to move together.
- The shadow behind each screenshot sizes itself from a hidden copy of that
  image, which costs one extra decode of a file the browser already has. The
  four assets are cropped to their own content, so no single aspect ratio
  describes them.
- Until the league builder merges, `capture-shots.mjs` builds that branch into a
  gitignored worktree at `.league-shot-tree/`. After the merge it uses this tree
  and the worktree can be deleted.

## 8. Bringing the favorite picker back

One entry in `useTools()` in `HomePage.tsx`. The grid's column count, the
overhang reserve and whether the call to action spans a row all follow from the
count. Two other things change with it: `CARDS` in
`e2e/sweeps/home-sweep.spec.ts`, and the panel count in
`e2e/wordmark-home.spec.ts`. Its copy keys were deleted from `en.ts` and need
writing again.

## 9. What the owner still has to decide

1. Whether this page ships at all. Every change here is tier 2 and unapproved.
2. The launch order against the league builder, per section 4.1.
3. English only, or translate first, per section 4.4.
4. The route, per section 4.3. This one can wait; the other three cannot.
