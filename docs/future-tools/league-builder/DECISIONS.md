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

## App feedback round 2 (2026-08-30, decided on the live preview)

1. **Boundary drags are shelf handles, applied live.** A run's top edge
   moves that stage's own boundary; its bottom edge moves the next
   stage's; boundaries push their neighbours instead of clamping into
   them, so a shelf can cover stages entirely and either visible handle
   recovers them (`engine.setBoundary`). A mid-run grab is inert until
   the pointer crosses the run's original edge, then continues as that
   handle — releasing mid-run changes nothing. Every move paints the
   store immediately; nothing waits for the release.
2. **Reorder drags preview the real result.** The grid re-derives every
   column at its previewed seat while the drag is held, so a line moved
   toward a later seat shows exactly the members that seat's join row
   admits, and boundaries ride the line object — custom evolution rows
   survive a trip through a shorter column.
3. **Type is a tri-state.** Unset shows "SELECT A TYPE" through the badge
   pipeline (dashed red, plus icon); an explicit "NO TYPE" is its own
   stored value (`'none'`) wearing the grey star badge at identical
   proportions; both differ from a chosen type.
4. **Signature picker defaults unfiltered**, with a "Card lines" chip to
   scope to the card's placed lines; a full template forces the scope
   structurally.
5. **TM picker numeric columns run Att., Acc., PP**; the card's TM slot
   shows the move's type badge and category chip above its name.
6. **Badge slot**: the whole tile (hexagon included) starts text entry;
   the placeholder is centred.
7. **Dex nav switches fade in** (180ms) and heavy pages mount inside a
   transition so the tab animation stops freezing.

## App feedback round 3 (2026-08-30, decided on the live preview)

1. **Type chips.** "Select a type" takes a solid red outline, not a dashed
   one. "NO TYPE" runs through the badge's condense like every real badge —
   it was set at full width and overhung the pill on both sides.
2. **League home fits the screen.** The same fit zoom the gym card uses,
   extracted to `useFitScale`. The desktop league pane is now a fit viewport
   too.
3. **Nine columns, action on the right.** The team block is six wide — the
   largest team the template holds — so the column that was always empty
   moved from the left of the block to the right and became the row's own
   affordance: a plus while the gym is empty, a chevron once it holds
   anything. Both open the card, as the whole row already did.
4. **Mobile is one two-pane track.** Home and the open card sit side by side
   and the track translates, so opening a card pans the camera rather than
   swapping the DOM. `transform` only, 280ms on a decelerating curve, and
   nothing at all under `prefers-reduced-motion`. Both panes stay mounted;
   the off-screen one is `inert`.
