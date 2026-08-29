# League builder — settled design decisions (v2)

Outcome of grilling rounds 1–3, closed 2026-08-28. Round 2 and round 3 answers
replace the round-1 items they touch. Treat each item as settled. Reopen an
item only if the owner asks.

Design canvas (Direction A, mobile-first):
https://claude.ai/code/artifact/35e27776-53a2-4159-8d33-4cbd9dcc3026

## Product frame

- Own page at `/pokemon-league-builder`, second Vite entry, real static HTML
  (title, meta description, h1, body copy). See `../HANDOFF.md`.
- **Mobile-first.** Build the mobile layout first, port to desktop after.
- **Direction A (card table) everywhere.** No stage-focus view exists.
- Reuse dex builder patterns where practical: the selection pane picks evo
  lines, corner-button overlays on tiles, zustand + localStorage norms.
- Launch English first. No share links in v1.

## Card model

1. **Rows.** Fixed 11 rows: gyms 1–8, Elite 4, Champion, Endgame boss.
   Gym N in a league is fought at card row N.
2. **Team sizes.** Fixed schedule, no user override:
   `2 / 3 / 3 / 3 / 4 / 4 / 4 / 5 / 5 / 6 / 6`.
3. **Level curve.** Hidden constants — never shown to the user, never
   editable in the UI. They only drive auto-evolution. Per-row thresholds
   spread across each difficulty band's own range (owner's source bands:
   10–14, 18–32, 34–46, 48–57, 56–60, 72–88). Concrete values:
   `12 / 18 / 25 / 32 / 34 / 40 / 46 / 48 / 54 / 58 / 80`. Adjustable
   constants in code.
4. **Columns.** One column = one evo line, always. Rows are right-aligned
   like the /vp/ template — never centered. The always-present column sits
   rightmost; later columns extend leftward. Column position k joins at the
   first row whose team size reaches k.
5. **Column drag.** Excel-style left/right drag reorders columns. A line
   moved into an earlier-joining position auto-fills its earlier rows; moved
   into a later-joining position, its earlier rows hide.
6. **Auto-evolution.** A form shows in a row when its evolution level is at
   or under the row threshold. Level-less evolutions get an implied level
   from a linear regression of evolution level on BST, fitted over all
   level-evolvers. Dev-only module, rerun when new Pokémon release.
   Edge cases (split evos, Shedinja-style double evolutions, and the rest)
   get solved case by case during the build.
7. **Manual override.** Dragging a sprite up or down its column shifts the
   evolution boundary (cover or reveal line members). Mid-column line swaps
   are parked — UX to be figured out later.
8. **Powerups.** Mega = bottom-left corner button, Dynamax = bottom-right,
   on tiles in powerup rows, for Pokémon that have such forms. Pressing
   cycles forms (several Megas cycle; back to start reverts to base). A
   powerup is a **form change** of the base Pokémon, never a swap. Corner
   buttons render on mobile too, sized like the dex builder's X / gen-badge
   overlays.
9. **Legend swap.** The Endgame-boss row allows ONE cell swap: replace any
   single cell with a legendary in that row only. Eligible: all legendaries
   (minor and major), mythicals, and ultra beasts. Maximum one per card.

## Card identity

10. **Fields.** Type (selection, includes n/a), theme (free text), signature
    Pokémon. TM and badge are excluded for now, planned later.
11. **Type control.** The card is identified by its type. The header shows
    the plain `TypeBadge` — no wrapper, no caret. Pressing it opens the same
    type menu the selection pane's type filter uses, plus a No type option;
    n/a uses the 4-pointed curved-star spandrel from the view page outlines.
    Choosing a type recolours the whole card — see Card theme. No trainer
    names, no avatars.
11b. **Slot chrome.** A filled signature, TM or badge slot is white with no
    outline, exactly like the squares behind the Pokemon. An empty one adds
    a dashed border in the same light tint, at the same weight for all three.

