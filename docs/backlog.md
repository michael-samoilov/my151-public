# Backlog

Things worth doing that are not being done yet, with enough of the reasoning
that picking one up does not start from scratch.

## A report icon drawn from the Bug type symbol

The report control uses lucide's generic `Bug`. Using the *Pokémon* Bug type
symbol would tie it to the app's own vocabulary.

The conversion is not "outline the symbol's blocks" — that reads as a cluster of
separate shapes. It is the inverse: the gaps between the blocks are the lineart
(the channel between head and wing cases, the wedge between the wing cases, the
notches across the body), and the only thing that traces the blocks themselves
is the single silhouette they collectively make.

A working approach got most of the way there: marching-squares the alpha of
`public/sprites/types/glyph/7.png`, morphologically close it (disk radius 4 —
enough to bridge the 8px wedge, and every pixel past that rounds the silhouette
until it becomes a rounded square), stroke the closed silhouette's outline, then
subtract the blocks back out and stroke the resulting gap regions. Simplify each
loop with Ramer-Douglas-Peucker at ~1.6 source pixels or the 34px source's
staircase shows through, and drop loops under ~6px² or the crumbs where blocks
nearly touch read as dirt.

Where it stalled: at 16px — the size the control actually renders at — the
symbol carries more interior detail than a lucide icon and reads dense. It wants
either a hand-drawn simplification of the traced result or a decision to accept
the density.

Also worth naming: the type symbols are TPC's art, and redrawing one as a UI
icon is a further derivative step than displaying it as a type badge is.

## The first-run language notice, and whether `?lang=` should persist

Two loose ends from the language work, neither blocking now that the picker
ships in every environment, both worth a decision.

**The notice was planned and never built.** `localeNoticeSeen` is in the store
at version 10 and nothing reads or writes it — I went looking for the component
and there isn't one. The intent was a one-time, *bilingual* line when detection
moves someone out of English: 「日本語に切り替えました · Switched to Japanese —
[English]」, bilingual precisely because a visitor whose detection went wrong
cannot read the language it went wrong into.

It mattered much more when the picker was preview-only, because then it was the
*only* way back. Now it is a courtesy: it explains a change the visitor did not
ask for, rather than leaving them to notice their Pokémon names look different
and go hunting for a globe icon. Worth doing before the UI tier lands, when a
mis-detected visitor will face a fully translated interface instead of English
chrome and the stakes go up.

Either build it or drop `localeNoticeSeen` from the store. A persisted field
that nothing reads is a claim the code does not honour.

**`?lang=` does not persist.** `initLocale` applies the parameter and never
stores it, so `?lang=de` lasts exactly one page load. The plan called for an
explicit URL to pin the choice, on the grounds that typing one is explicit
intent. There is a fair argument the other way — someone opening `?lang=de` out
of curiosity may not want German pinned forever — and now that the picker is
always present, either behaviour is recoverable. Left as-is rather than changed
quietly, because it is a product call and not a bug.

## Virtualize the browser's result list

The builder page renders **1,980 type badges, none of them in the viewport** —
measured on `?demo` at 1280x900. They are the browser sheet's rows, all ~1025
Pokémon built eagerly. At three DOM nodes per badge that is 9,900 nodes, 41% of
the page's 24,335, for content nobody is looking at.

This surfaced while weighing whether to pre-bake badges as images: rasterizing
would cut those 9,900 nodes to 1,980 and *look* like a big win, which is exactly
why it is the wrong fix. The nodes are not the problem, the eagerness is. Any
badge implementation is cheap when it renders ~300 badges instead of 1,980, and
rasterizing first would bank the win while leaving the cause in place.

Windowing the list is the fix. Worth measuring the actual interaction cost first
— node count is a proxy, not a symptom, and nobody has reported the sheet
feeling slow.

## Ship our own CJK subsets rather than falling back to the platform

`src/index.css` sets one stack — `'Inter Variable', system-ui, …` — and Inter
has no CJK coverage, so every Japanese, Korean and Chinese glyph in the app is
drawn by whatever the operating system supplies. Two consequences, one cosmetic
and one not:

- `system-ui` picks CJK glyphs by **OS locale, not page language**. A `zh-Hans`
  page on a Japanese Windows machine gets Japanese glyph forms — a documented
  Chromium behaviour, and why VitePress moved its default off `system-ui`.
- The exported poster is drawn on a canvas with the same stack, so a shared PNG
  looks different depending on which machine exported it. The badge geometry
  compensates by measuring at runtime (`src/lib/typeBadgeFit.ts`), which keeps
  it *correct* everywhere without making it *identical* anywhere.

The usual objection — CJK fonts are multi-megabyte — does not apply, because the
corpus is closed and known at build time. Counting distinct non-ASCII codepoints
across the 1025 species names plus the 18 type names: ja 115 (entirely kana —
Pokémon names carry no Han), ko 548, zh-Hans 963, zh-Hant 965. Subsetting Noto
Sans JP to 115 glyphs is roughly 11 kB of WOFF2.

So: a build step that unions each generated catalog's codepoints and runs
`pyftsubset … --flavor=woff2 --layout-features=''`, emitting one hashed subset
per locale, loaded only when that locale is active. Keep the per-`:lang` system
stacks as the fallback behind it. Stripping `GSUB`/`GPOS`/hinting saves under
1% — outlines dominate, so don't micro-optimize that part.

## Give the Italian type badge more breathing room, or prove it doesn't need it

`Coleottero` is the longest official type name in any language and, after the
condense-then-shrink fit, lands almost exactly on the 130-unit text box. That
box is centred at 113 — measured from the art — while the space actually
available runs 45 to 185, whose centre is 115. The asymmetry is invisible for
every language that leaves slack and costs Italian about 2 units of left-hand
clearance against the symbol: roughly 1px at the size a tile badge renders.

It does not collide and the e2e spec asserts as much, so this is a refinement
rather than a defect. The fix, if wanted, is to shift the anchor to 115 for
strings that fill the box — but that means the anchor is no longer the art's
measured value, so it needs a deliberate decision rather than a quiet tweak.