5. **Reset a custom evolution order.** When a line's rows no longer match its
   defaults, a blue reset appears on the topmost cell — the opposite corner
   from the red remove X, so the destructive control and the undo one are
   never under the same thumb. (The ask said "top right, opposite the red
   X"; the X is itself top right, so opposite won.)
6. **Card colours separate.** Every cell used to solve for one fixed
   luminance, which threw away the one thing fighting and ground, or ice and
   steel, differ by. Measured: all eighteen cells sat within 0.04 of each
   other in contrast, and the closest pair was ΔE2000 3.95. The target now
   follows each type's own brightness through a saturating curve into a band
   whose ends are set by what the surface has to carry. Closest pair 6.58;
   fighting/ground 4.16 → 12.95, ghost/fairy 3.95 → 15.20.
   `npm run shade-report` prints the ramp; `theme.test.ts` holds the floor.
7. **The league name looks typable.** Sized to its own text by an invisible
   copy in the same grid cell, with a dotted rule under it and a pencil at
   the end of the words.
8. **League rows preview live.** The card grid's column preview, applied to
   the home: while a row is dragged every position draws the card that would
   sit there, at the team size that position allows.
9. **Spacer notes share the label's size and baseline.**
10. **Hints are hanging icon bullets.** One column for the mark, one for the
    words, so wrapped lines keep the indent. Lucide has no laurel — the
    current release ships 2048 icons and none is a wreath — so Tabler's
    `laurel-wreath` (MIT) is vendored as a single component rather than
    adding a second icon library for one glyph.
11. **The legendary is carried in hand.** A floating copy follows the
    pointer, the target still outlines, and its home cell shows the pokemon
    it currently covers instead of the legendary — so the outline says what
    would be replaced.
12. **The My dex chip carries the count**, "My dex n/151", the count in the
    app red and the total in the chip's own ink, in both states.
13. **My dex groups by build section.** With the chip on, results group and
    order by the build page's own sections rather than by generation, so a
    dex built section by section reads back that way.

### Round 4, from the preview

1. **A skipped evolution stage is not a defect.** The correction that forced
   each stage to take at least the row after its pre-evolution's is reverted.
   Levels decide: Caterpie, Metapod and Butterfree all arrive under the first
   threshold, so the card opens on Butterfree, and the shelf handle is what
   pulls the other two in. Same for the six evolutions whose implied level
   lands under the real one below them. `/evolution-levels` still lists every
   line this happens to — as information, not as a fault.
2. **The signature pane, scoped to the team**, is one group rather than a
   generation split: a handful of lines cut across six headings buries the
   thing the user came to pick from. The lines order by the whole line —
   earliest generation any member belongs to, then earliest dex number in it
   — so a Magnezone sits with the generation 1 lines, because its line starts
   at Magnemite.
3. **The summary's sprites take 95% of the row**, the proportion the gym card
   already uses. They were at 77%, which read as icons rather than creatures.
4. **The tool name and the league name are two lines, not one field.** The
   tool name used to *be* the input's placeholder, so typing appeared to
   rename the page. Now the heading names the page and never changes (still
   the crawlable h1), and the field under it — placeholder "Name your league",
   grey and unbolded — is the user's, bold and black once used.

### Round 5, from the preview

1. **In the signature pane each Pokémon is its own tile.** Positions are
   untouched — a line still occupies its own adjacent columns and still never
   straddles a row — but the backing rectangle is per Pokémon rather than
   stretched across the line. The line-shaped tile was picking the wrong
   thing anyway: the signature slot takes one Pokémon, and tapping Chinchou
   staged Lanturn, the last member of its line. Only the signature pane does
   this; picking lines for the card still picks lines.
2. **The team scope draws the seated branches**, not the chains they belong
   to. A flat id set cannot say which branch of a split chain the user chose,
   so with Scyther and Scizor seated the chain grouping still offered Kleavor
   and could show Scyther once per branch. The store now carries the lines
   themselves (`scopeFilterLines`), and the scoped view draws exactly them:
   each line once, each Pokémon once.
3. **"My dex" survives closing the pane.** It is the user's choice, not a
   per-open default; only its contents are re-read.
4. **"Current Team" survives it too**, with one exception it cannot outlive:
   an empty card. With no lines seated there is nothing to narrow to, so the
   chip clears — and does not render at all, rather than offering a tap whose
   only effect is an empty result.

Two bugs came out of building those.

- **The count disagreed with the grid.** It counted every member of every
  matching *chain*, which is right when the grid draws chains and wrong when
  it draws lines: four tiles under a heading that said six. It now counts
  what is drawn.
- **Restricting to nothing was indistinguishable from not restricting.**
  `useFilteredPokemonGrouped` keys its memo on the restriction's ids joined
  by commas, and an empty set and no set both join to `''` — so a user whose
  dex is still empty tapped "My dex 0/151" and got all 1126 back. The key is
  prefixed now, and the empty dex shows the empty state.

### Round 6, from the preview

1. **The league surfaces got their own hold behaviour.** One treatment for
   four surfaces was wrong: see the section below.
2. **The held tile is the size of the tile that was grabbed.** The dex
   builder sizes its tiles against their grid
   (`w-[calc((100%-24px-5%)/6)]`), and inside the drag overlay that
   percentage resolved against the overlay's own box — 27.7px held for a
   56px tile. The overlay measures the grabbed element now and holds that
   width.
3. **A horizontal drag on the gym card picks up the column.** The column is
   what moves, so the column is what the hand holds: every member of the
   line, stacked as the card draws them, not the top sprite alone.
4. **The TM picker drops AND/OR.** A move carries one type, so the two modes
   select the same moves, and offering the choice implies a filter that
   cannot exist. The type chips there are a plain OR.
5. **The "Att" sort caret matches the others.** It had inherited a smaller
   box from the header cell around it.
6. **The legendary drop targets a column, not a cell.** dnd-kit's default
   collision wants the pointer inside the droppable, which on the boss row
   means dropping the legendary on the Pokémon it replaces and hiding it. A
   custom `CollisionDetection` (`bossRowByColumn`) matches on x alone, so a
   column takes the drop from anywhere along its length.
7. **The ↔ hint leaves the legendary cell.** The legendary does not move
   sideways, and the arrow promised a gesture that does nothing.
8. **The "already on the card" pokeball hides under Current Team.** With the
   list scoped to the team every result carries the mark, so it marks
   nothing and costs a corner of every tile.
9. **Tapping a placed line replaces it.** The pane opens on that seat under
   "Replacing: *Gyarados*" rather than "Adding to: Gym 3", and the seat
   keeps its place in the team and its signature mark. The boss row's
   legendary slot overrides this: it opens the legendary picker, and that
   picker now opens on the gym's own type like every other purpose.
10. **"TM" and the disc back apart by 1px.** Round 3 closed the gap and
    closed it too far; the two read as one glyph.

### Round 7, from the preview

1. **No chevron between standalone tiles.** The arrow says one tile evolves
   into the next, which is a relation the tap does not follow when each tile
   is its own pick. The line picker keeps its arrows.
2. **The legendary picker draws individual Pokémon**, on the same terms as
   the signature picker: one tile each, one pick each, and no Pokémon twice.
3. **The powerup discs are smaller and their symbols larger.** 1rem instead
   of 1.15rem, inset far enough that the disc AND an active one's 2px ring
   stay inside the cell — 11.6px now separates neighbouring seats' buttons,
   where 3.8px did and the ring ate most of it.
4. **The discs are circles again**, and the symbols are sized to the circle
   rather than to their own image box. Two separate causes, below.
5. **A preview build seeds a Kanto league.** Below.

Three defects came out of building those, all in what shipped last round.

- **A Pokémon appeared once per generation heading its chain spans.** The
  headings are cut from the members, and a chain is drawn under every heading
  holding one of them: Eevee arrived under Generation 1, 2, 4 and 6, nine
  tiles for a nine-Pokémon chain. The first heading that claims a chain keeps
  it now.
- **A Pokémon appeared once per branch.** `useFilteredPokemonGrouped` emits
  one group per root-to-leaf path, so a split chain repeats every member
  above the split. `mergeBranchesByChain` merges the branches back, which
  keeps a chain's tiles adjacent — the reason the pickers draw lines at all —
  while drawing each member once. Together with the heading fix, Scyther went
  from three tiles to one and Eevee from four to one.
- **The league summary drew the base sprite where the card drew the form.**
  The champion row read Charizard while its own card read Mega Charizard X.
  The summary is a small copy of the card's row, so it takes the form too.

### Why the Dynamax disc was not a circle

Two things made one 1rem button read as squashed sideways, and only one of
them was visible in the layout box.

**The box snapped to an ellipse.** The card scales itself with CSS `zoom`
(`useFitScale`), so a 1rem square is a fractional number of CSS pixels, and
paint snaps an element's edges to whole pixels independently on each axis.
The right-anchored button landed on a fraction that snapped to 15px wide by
16px tall, and `rounded-full` faithfully drew that box: an ellipse.
`getBoundingClientRect` reports the *unsnapped* 15.52 x 15.52 and cannot see
it, which is why the first look at this said the button was fine.

Measuring the painted pixels instead settled it. Filling the disc with a
colour nothing else on the page uses, at a 16x device pixel ratio, the Mega
disc measured 256x256 and the Dynamax one 240x256 — symmetric on both sides,
so an ellipse rather than something clipped. Of the fixes tried, only two
gave a true circle: promoting the button to its own compositing layer
(`will-change: transform`) and paint containment (`contain: paint`). Left
anchoring, `translateZ(0)`, `backface-visibility`, `opacity`, `isolation`, a
no-op filter and `aspect-ratio` all still measured 240x256. `contain: paint`
wins on cost: it gives the element its own paint context with no layer per
button, and the outset ring still draws (measured 318x318, both kinds).

**The symbol pushed on the rim.** Both symbols are `object-contain` in a
square box, and the two arts are shaped very differently: `mega.png` is 56x74
with ink to every edge, so its height binds, while `dynamax.png` is square
but its ink fills 96% of the width and 77% of the height, so its width binds.
One shared percentage cannot serve both — too small and the Dynamax symbol
reads a fifth smaller than the Mega one, too large and its ink runs to the
left and right rims with clear space above and below. Each symbol is now
sized so its *widest* side takes the same share of the disc
(`SYMBOL_EXTENT`, 80%), which works out to 80.0% for Mega and 83.2% for
Dynamax and leaves both the same margin all round.

`e2e/league-powerups.spec.ts` holds the box square and paint containment on,
so removing either brings the ellipse back with a failing test rather than
silently.

### The seeded Kanto league

A preview build with no saved league opens on one: all fourteen slots, six
lines each — the eight Kanto gym leaders, the Elite Four, the champion and
Red on Mt. Silver.

The teams are not invented and not typed out. They come from the game's own
trainer table, `files/poketool/trainer/trainers.json` in the pret
HeartGold/SoulSilver decompilation: the gym leaders' **rematch** parties (the
only Kanto ones that run to six), the Elite Four's second-round parties,
Lance, and Red. A script resolved every species against `pokemon.json` and
computed every branch by walking `evolvesFrom`, so no id in the seed was
written by hand. Serebii, which is where the request pointed, is blocked by
this environment's egress proxy; the decompilation is the same data closer to
the source.