12. **Signature.** A data field pointing at a line (optionally a specific
    form — which also caps that column's autofill at that form). Picking a
    signature while under 6 lines inserts its line rightmost, shifting
    others left; with 6 lines placed, it only marks an existing line.
    Column drag never changes signature status. Removing the line removes
    the signature. On the card the signature fills the top-left
    void, 3 columns × 4 rows from cell A1, like the /vp/ template's
    Signature PKMN box. The element is the dex builder's standalone
    (non evo-line) tile: `bg-card`, border, rounded, gen badge, remove
    control, `PokemonTileContent`. Never a bespoke panel.

12b. **TM slot.** 2 columns × 1 row, directly under the signature, and no
    taller than the glyph cell beside it. Its mark is a pokeball with the
    band taken out — a small circle inside a big one — sheared, so it reads
    as a disc lying at an angle. The mark sits at the left edge with the "TM"
    label under it, so the move name gets the rest of the row and wraps to two
    lines when it needs to. The move name is not bold; the gym's theme is. Tapping it
    opens a move picker built on the selection pane: type badge, move name,
    and the category icon, with a filter for type and one for category, and
    a search that sorts on move name. Its fields run Type, Category, Move,
    PP, Att., Acc.; Move, PP, Att. and Acc. sort, and a move that always hits
    carries no accuracy and sorts above 100%. Two more filters: contest
    condition (beautiful `#1e93c0`, clever `#15a13f`, cool `#d42c04`, cute
    `#d2458d`, tough `#cca100`). Signature move is deferred to an advanced
    filter set, along with a count of how many of the team's lines can learn
    the move and an ace-move filter. DECIDED: the category chip is the icon
    in a rounded square (variant B), under a header abbreviated to "Cat." so
    it never crowds "Move". The numeric headers (PP, Att., Acc.) right-align
    with their columns, sort caret leading, so the label's right edge lines
    up with the numbers. Power is data, not a
    filter. The pane
    keeps the browser's own gutters and its rows are dense. The category
    chip runs through the same badge pipeline as a type badge — one 200×40
    art space, a white glyph at the left, the name condensed to 0.76, so it
    localises like a type name — with Bulbapedia's palette (physical
    `#EB5628`, special `#375AB2`, status `#828282`), its Scarlet/Violet icon
    art, and a border of our own that Bulbapedia's chips do not have. Type
    badge, move name and category chip all centre on one line. It needs the
    same paint guards as the Pokemon pane: deferred filter options
    (`useDeferredValue`), a render budget on results (`SEARCH_RENDER_LIMIT`),
    and row windowing (`useRowWindow`).
12c. **Badge slot.** 2 columns × 2 rows, under the TM, spanning exactly the
    two glyph cells beside it. It holds the badge the gym awards. Text entry
    for v1. Empty, it reads "Badge Name". Filled, the field supplies the word
    itself: a short name puts Badge on its own second line, and a name long
    enough to wrap lets Badge simply follow as the last word. Nobody types it
    twice. The name is not bold. Later enhancement: check whether the PokeAPI sprite repo already
    carries official badge art and offer those as image options.

## Card theme

Type colours come from `src/data/type-colors.ts` — the repo's Gen IX badge
palette (water is `#2980EF`), not the Bulbapedia set. The card paints three
surfaces from them:

- **Material** — the build page's own section fill: the type at 6.3% over
  white (`${color}10`), so a card and a dex section read as the same family.
  White when the card has no type.
- **Glyph cells** — the app's existing alt shade: the `stroke` half of
  `deriveSectionColor` in `src/lib/sectionColors.ts`, which the view page
  already uses for section outlines and names. Reusing it comes first;
  nothing here invents a second dark palette. Its hue and saturation are
  kept and its lightness is lifted to a relative luminance of 0.26, because
  the raw stroke is solved against its own pale fill and lands too dark
  beside a near-white card.
- **Spacer bands** — the alt shade's hue and saturation at a relative
  luminance of 0.12, roughly two /vp/ steps under the lifted cells. One −9
  step read as too close to the cells once the cells were lifted.
- **Pokemon slots** — white. Every cell that can ever hold a Pokemon draws
  its square, filled or not. The sprite is larger than its square and
  overflows it, as the dex builder's tiles do.

**The −9 is measured, not chosen.** Three /vp/ cards, in HSL:

