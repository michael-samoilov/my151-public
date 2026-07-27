# Proposed English display changes — awaiting approval

Extraction is meant to be invisible in English: same strings, different source.
Anything that would actually change what an English user sees is parked here
instead of being applied, per your call to approve these manually.

Nothing in this file has been applied.

| Where | Currently shows | Proposed | Why |
|---|---|---|---|
| Browser add/remove FAB (`PokemonBrowser.tsx`) | `Add 3 Pokemon` / `Remove 2 Pokemon` | `Add 3 Pokémon` / `Remove 2 Pokémon` | Every other string in the app spells it `Pokémon`; these two are the only ones without the accent. |

More will be added here as extraction continues — in particular the
`text-transform: capitalize` defects on Pokémon names (`Mr-Mime`, `Farfetchd`,
`Nidoran-F`, `Type-Null`), which are a Phase 2 item.

## Phase 2 — Pokémon name display

The name catalogs are generated and tested, but the tile still renders the
English slug through `displayName()`. Switching it over changes what English
users see, so it is parked here.

**1. Correct spellings (pure fixes).** `displayName` returns the raw slug and
CSS `capitalize` styles it, which mangles anything with punctuation:

| Currently shows | Would show |
|---|---|
| `Mr-Mime` | `Mr. Mime` |
| `Farfetchd` | `Farfetch'd` |
| `Nidoran-F` / `Nidoran-M` | `Nidoran♀` / `Nidoran♂` |
| `Type-Null` | `Type: Null` |
| `Ho-Oh` | `Ho-Oh` (unchanged) |
| `Flabebe` | `Flabébé` |

**2. Alt-form labels (a real design change).** Today regional forms are
abbreviated into the name: `raichu-A`, `tauros-P-combat`, `alcremie-clovr`.
That surgery is English-width-specific and cannot survive translation. The
generated data supports instead showing the species name plus a separate form
descriptor — `Raichu` + `Alolan Form`, `ライチュウ` + `アローラのすがた` — which
is how the games present them in every language.

This needs a layout decision (a second line, a chip, or a tooltip on a
still-abbreviated name), so it is a design call rather than a translation one.
Nothing has been changed.