**Nothing in the seed is a state the app cannot reach on its own.** That rule
replaced an earlier shortcut: the first version stripped baby stages, so
Raichu arrived without Pichu. That was special logic in the generator, not
anything the level curve does — the picker walks `evolvesFrom` to the root and
always seats the baby — so it is gone. A seeded line is now the whole line,
root to leaf, exactly as a picker hands it over.

Which raises the case the rule exists for: a leader who fields a stage that is
not the leaf. Brock's team is Onix, and the line a picker gives you is Onix
into Steelix. The seed does not invent a one-member Onix line; it seats the
real line and then reaches Brock's state the way a person would, with one
`setBoundary` call — the same operation a downward drag performs — pushing
Steelix off the bottom of the card. The line then reads as edited, blue reset
button and all, because it is edited. Only two lines need it: Brock's Onix and
Red's Pikachu.

**Seat order is by level, highest first**, so each leader's ace takes seat 1 —
the rightmost column — and carries the signature. Mewtwo on the boss row is
the one thing not from the game: Red has no legendary, and the slot needs
exercising.

It is a fixture, not content, and three guards keep it that way
(`src/league/store/seedLeague.ts`):

1. **Never on production.** The live app opens empty, as it always has.
2. **Never when the key exists.** It writes the store's own persisted shape
   before the store reads it, and only when there is no key at all. A
   returning visitor keeps their league; someone who deliberately cleared
   theirs keeps it cleared. "The key is missing" means a first visit, where
   "every card is empty" does not.
3. **Never past an error.** A blocked or full `localStorage` leaves the app
   on an empty league rather than a broken page.

Two things about the content. Branches start at the Kanto stage, so Pikachu
arrives without Pichu and Jynx without Smoochum — the picker still seats the
baby, and that question is still open above. And the seed carries one of each
thing that is tedious to reach by hand: a Mega on Blue's Charizard, a
Gigantamax on Red's, Mewtwo covering Red's last seat on the boss row only,
a signature on every card, and a TM on every card.

`e2e/league-seed.spec.ts` holds the slot shape, both powerups and the
legendary. Every other league spec now starts from an explicitly blank league
(`e2e/support/leagueSeed.ts`), which is a better statement of intent than the
empty template they used to inherit.

### Two drag treatments, four surfaces

The dex builder, the view page, the league summary and the gym card each had
their own idea of what holding something looks like: a source faded to 25%
here, a target scaled and ringed there, a shadowed copy somewhere else. Four
treatments for one idea reads as four half-finished features.

One treatment for all four was the first fix, and the preview showed why it
was wrong: the two kinds of drag ask different questions. The dex builder asks
*which gap* — between which two lines does this land. The league summary and
the gym card ask *which slot*, and they answer by redrawing the page as if the
slot already held the thing. A copy centred on the pointer covers exactly the
cell that carries the answer.

So `src/components/shared/dragHold.tsx` holds two treatments, and every
surface imports one rather than restating its own:

1. **Between** (dex builder, view page): the copy rides on the pointer and an
   insert bar marks the gap, because the gap is a place the pointer can be.
2. **Into** (league summary, gym card): the copy hangs below the grab point,
   clear of the thumb, and the target reads above it — the row or column the
   drop would take, redrawn with the carried thing seated in it.

Both share what makes a drag legible either way. The source recedes to
`DRAG_SOURCE_OPACITY` (0.25) where it sits, so the layout keeps its shape and
the eye stops reading that copy as live, and exactly one copy stands at full
strength. Where a surface previews the drop, the receding copy is the
previewed one, which is where the carried thing is actually drawn.

What each surface shows about the *destination* still differs, and is meant
to: an insert bar in the dex builder, a re-derived arrangement in the league,
a ring on the boss row for a legendary. Those answer different questions.

A vertical drag on the gym card carries nothing, because it carries nothing:
it shifts an evolution boundary in place. A horizontal one carries the whole
column, the line's members stacked as the card draws them.

