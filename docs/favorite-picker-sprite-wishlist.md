# Favorite picker: wanted pixel sprites

This is a running queue of forms we would add **if we can verify a distinct front sprite in the app's Gen 5-style pixel-art treatment**. A form stays out of the selector until its art is identified and visually checked; an unrelated render, recolored base form, or duplicate sprite is not a substitute. Update this file when a source is found or a form ships.

Checked 2026-09-23 against the [Pokémon Showdown Gen 5 front-sprite index](https://play.pokemonshowdown.com/sprites/gen5/). That index has none of the named variants below. This does not prove no fan-made sprite exists elsewhere.

| Wanted form | Intended picker placement | Status / note |
| --- | --- | --- |
| Reshiram Overdrive | Gen 5 legendary | No separately named matching sprite verified. The regular Reshiram sprite is already present. |
| Zekrom Overdrive | Gen 5 legendary | No separately named matching sprite verified. The regular Zekrom sprite is already present. |
| Primal Dialga | Gen 4 legendary | No matching sprite verified. Keep separate from Origin Dialga. |
| Shadow Lugia (XD001) | Gen 3 legendary | No matching Gen 5-style front sprite verified. |
| Meta Groudon (Jirachi: Wish Maker) | Gen 3 legendary | No matching sprite verified; do not confuse with Primal Groudon. |
| Shadow Mewtwo | Mewtwo's Gen 1 legendary family | No matching sprite verified. Identify the specific Shadow Mewtwo design before adding. |
| Armored Mewtwo | Mewtwo's Gen 1 legendary family | No matching sprite verified. |
| Zygarde Cell | Gen 6 Zygarde family | No matching battle-style sprite verified. |
| Zygarde Core | Gen 6 Zygarde family | No matching battle-style sprite verified. |
| Ogerpon Terastal mask variants | Gen 9 legendary / gimmick | Excluded: available artwork did not match the Gen 5-style pixel treatment. |
| Koraidon Limited Build | Gen 9 Koraidon family | No distinct matching sprite verified. |
| Miraidon Low-Power Mode | Gen 9 Miraidon family | No distinct matching sprite verified. |

When adding one: verify the source and visual style, save the sprite under `public/sprites/pokemon/`, register a unique picker-only form in `src/favorites/model/alternateForms.ts`, add eligibility/order tests, and remove or update its row here. Keep new forms out of the main dex-browser evolution counts.
