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