`e2e/drag-hold.spec.ts` measures both properties on all four surfaces
mid-drag, and that the held row is the width of the row. The dex half runs on
desktop only, for a harness reason rather than a product one: the touch
projects arm dnd-kit's `TouchSensor`, which wants real touch events, and
Playwright's mouse API emits mouse events.

### Signature picker

Opens on the gym's own type, like the line picker — the scope chip narrows to
the card's team on top of that, and is called **Current Team**.

### Round 8, from the preview

Two defects, both reported from the live preview and both fixed by measuring
the running app rather than reading the code.

1. **The signature mark carries the Pokemon, not just the seat.** The picker
   draws one tile per Pokemon (round 5, item 1), so a tap names a Pokemon.
   The slot then re-derived which member to draw from the boss row, which
   fields the line's leaf: a tap on Geodude answered with Golem, and Brock's
   own Onix would have read as Steelix. `GymCard` now holds `signatureId`
   beside `signatureSeat`, and `signatureMember` in the engine prefers it.

   The seat still owns the mark. A card whose marked line is replaced, or one
   marked before the field existed, falls back to the boss row's member: the
   pick is checked against the line's own members rather than migrated, so
   nothing has to change on disk.

2. **A drag paints the line it carries, not the seat it lands on.** A reorder
   preview swaps `src` on cells that are already on screen. Setting a new
   `src` does not blank an `<img>` — the browser keeps painting the bitmap it
   has until the new one is ready — so a cell whose new sprite had never been
   drawn kept showing the previous tenant for as long as the fetch took.

   Moving a line to a deeper seat is exactly the case that reveals one: seat
   6 reaches the last two rows and seat 1 reaches all eleven, so the stages a
   line hid at seat 6 all arrive at once. A boundary drag does the same on a
   single column. Measured across seven seeded cards, one reorder each: 19
   cells received a sprite the browser was not ready to paint. The card now
   warms every member of every line — plus their Mega and Gigantamax forms,
   because the powerup rides its seat — when the card opens. The same count
   is 0 after.

   `e2e/drag-hold.spec.ts` watches for the swap itself rather than for a
   frame: any `<img>` whose `src` changes to a bitmap the browser does not
   have is the defect, whatever the network does next.

3. **The held legendary wears a cell face.** White, the cell's own corner,
   and the lift shadow, so the copy in hand and a lifted column read as one
   gesture. A bare sprite over the dark boss band read as a loose cutout.

   The face is measured off the grabbed cell at drag start rather than
   restated in rem. Two reasons, both found by measuring: the copy is
   portalled out of the card's CSS `zoom`, so a rem there is the root's rem
   and not the card's; and `rounded-md` is a theme token that moves with the
   root font size, so a hard-coded corner drew 5px where the desktop card
   paints 8px. `grabbedCellFace` reads the painted box, the painted corner,
   and one card-rem in portal pixels, all from the cell itself.

   That also fixed a size the code only appeared to measure. dnd-kit's
   `active.rect.current.initial` is null while `onDragStart` runs, so the
   sprite had always taken the 52px fallback beside a card that paints
   50.47px. It now matches the card exactly.

### Round 9, from the preview

1. **The powerup buttons press wider than they paint.** The disc stays 1rem;
   the button around it is the disc plus half the room beside it, and reaches
   0.5rem above and 0.125rem below. Measured on the built preview, the press
   box is 1.9x the disc's area at 320px and 2.8x at 1280px, and a press 11px
   above the disc now toggles the powerup where it used to open the line
   picker.

   The room is split rather than spent: a disc has two neighbours, the cell's
   other button and the next seat's across the column boundary, and each
   press box takes half of what is free on its own side. No two boxes meet at
   any width — the tightest is 2.4px, at 320px.

2. **The disc sits midway between its neighbours, not at a fixed inset.** The
   column is a share of the viewport while the disc is rem, so the two drift
   apart as the window changes. A fixed 0.375rem inset was tuned at 390px and
   left 11.1px of clearance at 430px, but at 320x844 the two discs in one
   cell **overlapped by 1.8px** — the very thing round 7 set out to prevent,
   on a width round 7 never measured. `calc((100% - 2rem) / 4)` splits the
   slack four ways, which puts each disc exactly between its neighbours at
   every width: 4.8px of clearance at 320px, 19.9px at 1280px.

   The overlap moves with the viewport's height as well as its width, because
   the card scales itself to fit: the same card at 320x800 cleared by 0.9px
   and at 320x844 overlapped. A rule that splits the room needs neither
   number.

3. **The remove and reset controls do not overlap, and never did.** Round 8's
   report said they did on Brock's Onix. That was wrong: reset is `left-0`,
   remove is `right-0`, so they sit at opposite corners of their own column.
   Measured on the seeded league, the overlap is 0px². What is true, and is
   its own question, is that seat 1's reset and seat 2's remove meet **across
   the column boundary** with a 0.0px gap.

### Round 10, from the preview

1. **A name follows the language.** The fix is in the shared i18n layer, not
   in the league. `useNamesVersion` handed React a snapshot that counted name
   catalog downloads and ignored the locale, and the two are independent: a
   switch to a locale whose names are loaded starts no download, and
   `applyLocale` starts the names fetch *before* it awaits the UI catalog, so
   the download can land while the locale is still the old one. In that order
   React was called back with an unchanged snapshot and skipped the
   re-render. The symptom, measured: a gym card reading `Onix` under type
   badges that already said いわ / じめん, until something unrelated remounted
   it. `getNamesVersion` now sums the two counters, which changes exactly when
   either does, in whichever order they arrive.

   The league surfaces that draw a name also have to subscribe at all, so
   `SignatureSlot` and the pane heading call `useNamesVersion` themselves.

