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

### One drag treatment, four surfaces

The dex builder, the view page, the league summary and the gym card each had
their own idea of what holding something looks like: a source faded to 25%
here, a target scaled and ringed there, a shadowed copy somewhere else. Four
treatments for one idea reads as four half-finished features.

The idea now lives in `src/components/shared/dragHold.tsx` and every surface
imports it rather than restating it:

1. **The source recedes** to `DRAG_SOURCE_OPACITY` (0.25) where it sits, so
   the layout keeps its shape and the eye stops reading that copy as live.
   Where a surface previews the drop — the league summary and the gym card
   both re-derive mid-drag — the receding copy is the previewed one, which is
   where the carried thing is actually drawn.
2. **A copy is held**, centred on the pointer inside dnd-kit's
   `<DragOverlay>`, at the size of the thing that was grabbed, and it is the
   only thing at full strength during a drag.

What each surface shows about the *destination* still differs, and is meant
to: an insert bar in the dex builder, a re-derived arrangement in the league,
a ring on the boss row for a legendary. Those answer different questions.

A vertical drag on the gym card carries nothing, because it carries nothing:
it shifts an evolution boundary in place.

`e2e/drag-hold.spec.ts` measures both properties on all four surfaces
mid-drag, and that the held row is the width of the row. The dex half runs on
desktop only, for a harness reason rather than a product one: the touch
projects arm dnd-kit's `TouchSensor`, which wants real touch events, and
Playwright's mouse API emits mouse events.

### Signature picker

Opens on the gym's own type, like the line picker — the scope chip narrows to
the card's team on top of that, and is called **Current Team**.

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

### Not built, contrary to the card's own promise

The spacer reads "Champion may have one Mega/Gigantamax", and nothing renders
those buttons: powerups are still on the build plan below, and the blocker is
data, not UI. `pokemon.json` carries no Mega or Gigantamax flag and no form
sprites, so eligibility cannot be derived from what is checked in. It needs
the sprite-and-form harvest already scheduled below.

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