| card | lightness | saturation |
|---|---|---|
| water `#228abb → #1b6e96 → #155370` | 43.3 → 34.7 → 26.1 | 69.2 / 69.5 / 68.4 |
| electric `#eec717 → #d3a913 → #a97f0d` | 51.2 → 45.1 → 35.7 | 86.3 / 83.5 / 85.7 |
| dark `#455160 → #2e3743 → #151d26` | 32.4 → 22.2 → 11.6 | 16.4 / 18.6 / 28.8 |

Hue never moves, saturation barely moves, and lightness falls in even steps
of −6 to −10.6 points, mean −8.9. The template's progression looks gentle
because it starts from an already-dark base, not because its steps are
small — which is why anchoring on the app's alt shade reproduces it.

The app body background and both app headers are unaffected.

Spacer bands are rounded rectangles, inset to the same left and right edges
as the signature, TM and badge slots. The card's own corner radius is the
band's radius plus that inset, so the two curves are concentric. Their text
is vertically centred.

## League

13. **Roster.** Fixed 14 slots: 8 gyms, 4 Elite 4, 1 champion, 1 endgame
    boss (the Red / Emerald-Steven / B2W2-Cynthia figure). One league, no
    unplaced bench. Cards live in slots.
14. **Stage mapping.** Gym N shows card row N. Every Elite 4 member shows
    the card's Elite 4 row (5 Pokémon) — the 1–4 stars are ordinal, teams
    do not escalate within E4. Champion shows the Champion row. Boss shows
    the Endgame-boss row. Champion and boss teams are distinct rows.
15. **Reorder.** Rows drag vertically; a moved card re-derives its shown
    team from the destination slot.
15b. **League home shape.** The league home is a zoomed-out card, not a
    separate design: the same 7-column right-aligned grid, 14 rows, the same
    glyph conventions. Two columns lead each row — the glyph cell, then the
    type chip. The chip uses the 1×1 type icon the analytics type chart uses
    (`typeIconPath`), never the cropped glyph stretched into a circle. Its
    spacers are plain section labels: Gym Leaders, Elite Four, Champion,
    Endgame Boss, with no notes. DECIDED: red (`#dc2626`, the app primary);
    grey and black stay on the League states board as the rejected options. The league carries a name of its own, entered under
    the tool title the way a gym enters its theme, and bold once filled.
    Dragging a row lifts it, closes the rest up, and leaves a dashed hole
    where it will land. Each row carries its own card's type shades; an empty
    slot keeps the white material.
16. **Stage glyphs** (used on the card AND the league):
    - Glyphs live INSIDE the grid, in the rightmost empty cell of each row —
      never in a separate label column. The cell is pinned to where a FULL
      team would put it, so a half-filled card keeps the template's shape
      instead of collapsing rightward. On the league home the glyphs take
      one column of their own, first in the row, with the type chip next.
    - Gym N: N−1 filled square diamonds plus one border-only diamond. The
      cluster always wraps after four; at four or more, every line
      left-aligns, so the marks stack as a block.
    - Gym 1 merges two cells: "No badges" centred, the single outline
      diamond under it. Gym 8 and the Elite 4 row also take a double-width
      cell, so their glyph reaches the card's left edge.
    - Elite 4 on the card: 4 stars, sized to carry the same visual weight as
      a gym's diamonds. In the league: slot k shows k stars, and slot 4
      stacks them 2×2 so the cluster keeps clear of the cell edges.
    - Champion and endgame boss have to carry the same weight. Two ways,
      both drawn on the Pointer states board: **A**, the crown loses its fill
      to match an outline pokeball; **B** (preferred, and what the boards
      use), the pokeball becomes solid — the ball is the white, and the cell
      colour is its negative space, two half donuts and a button.
    - Every glyph is white on the glyph cell.
    - The endgame-boss legend gets no border of its own.
    - Three spacer bands, text vertically centred: "GYM LEADER TEAM" above
      the whole card, "ELITE FOUR & CHAMPION — Champion may have one
      Mega/Gigantamax" before the Elite 4 row, "ENDGAME BOSS TEAM — may also
      include one minor Legendary" before the boss row.
17b. **Theme field.** Grey placeholder text, "What is this gym's theme?",
    in the tool header. Pressing it types into it.