2. **A settings gear, and two ways to read the league.** *Gym Challenge* is
   the run through: each trainer at the row you meet them, two Pokemon up to
   six. *Endgame Rematches* reads every trainer at their last row, at full
   size, legendary and all — the HeartGold/SoulSilver rematch for the whole
   league at once. The choice persists with the league.

   The dex builder's view settings are a docked pane beside the grid. The
   league already spends its desktop width on three panes, so the same
   content arrives as an anchored dropdown there and as the same bottom sheet
   on mobile. The option rows are the dex builder's.

3. **A powerup belongs to its line, not its seat.** `Powerup` names a seat,
   and a column drag renumbers seats, so dragging Salamence's column left
   handed Mega Salamence to whatever line landed in seat 3. The signature
   mark already had this rule; both now go through one `seatAfterMove`. The
   powerup also leaves with its own line and shifts when an earlier line is
   removed, and it does not transfer to a line that replaces its own.

4. **The TM label wears the move's type.** The disc above it already did. A
   TM is the move, and the card's own colour is everywhere else on the card.

5. **The legendary carries its own remove control.** It covers a seat rather
   than filling one, so removing it puts that seat's line back and touches
   nothing else — measured: the lines are byte-for-byte unchanged.

6. **The reset control has clearance.** `RotateCcw` is a ring with an
   arrowhead bolted to its top-left, so its bounding box is wider than its
   ring on that side; at 0.6rem with a 3-unit stroke the head touched the
   disc's rim while the opposite side kept a clear margin. 0.55rem and a
   2.5-unit stroke balance it: measured at dpr 8, the blue margins went from
   29/24 to 29/31 across and 29/24 to 30/31 down.

   What was *not* wrong is worth recording, because it was the obvious
   suspect: the disc is a true circle (120x120 device pixels, before and
   after), and the ink's centre of mass sits 0.2% from the disc's centre. The
   defect was clearance, not centring.

### Round 11, from the preview

1. **A card can be cleared from its own gear.** One destructive row, behind
   the dex builder's confirm: the first press turns *Clear Card* into *Are you
   sure?*, the second empties the card and closes the menu, and the armed
   state lapses after three seconds or on a press outside. That is the
   `SettingsMenu` in `PokedexGrid.tsx`, moved to the card's tool bar; the
   wording differs only because the scope does — the dex builder clears a dex
   and this clears one card.

   `clearCard` resets the card to `emptyCard()`, so it takes the type, theme,
   lines, signature, TM, badge, legendary and powerup together. What it must
   not take is anything else, and that is the assertion the tests lead with:
   the next card comes back byte-for-byte.

   It sits beside the card's own type and theme rather than in the league tool
   bar, because the league's gear is league-wide (the view mode, round 10) and
   this is not. Two gears, two scopes, each next to what it governs.

### Round 12, from the preview

1. **The team scope and the gym's type stop asking the same question.** Every
   line on a Rock gym is Rock, so the type chip under the team scope narrows
   the team to a subset of itself and on a mono-type card can narrow it to
   nothing. Turning the scope on now puts the type filter aside; turning it
   off gives it back, unless the user picked a different type meanwhile, in
   which case their newer answer stands.

2. **A full card shows the scope chip, locked.** The restriction was already
   structural — there is no seventh seat for a line from outside the team —
   but it was also invisible: the pane simply offered six Pokemon and said
   nothing. The chip now shows and shows as on, wears a lock where the
   dismiss sits, and answers a press with "Choose a pokemon from your team"
   for a couple of seconds. A control that reads as broken earns a second and
   a third press; one that says why earns none.

### Round 13, mocked up but not built

**Signature + partner.** Four geometries for splitting the card's top-left
slot between two Pokemon, each drawn at the slot's real 148 x 204 and in all
four states (empty, signature only, partner only, both):
`partner-slot/` holds the artboards, the study page and the scripts that
generate both.

Two rules the mockups are built on, and they are the interesting part:

- **The partner is not on the team.** The signature picker locks to the
  card's own lines once the template is full; the partner picker never does.
  A partner is the leader's companion rather than their sixth Pokemon, so the
  pair can be off-type.
- **It is still seated when there is room.** Choosing a partner while an
  evolution line is free places it in that line: on a five-line card the
  partner becomes the sixth line *and* the partner. Only on a full card does
  it live in the slot alone — so the same tap means two different things, and
  the picker has to say which before the tap rather than after.

What the drawing settled, which the argument had not: the slot is portrait by
a third, so halving it along the long side leaves two columns nearly three
times taller than their contents; and a diagonal seam cannot hold the lower
half's heading above its sprite, which costs the two halves a shared reading
order. Nothing is decided.

### Round 14, from the preview

1. **A bottom sheet portals itself, and a test says so.** The settings sheet
   opened 780px wide on a 390px phone, with its last line off the bottom.
   Both halves of that are one cause: `position: fixed` anchors to the
   viewport only while no ancestor is transformed, and the league's mobile
   shell is two panes on one 200%-wide track that the camera translates.

   The fix that cannot be got wrong is in `BottomSheet` rather than in each
   caller: the sheet leaves the tree itself. Two callers were already
   portalling their own; the third was not, which is the second time this
   defect has shipped.

   The test is the more useful half. `league-overlays.spec.ts` now sweeps
   every overlay the league can open — both gears, the type picker, the line
   picker, the TM picker — and after each one asserts the property rather
   than the symptom: **no painted `position: fixed` element has a transformed,
   filtered or perspective ancestor**, and every overlay box sits inside the
   window. A new overlay is caught the moment the sweep opens it. (dnd-kit's
   1x1 clipped live regions are skipped: where they land cannot be wrong.)

   Portalling broke one thing worth recording. `LanguagePicker` closed itself
   on any `mousedown` outside its own root, and a portalled sheet is outside
   it — so picking a language from the sheet closed the menu before the chip
   could act. `pressedOutside` (`src/lib/outsidePress.ts`) is the shared rule:
   a press inside any `[data-overlay]` belongs to whatever opened it.

