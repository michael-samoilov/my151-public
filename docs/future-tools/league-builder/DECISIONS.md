# League builder — settled design decisions

Outcome of the grilling session on 2026-08-27. The owner accepted every
recommendation ("Proceed"). Treat each item as settled. Reopen an item only if
the owner asks.

Design canvas (three UI directions, league overview, mobile shape):
https://claude.ai/code/artifact/35e27776-53a2-4159-8d33-4cbd9dcc3026

## Product frame (from `../HANDOFF.md`)

- Own page at `/pokemon-league-builder`, second Vite entry, real static HTML
  (title, meta description, h1, body copy). Not a client-side route.
- The page must stand alone. Cross-tool filters come later.
- No share links in v1.

## Card engine

1. **Stage rows.** Fixed 10 rows for every card: "No badges" through
   "7 badges", then Elite 4, then Full Team. Gym leader N in a league is
   fought at the "N−1 badges" row.
2. **Level curve.** League-wide setting with editable defaults:
   `12 / 16 / 21 / 26 / 31 / 36 / 41 / 46 / 54 / 62`. The card shows no
   levels by default. An advanced toggle reveals the thresholds.
3. **Column join.** The row you drop into is the stage where the evolution
   line joins. The column fills that row and every later row, evolving by
   the curve. Earlier rows stay empty. Hard cap: 6 columns. Soft warning
   when a row exceeds 6.
4. **Non-level evolutions.** Generate evolution method data from PokeAPI
   (new manual script, same pattern as `scripts/generate-data.cjs`; the
   repo has `minimum_level` only). Default pseudo-levels: stone 30,
   trade 36, friendship 22, other 30. The drag handle overrides any of
   them per column.
5. **Branched lines.** The dropped Pokémon defines the path through itself.
   When the dropped Pokémon's line branches downstream, show a one-tap
   branch picker at drop time.

## Card identity

6. **Metadata fields, all five, cheap versions.** Specialist type (drives
   filters and soft validation), theme as free text, signature Pokémon
   (defaults to the ace column), TM as free text, badge = name plus a
   preset icon. No image uploads.
7. **Trainer identity.** Preset trainer-class pixel sprites (PokeAPI
   trainer sprite set, cached like the Pokémon sprites), with a
   colored-initial chip as fallback. Never user uploads.

## League summary

8. **Roster.** Fixed 14 slots: 8 gyms, 4 Elite 4, 1 champion, 1 evil-team
   boss (single encounter). Rivals and repeat boss encounters deferred.
9. **Stage mapping.** Gym N shows the "N−1 badges" row. All Elite 4 members
   show the Elite 4 row. Champion shows Full Team. Boss shows a per-boss
   stage, default "7 badges". Reordering trainers re-derives every shown
   team.

## Guardrails and scope

10. **Rule enforcement.** Soft warnings only: type coherence, one minor
    Legendary in Full Team. Megas deferred until their data exists; the
    rule text stays as flavor. Duplicate lines across trainers stay
    allowed, silently.
11. **v1 outputs.** Card PNG export, reusing `src/lib/exportImage.ts`.
    Fast-follows: league-summary export, "only from my 151" filter, full
    localization. Design the store so the filter is trivial.
12. **Screen fit.** The whole 10-row card fits on one desktop screen
    (≥1024px). Mobile gets its own shape per the repo's responsive
    doctrine — the canvas shows a stage-focused shape.
13. **Persistence.** One league in localStorage. Own zustand store and
    key, versioned like the dex store. Cards live in league slots plus a
    small unplaced bench. Multiple leagues deferred.
14. **Visual identity.** my151-native design; the /vp/ template survives
    as structure, not skin. An optional /vp/-style export theme stays open
    as a later add-on.

## Open items

- Direction pick: A (Card Table), B (Evolution Lanes, leading candidate),
  or C (Stage Focus). See the canvas.
- Drag-handle interaction details — parked by the owner until after the
  direction pick.
- League-summary reorder mechanics (the model is settled; the interaction
  is not).

## Demo model used in the mockups

Marina, Water specialist. Lines and join stages: Wooper (r0), Lotad (r0),
Magikarp (r2, evolves on drop at Lv 20), Feebas (r3, trade default 36),
Chinchou (ace, r0, Lv 27), Lapras (Full Team only). Ferrum, Steel
specialist, fills gym 7 in the league overview.