## App chrome (added 2026-08-28)

- **Two headers, matching the build page.** Header 1 is the global
  my151.app header; cross-tool navigation (dex builder, league builder,
  favorite picker, …) lives there, behind a Tools menu or side-pane
  trigger. Header 2 is the tool banner.
- **The tool banner carries the page title.** It reads "Pokémon League
  Builder" and is the page's h1; no progress bar, and no second copy of the
  title in the body. Controls sit at its right.
- Spacing and idiom get planned together with the owner during the build.

## States the wireframes cover

- **Type**: no type (the default), water, electric, dark. No type runs
  through the badge pipeline like any other and borrows the view page's
  spandrel star for its glyph.
- **Completion**: empty; signature only; TM and badge without a signature;
  everything filled.
- **Line count**: 0, 3, 5 and 6 evolution lines, which changes which rows
  have anything in them.
- **Hover** (desktop only): the row and the column under the pointer darken
  by the type at 9%, each once — the cell where they cross is not doubled.
- **Holding a column** (both platforms): the grid already shows the order
  after the drop, a dashed hole marks where the line lands, and the held
  column floats above it. No insertion line — a line lands in a column, not
  between two. A line moved to a later seat joins later, so its early rows
  empty out and the lines it passed move up.

## Guardrails and outputs

17. **No warnings** for type incoherence. The legend rule (item 9) is the
    only legendary constraint.
18. **Exports.** PNG of an individual leader and of the league summary.
    Planned: side-by-side export — one leader beside the league, fanned out.
19. **Desktop shape.** Real panes with the seam showing, as the dex builder
    has it — not cards floating on a blank canvas. Each pane centres a
    phone-width column rather than stretching its content. Each pane has its
    own header, as the dex builder's do: "Custom Pokémon League" with info
    and export, "Pokémon Trainer Card" with export, and "Adding to: <slot>"
    with a close control. There is no page-wide title bar; the league pane's
    header is the page h1. The card pane carries the card's own type badge
    and theme above the card; the league pane carries the league's name above
    the league card the same way. At rest: league left, open card right, joined by a
    smooth flow out of the open league row. That row's fill runs the full
    width of the league card, through its gutters and with no outline, and
    the flow is the same colour and translucent, so the pane seam reads
    through it and the two meet without an edge. Both cards carry the same
    shadow. Opening the picker slides a third pane in from the RIGHT:
    league, card, picker, each still centring a phone-width column.
20. **Mobile shape.** League home → tap a row → card full-screen → back.
    Selection pane is a bottom sheet. The whole 11-row card fits on one
    screen on both platforms. Three gesture lines sit under the card,
    verbatim:
    - "↕ Drag a pokemon across rows to shift when it evolves"
    - "↔ Drag a column to reorder"
    - The third depends on the boss row. With a legendary placed: "↔ Drag the
      Endgame Boss legendary to change which pokemon it replaces". Without
      one: "Tap a pokemon in the Endgame Boss row to swap in a legendary".
21. **Selector.** Reuse the dex builder's `PokemonBrowser` COMPONENT
    as-is — never a similar rebuild. The sheet chrome, search field, result
    count, chip vocabulary, generation sections and 6-column evo-line grid
    all come along unchanged. Exactly two differences:
    - a "my dex" filter, alongside the type filter pre-selected from the
      card's own type;
    - on mobile, tapping an evo line places it and closes the sheet. No
      staging, no confirm step, no footnotes on the pane.
    Lines appear once per branch, so picking a card IS the branch choice.
22. **Persistence.** One league in localStorage, own zustand store and key,
    versioned like the dex store. The store holds the whole column,
    including the row the user dragged the evolution to; a row renders only
    the members that have an eligible slot. The endgame-boss legend
    overlaps one column inherited from the champion team, and moving it
    changes which Pokemon it covers. Two consequences: a legend that covers
    the Mega/Gigantamax frees that powerup for another Pokemon, and a
    legend that is itself a Mega or Gigantamax spends it.
23. **Visual identity.** my151-native styling; the /vp/ template governs
    tile positioning (right-aligned columns, one line per column).

## Defaults declared 2026-08-28, not yet owner-confirmed