2. **A powerup per row, and the first press sets both.** The champion and
   endgame boss rows are the same six Pokemon at different strengths, so
   pressing Mega once and finding it on only one of them would read as the
   press not having worked. Every press after the first sets only its own
   row, which is what lets a leader Mega one Pokemon as champion and another
   at full strength.

   `GymCard.powerups` is keyed by row. A card saved before the two could
   differ carries `powerup` instead, and `powerupAt` reads that on both rows
   — which is exactly what one shared powerup meant. Nothing writes the old
   field any more; the first press on such a card replaces it.

### Round 15, mocked up but not built

**The diagonal, three seams that clip nothing.** The first diagonal cut its
own halves: the lower one lost its heading and the two stopped reading in the
same order. These three keep a seam and give each half a rectangle that fits
entirely inside it, so both read heading, sprite, name — and, in a second row
each, the Pokemon's types. `partner-slot/study.html` holds them, generated by
`diagonals.py`.

- **Corner quarters** keeps the 45 degree seam and gives each half the largest
  rectangle inside its own triangle, 64 x 96. The only variant whose halves
  are identical, so neither reads as the lesser one; the sprite falls to 46px
  with types on.
- **Shallow bands** lays the seam almost flat. The content is a 90px column
  rather than the full width, because a full-width band has to clear the
  seam's lowest point and loses all 72px the seam sweeps crossing the box.
- **Major and minor** cuts a corner off at 62/38, with no type pills and the
  partner's heading *under* its sprite rather than over it. Both are the same
  economy: the seam is what limits this variant, so the less full-width text
  the minor half carries near it, the further into its own corner the block
  can sit — which is room the sprite gets back. Measured, the partner's
  sprite went from 26px to 44px and the signature's from 46px to 68px, on the
  same seam.

  One thing the measurement corrected. For a full-width box under a seam that
  runs down to the left, the binding constraint is the seam at the box's
  *right* edge, not its left — the far corner meets it first. Sizing to the
  left edge put the signature 14px into the partner's half.

Two things the drawing settled. The type pills have to sit in a row rather
than the card's own stack: two stacked pills cost 24px of the ~74 a half
gets. And a content box that reaches past the seam puts one half's heading in
the other's territory, which is the first diagonal's mistake wearing a
different hat — so the study measures every panel and asserts no box crosses
its seam and nothing overflows the slot.

### Round 16, from the preview

**A press and hold picks a row up; it does not select it.** On iOS a long
press is two gestures at once — pick this up, and start a text selection —
and the selection was winning: the league summary answered a press-and-hold
with a Copy / Search callout spanning two rows, and the gym card did the same
on a column.

The `-webkit-touch-callout: none` already on `*` suppresses the *image and
link* callout, not the selection one. Only `user-select` does that, and the
dex builder's tiles had always set it for themselves while the two league
surfaces never had.

So the rule went where every drag surface can reach it. dnd-kit marks each
draggable with `aria-roledescription="draggable"`, which makes one selector
in `index.css` cover the surfaces that exist and the ones nobody has written
yet. Descendants are named explicitly, because `user-select` is not an
inherited property; fields inside a draggable are exempted, so the day one
exists it still works.

`e2e/drag-hold.spec.ts` asserts the property on all three surfaces, and it
proves it rather than reading the declaration: it asks the engine to select
each draggable's contents and requires nothing back. The callout itself is
device-only and is named as such.

### Round 17, mocked up but not built

**Corner, high is the seam.** It runs from 56px down the right edge to the
bottom-left corner, and it gives the signature 80px and the partner 52px.

**Each half is sized on its own.** Two earlier passes got this wrong in
opposite directions. The first solved each half for the largest sprite it
could hold and let the seam's angle work as a size dial, so the partner fell
to 14px. The second held both halves to one shared size, which sounds like
the fix and is not: one size means the *smaller* half sets it, so the seam
drags the signature down to whatever the partner can take, and every sprite
in the section came out smaller than a sprite anywhere else in the study.

The rule now has a floor and a ceiling, both taken from the card.

- **52px is the floor.** It is `SPRITE_REM`, the sprite a Pokemon gets in a
  team cell. Anything under it is smaller than an ordinary cell, which is the
  thing the section exists to avoid. A half that cannot reach the floor is
  drawn at it and flagged, rather than shrunk out of the finding.
- **92px is the ceiling to beat.** It is `5.75rem`, what the slot gives one
  Pokemon today, and it is what the signature gives up to share the slot.

Between them each half takes the largest sprite its own partition holds,
rounded down to 4px so the sizes land on the rem grid and the block keeps a
little slack to move toward its own centre with.

| Seam | Signature | Partner | Off centre |
| --- | --- | --- | --- |
| Corner, full (corner to corner) | 64px | 64px | 14px / 7px |
| **Corner, high (chosen)** | **80px** | **52px** | 17px / 15px |
| Corner, mid | 92px | 36px, under the floor | 14px / — |
| Edge seam (3c today) | 76px | 56px | 10px / 32px |

**Placement is solved, not drawn.** Each sprite wants its centre on the area
centroid of its own partition. `seamends.py` clips the slot rect against the
seam, takes that centroid, and searches the placements where the whole block
— heading, sprite and name — clears the seam and the slot edges, keeping the
one whose *sprite* centre lands nearest. It solves for the sprite rather than
the block because the heading sits above it on one half and below it on the
other, so the same block puts its sprite in two different places.

Size and centring trade at about **3px of centring per 4px of sprite**, so
the off-centre column is the price of the two before it.

Three readings from the table.

- **Corner, high buys the most for the least.** The signature lands within
  12px of the 92px it has to itself today, and the partner still gets a full
  team-cell sprite. Nothing in the slot is smaller than a Pokemon anywhere
  else on the card.
- **Corner, full is the only seam that cuts the slot into the same shape
  twice**, so both halves land on 64px and neither is the lesser one — which
  is the argument against it as much as for it, since nothing then says which
  of the two is the ace.
