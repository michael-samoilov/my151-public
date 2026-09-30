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
| Purple Kecleon (Mystery Dungeon) | Gen 3 Kecleon family | No matching Gen 5-style front sprite verified. |
| Ukulele Pichu | Gen 4 Pichu family | No matching Gen 5-style front sprite verified. |
| Mega Darkrai eye form | Gen 4 Darkrai gimmick family | The existing Mega Darkrai sprite is present; no distinct matching eye-form sprite verified. |
| Kyurem Black Overdrive | Gen 5 Kyurem family | No distinct matching sprite verified. |
| Kyurem White Overdrive | Gen 5 Kyurem family | No distinct matching sprite verified. |
| Furfrou Dandy, Debutante, Diamond, Heart, Kabuki, La Reine, Matron, Pharaoh, and Star trims | Gen 6 Furfrou family | Available trim files were rejected after visual review: they do not consistently match the app's Gen 5-style pixel art. None are selectable. |
| Marshadow Zenith | Gen 7 Marshadow family | No distinct matching sprite verified. |
| Pecharunt Shell | Gen 9 Pecharunt family | No distinct matching sprite verified. |
| Surfing Gholdengo | Gen 9 Gholdengo family | No distinct matching sprite verified. Michael (2026-09-30) asked for "non-surfboard Gholdengo", so confirm with him which form this row means. |
| Solgaleo Radiant Sun phase | Gen 7 legendary | Added 2026-09-30 (Michael). Not yet searched. |
| Lunala Full Moon phase | Gen 7 legendary | Added 2026-09-30 (Michael). Not yet searched. |
| Koraidon ride builds (Sprinting, Swimming, Gliding) | Gen 9 Koraidon family | Added 2026-09-30: Michael asked for the "bicycle" forms. Not yet searched. |
| Miraidon ride modes (Drive, Aquatic, Glide) | Gen 9 Miraidon family | Added 2026-09-30: Michael asked for the "bicycle" forms. Not yet searched. |

Michael called the Pichu form "banjo Pichu" on 2026-09-30; the row above says Ukulele Pichu. Confirm which one he means before you add it.

## Sprites to replace

These forms are in the picker, but Michael (2026-09-30) finds their sprites poor. He has seen Gen 5-style versions elsewhere and will share details. Find the candidates, and show them to him side by side with the current sprite before you replace a file.

| Form | Picker id | Note |
| --- | --- | --- |
| Mega Sceptile | 10065 (`src/league/data/powerupForms.json`) | Michael will name the source. |
| Gigantamax Blastoise | 10197 (`src/league/data/powerupForms.json`) | Michael will name the source. |
| Terapagos Stellar Form | 10277 (`src/favorites/model/alternateForms.ts`) | Michael will name the source. |

The sprite file is `public/sprites/pokemon/<id>.png`. Mega and Gigantamax sprites are shared with the league builder, so a replacement changes that tool too. After a replacement, rerun the sprite ink measure (`scripts/build-favorite-sprite-ink.mjs`) and commit only the changed `spriteInk.json` entries. More forms to come from Michael.

When adding one: verify the source and visual style, save the sprite under `public/sprites/pokemon/`, register a unique picker-only form in `src/favorites/model/alternateForms.ts`, add eligibility/order tests, and remove or update its row here. Keep new forms out of the main dex-browser evolution counts.