Veto any of these; they ship as stated otherwise.

- Powerup buttons are available in the Champion AND Endgame-boss rows.
- Mega and Dynamax are mutually exclusive on one Pokémon; activating one
  reverts the other. Base form is the shared reset point.
- The concrete curve numbers in item 3.
- Column removal: an X control per column, dex-builder style; remaining
  columns compact toward the rightmost seat. *(Owner-confirmed 2026-08-29
  and built: the X sits on the column's topmost Pokemon.)*
- League reorder works across sections (gym ↔ E4 ↔ champion ↔ boss).

## App feedback round 1 (2026-08-29, decided on the live preview)

1. **Fit-to-viewport card.** The whole template (card + hint lines) fits the
   viewport with no scroll. A JS-measured CSS `zoom` on the card wrapper
   scales everything proportionally; floor 0.55, then scrolling returns.
2. **TM slot empty state** uses the badge hexagon's stroke shade (`dash`),
   not the cell shade.
3. **"No type" is a real option**: the type badge pipeline (geometry, text
   fit, casing) over the no-type grey, with the 4-point star spandrel as its
   symbol. In the picker it spans the grid's full bottom row.
4. **Unset type chip** reads "Select a type": red dotted border, exactly a
   type badge's height, so picking a type shifts no layout.
5. **Column drag previews the reorder**: the grabbed column lifts (shadow,
   slight scale) and snaps to the hovered seat; columns between slide one
   seat over, live. No target ring for reorders — the ring stays only for
   evolution-boundary rows and legendary retargeting.
6. **Hint arrows render as text** (`↕` carries U+FE0E so iOS does not
   substitute the emoji), matching the left-right arrow.
7. **Inputs never trigger iOS focus zoom — at their design sizes.** 16px
   text was tried and rejected as too big. Instead the league entry caps
   the viewport's maximum-scale on iOS only, which suppresses the focus
   auto-zoom while Safari still allows user pinch zoom (it ignores the cap
   for gestures since iOS 10). Android is untouched: it honours the cap
   for pinch and never auto-zooms inputs. The badge input left-aligns
   while empty so the caret sits at the placeholder's start.
8. **Signature picker is restricted to the card's placed lines** — a
   signature is chosen among the team.
9. **TM picker sits on the selection pane's architecture**: BottomSheet on
   mobile (its drag-to-dismiss), centred dialog on desktop, and the pane's
   filter idiom — entry chips opening panels, multi-select values as
   dismissible coloured chips, or/and mode for types, category and contest
   as multi-select with the decided colours. (With single-typed moves,
   "all" across 2+ types is naturally empty.)
10. **Per-column removal shipped** on the topmost Pokemon, dex `RedXIcon`.

## Build plan (own tasks, not part of the page)

- **Powerup symbols:** harvested — Bulbapedia's Mega Evolution and Dynamax
  symbols drive the corner buttons, and the two Primal Reversion icons
  (Kyogre, Groudon) are checked in beside them for the form cycle. All four
  live next to the canvas as `powerup-*.png`.
- **Sprite harvest:** all forms of all Pokémon — gender, alt forms, shiny,
  Mega, Gigantamax — cached like the current set, plus data entries for the
  form Pokémon and a base→forms mapping.
- **Implied-level module:** the regression from item 6, dev-only,
  rerunnable.
- **Onboarding:** a first-run popup explaining the gestures, re-openable
  from an info button.
- **Move data:** a moves dataset (name, type, category, power) for the TM
  picker. The category icons are already harvested — Bulbapedia's
  Scarlet/Violet art, white on transparent, checked in beside the canvas as
  `physical.png`, `special.png` and `status.png`.
- **Page infra:** second Vite entry with static head/h1/body copy,
  sitemap entry, cross-links with the dex builder.

## Demo model used in the mockups

Water card: Chinchou line (rightmost, ace, signature Lanturn), Wooper line,
Lotad line, Magikarp line, Lapras, Feebas line. Boss row swaps Suicune into
the Gyarados seat. Champion row shows Mega button on Gyarados and Dynamax
button on Lapras. Steel card fills the E2 slot in the league. Implied
levels used illustratively: Ludicolo ~36, Milotic ~42.