- **A corner seam runs out.** Past about 62px down the right edge the partner
  cannot clear the seam at a team cell's size. Corner, mid is drawn at the
  floor and flagged to show how far into the signature it would reach.

**An empty half has to hold the filled half's layout, not just its ring.**
The partner's heading sat directly under the placeholder circle when empty
and under the name when filled, so the word moved between the two states. The
empty state now keeps the sprite's square and a blank name line, and only
swaps the sprite for a ring. `check-seamends.mjs` measures it: it reads the
heading and name offsets in both states and fails on more than 0.5px of
movement. Removing the reserved line fails all four panels, which is how the
check was proved to discriminate. The same script holds the 52px floor and
allows a seam crossing only on a panel the section itself flags.

### Round 3, follow-ups from the preview

1. **The TM disc wears the move's type**, not the gym's. A TM *is* the move;
   the gym's colour is already the whole card. The label sits tight under
   the disc — its viewBox carries its own padding, so the gap was double.
2. **The badge name is one phrase.** "Badge" flows after the entered text and
   wraps with it, so a long name puts the word at the end of the last line.
   That rules an `<input>` out — a replaced element neither wraps nor flows
   with a sibling word — so the field is a contenteditable span, one text
   flow, nothing to keep in sync with a mirror. Its placeholder is the
   field's own `::before`, because an empty inline span is zero-wide and
   leaves nothing to tap.

   The limit is the box, not a character count: 40 wide letters and 40 narrow
   ones do not occupy the same space, so any single cap is either too tight
   for one or lets the other spill. Each edit is measured against the room
   the slot has and rejected if it does not fit, with a hard ceiling of 60
   behind it so a paste cannot put a novel in the store.

   Two traps, both real, both found by driving it: normalizing the text on
   input makes the store and the DOM disagree on the next render (a browser
   inserts a non-breaking space for a trailing one), and the only way to
   reconcile that is to rewrite the field, which throws the caret to the
   start — typing "Thunder Cascade" came back as "Cascade SThunder". And
   writing to the field at all while it has focus is the same bug by another
   route. So the field stores exactly what it holds, and React only ever
   catches it up while it is unfocused.
3. **The My dex chip's count is bold**, in the app red, against the total in
   the chip's own ink.

`e2e/league-card-slots.spec.ts` holds the disc colour, the phrase, and the
fit — at 320, 390 and desktop widths.

### What the pane track broke, and the rule that came out of it

The two-pane track pays for its smoothness with a `transform`, and a
transformed ancestor becomes the containing block for `position: fixed`
descendants. So the card's own overlays — the type picker and the TM picker —
stopped anchoring to the viewport and anchored to the 200%-wide track: the
type picker spanned both panes, half of it off screen to the left.

Both are portalled to `document.body` now, which takes them out of the tree
entirely so no ancestor can move them again. The selection sheet was already
safe, being a sibling of the track rather than a child.

The rule this leaves: **an overlay is viewport furniture, so it renders at the
document root, not wherever its owner happens to sit.** `e2e/league-overlays.spec.ts`
holds it — it opens each picker and measures the outermost fixed box against
the window, at 320, 390 and desktop widths. Put the picker back inside the
track and it fails at `left: -412`.

### Level model, and what it was hiding

The round-3 pass also asked for the evolution-level regression to be made
inspectable. `/evolution-levels` is a preview-only page (the entry refuses to
mount on the production deploy) that draws the fit, the cloud it was fitted
to, and every level-less evolver where the model put it.
`npm run level-report` prints the same numbers.

Building it turned up a defect worth recording. The curve alone stripped a
member from **fifteen** lines, for two reasons:

- Whole lines finish under the first threshold. Caterpie, Metapod and
  Butterfree all arrive at or below level 12, so all three claimed row 1 and
  only Butterfree ever drew.
- Six evolutions have no stated level and the implied one lands at or under
  the real level of the stage below — Rhydon evolves at 42, Rhyperior is a
  trade whose implied level is 38 — squeezing the middle stage out.

`defaultBoundaries` now gives each stage at least the row after its
pre-evolution's. Levels still decide wherever they are consistent; the rule
only ever moves a boundary that would have erased a member. All fifteen lines
show every member again.

Open, for the owner:

- **Baby forms.** Seating any member of 21 lines seats the baby too, because
  the branch walks to the root of the chain. Picking Pikachu puts Pichu in
  gym 1. Keep, or start the line at the first non-baby stage?
- **Seat capacity.** Seat 6 joins at row 10, so it offers two rows for a
  three-stage line. Structural; the drag can still reveal the third.
- **Fit error.** R² 0.52, RMSE 7.3 levels against rows about six levels
  apart, so an implied stage is often one row out either way. A better model
  would need the evolution *method* (stone, trade, friendship), which the
  dataset does not carry.

### Mega and Gigantamax (built 2026-08-30)

The card spacer has always read "Champion may have one Mega/Gigantamax", and
nothing rendered the buttons. The blocker was data, not UI: `pokemon.json`
carries one row per species, with no Mega or Gigantamax flag and no form
sprites, so eligibility could not be derived from anything checked in.

`npm run league:powerups` (`scripts/league/fetch-powerup-forms.ts`) harvests
it and commits the result, so the app itself needs no network. It reads
PokeAPI's `pokemon.csv`, keeps the `-mega`, `-mega-x`, `-mega-y`, `-mega-z`,
`-primal` and `-gmax` forms, and writes `src/league/data/powerupForms.json`
plus one sprite per form. **116 species — 88 with a Mega or Primal, 32 with a
Gigantamax, four with both — and 126 form sprites.** Six Pokémon carry two
Megas: Charizard, Raichu and Mewtwo their X and Y, and Absol, Garchomp and
Lucario their Z.

Three things the raw table needed:

- **Deduplication by label.** The CSV carries per-gender and per-appearance
  rows, so Meowstic listed two identical Gigantamax entries and Tatsugiri
  three. Keying on `species:label` collapses them and still keeps Charizard's
  Mega X and Mega Y apart, because those are different labels.
