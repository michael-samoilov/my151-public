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
11. **Type glyph.** The card is identified by its type icon. The n/a type
    uses the 4-pointed curved-star spandrel from the view page outlines.
    No trainer names, no avatars.
12. **Signature.** A data field pointing at a line (optionally a specific
    form — which also caps that column's autofill at that form). Picking a
    signature while under 6 lines inserts its line rightmost, shifting
    others left; with 6 lines placed, it only marks an existing line.
    Column drag never changes signature status. Removing the line removes
    the signature.

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
16. **Stage glyphs** (used on the card AND the league):
    - Gym N: N−1 filled square diamonds plus one border-only diamond.
    - Elite 4 on the card: 4 stars. In the league: slot k shows k stars.
    - Champion: border-only crown. Endgame boss: filled crown.

## Guardrails and outputs

17. **No warnings** for type incoherence. The legend rule (item 9) is the
    only legendary constraint.
18. **Exports.** PNG of an individual leader and of the league summary.
    Planned: side-by-side export — one leader beside the league, fanned out.
19. **Desktop shape.** Two panes: open card left, league right, with a
    fan-out connector from the card's league row. The selection pane
    overlays the league pane while active. This mirrors the summary-row →
    card metaphor.
20. **Mobile shape.** League home → tap a row → card full-screen → back.
    Selection pane is a bottom sheet. The whole 11-row card fits on one
    screen on both platforms.
21. **Selector.** The evo-line pane groups by branch: each branch is its
    own pickable line card (three cards for Eevee's first three branches,
    for example), so picking a card IS the branch choice. "My 151" filter
    ships in v1.
22. **Persistence.** One league in localStorage, own zustand store and key,
    versioned like the dex store.
23. **Visual identity.** my151-native styling; the /vp/ template governs
    tile positioning (right-aligned columns, one line per column).

## Defaults declared 2026-08-28, not yet owner-confirmed

Veto any of these; they ship as stated otherwise.

- Powerup buttons are available in the Champion AND Endgame-boss rows.
- Mega and Dynamax are mutually exclusive on one Pokémon; activating one
  reverts the other. Base form is the shared reset point.
- The concrete curve numbers in item 3.
- Column removal: an X control per column, dex-builder style; remaining
  columns compact toward the rightmost seat.
- League reorder works across sections (gym ↔ E4 ↔ champion ↔ boss).

## Build plan (own tasks, not part of the page)

- **Sprite harvest:** all forms of all Pokémon — gender, alt forms, shiny,
  Mega, Gigantamax — cached like the current set, plus data entries for the
  form Pokémon and a base→forms mapping.
- **Implied-level module:** the regression from item 6, dev-only,
  rerunnable.
- **Onboarding:** a first-run popup explaining the gestures, re-openable
  from an info button.
- **Page infra:** second Vite entry with static head/h1/body copy,
  sitemap entry, cross-links with the dex builder.

## Demo model used in the mockups

Water card: Chinchou line (rightmost, ace, signature Lanturn), Wooper line,
Lotad line, Magikarp line, Lapras, Feebas line. Boss row swaps Suicune into
the Gyarados seat. Champion row shows Mega button on Gyarados and Dynamax
button on Lapras. Steel card fills the E2 slot in the league. Implied
levels used illustratively: Ludicolo ~36, Milotic ~42.
