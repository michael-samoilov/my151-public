# Page SEO contract

Every page that should rank meets this contract. It is short because the
site is small. Copy comes from the slug-plan artifact and `SEO-PLAN.md` P16;
this document covers how the HTML is built and served, which is what decides
whether that copy reaches a crawler at all.

## The contract, per page

1. **One served HTML file per page.** Vercel serves it for the page's path
   without JavaScript. The league branch already does this with a Vite
   multi-page build (`rollupOptions.input` in `vite.config.ts`, one
   `<name>.html` per page, `cleanUrls: true` in `vercel.json`). Use that
   pattern for every page.
2. **The head carries the page's own tags:** `<title>`, `meta description`,
   `link rel=canonical` (absolute, self), `og:title`, `og:description`,
   `og:url`, `og:image` (its own 1200×630 image from
   `scripts/generate-og-image.mjs`), `og:image:alt`, `twitter:card`.
   No two pages share a title or description.
3. **The body carries the page's copy before React mounts:** one `<h1>`, the
   intro paragraph, and the h2 headings with a sentence each. This is what
   Bing indexes. Keep it visible for a slow connection, hidden for the first
   second so it does not flash, the way `index.html` does it today.
4. **After React mounts, the page's `<h1>` says the same thing** as the served
   h1 and the title's first clause. The second header ribbon is the right
   element for it. The wordmark is not an h1; it is a `<p>` or a plain link
   with the same styling. Google renders JavaScript, so the post-mount DOM is
   what Google reads, and the h1 is its first fallback when it rewrites a
   title. Two h1 elements in the DOM are acceptable when a responsive layout
   renders a mobile block and a desktop block and CSS hides one. They must
   carry the **same string**.
5. **Never swap the h1 to a shorter string at a narrow width.** Google crawls
   mobile-first, so the narrow string is the one it reads. Shorten with CSS
   truncation, which keeps the full text in the DOM, and put the full name in
   a `title` attribute if the visible text is clipped.
6. **Section headings are real `<h2>` elements** with the words from the plan.
   On a tool page those are the FAQ questions; there is no separate heading
   list. On the hub they are the card titles. Controls and inline UI labels
   are not headings, with one exception: a heading that names a view or a
   section of the page, such as the card view's "Pro Trainer Card", is a
   correct `h2`.
7. **Each page carries a collapsed FAQ block under the footer,** rendered by
   React, with the questions as `h2` elements and the answers as paragraphs.
   Copy is in `LAUNCH-COPY.md`. Google indexes collapsed content at full
   weight. Do not put it in the pre-mount boot copy: that markup is replaced
   when React mounts, so only Bing would ever read it.
8. **Internal links are `<a href>` elements** in the served HTML, not click
   handlers. Anchor text to a tool page shares that page's h1 phrase.
9. **Images that carry meaning have descriptive alt text.** Sprites use the
   Pokémon's name. Screenshots on the hub describe what the screenshot shows.
   Decorative icons use `alt=""`.
10. **JSON-LD:** `WebSite` with `name: "my151"` on the hub; one
    `WebApplication` per tool page. Same description as the meta description.
11. **`public/sitemap.xml` lists every indexable page.** `robots.txt` keeps its
    query-param disallows. Preview-only pages (`evolution-levels`, `slot-lab`)
    carry `<meta name="robots" content="noindex">` and stay out of the sitemap.
12. **Run `npm run build` and load each page with JavaScript disabled** to
    confirm items 2 and 3. Then load it normally and read every `h1` with
    `[...document.querySelectorAll('h1')].map(h => h.textContent)` at a phone
    width and at a desktop width, to confirm items 4 and 5.

## What each page does today

| Page | Served HTML | Post-mount h1 | Slug and copy |
|---|---|---|---|
| Builder at `/` (production) | Own head and boot copy. | The header wordmark "my151.app" plus a screen-reader clause. Wrong: no ribbon heading. | Title, description and h1 carry "type coverage" and "Make Your Own". P16 has the replacements. |
| Hub (`claude/home-page-tool-cards-r0j42w`) | None of its own: reached at `/?home`, shares `index.html`, adds `noindex` at runtime. | Its own h1, exactly one. Right. | Card titles carry "League Builder". Screenshot images have `alt=""`. Intro says "tools and templates". |
| Gym leader maker (`claude/pokemon-league-builder-soqxj6`) | Own `pokemon-league-builder.html` with title, description, canonical, og tags, h1 and intro. Right pattern. | Yes: the second header ribbon is a real h1 (`LeagueNameRow`). Two are in the DOM, one per responsive block, which is fine. Two defects: the narrow block renders the shorter string `League Builder`, and both say the rejected phrase. | Slug `/pokemon-league-builder` and every string say "Pokémon League Builder". Rejected by the research (74% Pokémon GO intent). |