- **A sprite that exists.** `zygarde-mega` sits in the table and has no
  sprite anywhere. A form whose sprite fails to download is dropped, so the
  card can never render a hole.
- **Every lettered suffix spelled out.** The first harvest matched
  `-mega-x`, `-mega-y` and `-mega`, and `absol-mega-z` ends with none of
  them, so three Pokémon silently lost their second Mega. `-eternamax` stays
  out on purpose: Eternamax Eternatus is a raid boss rather than a form a
  trainer takes, and Eternatus reaches a card only through the legendary
  slot, which carries no buttons.

How the card behaves:

1. **The buttons live on the champion and endgame boss rows only**, and only
   under a Pokémon that has that form. Mega bottom-left, Dynamax
   bottom-right, opposite corners so neither sits under the remove X.
2. **One powerup per card.** Pressing Mega on another seat moves it there,
   as does pressing Dynamax on the same seat: the two are exclusive on one
   Pokémon, and the card allows one.
3. **Pressing cycles, then returns to base** — Mega Charizard X, Mega
   Charizard Y, Charizard. That is what lets one button carry a Pokémon with
   two Megas, and what gives every button an off state without a second
   control.
4. **A powerup is a form change, never a swap** (item 8). The seat keeps its
   line, its place, and its evolution rows; the sprite and the alt text
   change on the rows that allow it.
5. **The state stores a seat, a kind and an index**, not a form id. The
   seat's Pokémon can change under it — the line is replaced, a boundary
   moves — and an index still means "this Pokémon's first Mega" wherever it
   lands. When the new occupant has no such form, `formAt` returns null and
   the base sprite draws.

Always a white disc behind the symbol, whatever the card's colour: the
Bulbapedia symbols are poster art and mush at 18px on top of a sprite. The
*ring* carries the on state, not the opacity, so an available powerup stays
readable while an active one is unmistakable.

`e2e/league-powerups.spec.ts` proves the row restriction, the Charizard
cycle, and that a card holds one powerup at a time, on all three projects.

Still open: DECISIONS' own rule that **a legendary covering the Mega or
Gigantamax frees that powerup for another Pokémon** is not implemented — the
legendary and the powerup are independent today. The form *names* also appear
only in the sprite's alt text; nothing on the card says "Mega Charizard X".

## Site chrome (decided 2026-08-29, built the same day)

Two bars, both tools. Top bar, identical everywhere: wordmark left; the
language globe and a **Tools dropdown** right — a dropdown, not spelled-out
links, because more tools are coming. Second bar is the tool's own, one
2.75rem height across tools:

- **Dex builder:** "Dex Builder" left as real text until anything is
  placed, then the n/151 count; the Build/Analytics/View nav centred; the
  page's own controls (report, settings, export) right-aligned with no
  vertical divider and no shading. The milestone progress bar is retired —
  the admin dashboard shows it did not lift conversion — and the milestone
  popups stay (they mount in App, independent of the chrome).
- **League builder:** the name input reads "Pokémon League Builder" until
  the user names their league; an sr-only h1 keeps the heading in the
  hydrated DOM and the static shell keeps the crawlable one. Home and card
  bars hold the same height as the dex bar.

Enforced, not hoped: `e2e/header-chrome.spec.ts` proves the three cells
never overlap at 320/390/desktop in both left-cell states, and the verify
harness asserts the same lanes per view on every surface plus the league
bar height.

## Build plan (own tasks, not part of the page)

- **Localise the league surface.** The tool is English-only apart from
  Pokémon names (`pokemonLabel`) and type names (`typeLabel`), which already
  follow the language. Deferred until the English copy settles, then done in
  one pass. What is currently hard-coded, from a sweep of `src/league`:
  - **Move names**, the largest piece: `src/data/moves.json` carries one
    English `name` per move, so the TM picker and the card's TM slot cannot
    follow the language. Needs a localised name per move from the same
    PokeAPI harvest the type names came from (`npm run i18n:game-text`), and
    a `moveLabel` beside `pokemonLabel`.
  - **The word "Badge"**, which the badge field appends to the user's own
    name ("Thunder Badge"), plus the "Badge Name" placeholder and the
    "No badges" empty state.
  - **The band labels**: GYM LEADER TEAM, ELITE FOUR & CHAMPION, ENDGAME
    BOSS TEAM, and the note "Champion may have one Mega/Gigantamax".
  - **The slot labels** on the league home: GYM LEADERS, ELITE FOUR,
    CHAMPION, ENDGAME BOSS.
  - **The card's hints and fields**: the three drag hints, SIGNATURE
    POKÉMON, "Gym type", "Gym theme", "No type", "Select a type", and the
    pane's "Adding to:" and "Replacing:" headers.
  - **The TM picker's own chrome**: "Search moves", Type, Category, Contest,
    and the result table's Move, Att., Acc. headings.
  - **The powerup labels** "Mega Evolution" and "Dynamax", which are the
    buttons' only accessible names.

  `e2e/dev/unextracted.spec.ts` already fails any visible text that bypasses
  the catalog on the builder, view and analytics pages. Adding the league
  page to it is the check that keeps this done once it is done.

  Round 10 closed the one part of this that was a defect rather than missing
  work: Pokemon names already had translations and were not being redrawn
  when the language changed. Everything listed above is still English-only by
  omission, which is the part that waits.

- **Powerup symbols:** done. Bulbapedia's Mega Evolution and Dynamax symbols
  drive the corner buttons, checked in as `public/powerups/mega.png` and
  `dynamax.png`. The two Primal Reversion icons (Kyogre, Groudon) stay beside
  the canvas, unused: a Primal is a Mega-slot form here, under the Mega
  button.
- **Sprite harvest:** the Mega and Gigantamax half is done — 123 form sprites
  and a species→forms map, from `npm run league:powerups`. Gender, alt-form
  and shiny sprites are still open, as are data entries for the form Pokémon
  themselves (the card reads a label and a sprite id, nothing more).
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