## Paste this to the agent on the league branch

> The page's slug, title, h1, description and intro are changing. The
> approved copy is in `docs/seo/LAUNCH-COPY.md`; the research behind it is in
> `docs/seo/research/`.
>
> 1. Rename `pokemon-league-builder.html` to `custom-gym-leader.html` and the
>    Vite input key to `league` → path `/custom-gym-leader`. Update the
>    canonical, `og:url`, the wordmark link in `LeagueApp.tsx`, `HOME_CREDIT_PREFIX`
>    in `src/league/export/layout.ts`, and the `href` in `HomePage.tsx`.
>    "pokemon league builder" is a Pokémon GO PvP query; "custom gym leader"
>    is the phrase with the right intent.
> 2. Head: `<title>Custom Gym Leader & Trainer Card Maker | my151</title>`.
>    Description, og:title, og:description and the served intro come from
>    `SEO-PLAN.md` P16 (or the artifact's Mine column once confirmed).
>    `og:image` points at `/og-gym-leader.png`, generated by
>    `node scripts/generate-og-image.mjs league`.
> 3. `TOOL_NAME` becomes "Custom Gym Leader & Trainer Card Maker". The
>    ribbon h1 you already render (`LeagueNameRow`) is the right element;
>    keep it. **Delete `TOOL_NAME_NARROW`.** Google crawls mobile-first, so
>    the narrow string is the string it reads, and today that is "League
>    Builder". Use one string at every width and let the existing `truncate`
>    class clip it; keep the full name in the `title` attribute. Both
>    responsive blocks must then carry the same h1 text.
> 3b. Add the FAQ block from `LAUNCH-COPY.md` under the page footer:
>    collapsed `<details>`, each question an `<h2>`, each answer a paragraph.
>    Do not put it in the static shell; that markup is replaced on mount.
> 4. Add a `WebApplication` JSON-LD block to the head with the same name and
>    description. Add `https://my151.app/custom-gym-leader` to
>    `public/sitemap.xml`. `evolution-levels.html` and `slot-lab.html` keep
>    `noindex` and stay out of the sitemap.
> 5. Verify: build, open `/custom-gym-leader` with JavaScript off and confirm
>    the h1 and intro are in the HTML; open it normally and confirm
>    `document.querySelectorAll('h1').length === 1`.

## Paste this to the agent on the home page branch

> The hub needs to be a page a crawler can find, and its copy is changing.
> Decisions are in `SEO-PLAN.md` P16; research in `docs/seo/research/`.
>
> 1. Card titles are h2s and the anchor text of the tool links, so they must
>    share the tool page's h1 phrase. Change "Trainer Card & League Builder"
>    to "Trainer Card & Gym Leader Maker" (or "... Builder"). "League" is a
>    Pokémon GO PvP word in search. Its `href` becomes `/custom-gym-leader`.
>    The "What should we build next?" card title is not an h2; make it a
>    styled `<p>` or `<h3>`.
> 2. The tool screenshots are content, not decoration. Give the visible one
>    in each fan descriptive alt text ("A 151-slot custom regional Pokédex
>    built in my151", "A custom gym leader trainer card with a six-Pokémon
>    team and badge"). The invisible sizing copies keep `alt=""`.
> 3. Title, h1, description, intro, card titles and blurbs come from
>    `docs/seo/LAUNCH-COPY.md`. Add the hub FAQ block from the same file
>    below the cards: collapsed `<details>`, each question an `<h2>`, each
>    answer a paragraph.
> 4. When the hub gets a real URL: its own HTML entry in the Vite multi-page
>    build (see the league branch's `vite.config.ts`), its own head tags,
>    `WebSite` JSON-LD with `name: "my151"`, `og:image` `/og-hub.png`, no
>    `noindex`, and a sitemap entry. Until then keep `noindex`.
> 5. Verify as in the contract: JavaScript off shows the h1 and intro;
>    JavaScript on shows exactly one h1.

## Paste this to whoever touches the builder at `/`

> After React mounts, the only `<h1>` is the header wordmark. Demote it to a
> `<p>` with the same classes and keep the `aria` text. Then add a second
> header ribbon like the league builder's (`LeagueNameRow` in
> `src/league/LeagueApp.tsx`) whose heading is the page's `<h1>`: "Custom
> Pokédex Builder". Use one string at every width; truncate with CSS rather
> than swapping in a shorter one.
>
> The page also moves to `/pokedex-builder`: add an HTML entry to the Vite
> multi-page build, give it its own head tags and canonical, and 301 `/` to
> it only if the hub is not shipping at the same time. Title, description,
> intro and the FAQ block come from `docs/seo/LAUNCH-COPY.md`. `og:image` is
> regenerated by `node scripts/generate-og-image.mjs pokedex`. Tier 2:
> preview first.
