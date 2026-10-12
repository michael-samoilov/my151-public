# Favorite picker: wanted pixel sprites

This is a running queue of forms we would add **if we can verify a distinct front sprite in the app's Gen 5-style pixel-art treatment**. A form stays out of the selector until its art is identified and visually checked; an unrelated render, recolored base form, or duplicate sprite is not a substitute. Update this file when a source is found or a form ships.

Checked 2026-09-23 against the [Pokémon Showdown Gen 5 front-sprite index](https://play.pokemonshowdown.com/sprites/gen5/). That index has none of the named variants below. This does not prove no fan-made sprite exists elsewhere.

| Wanted form | Intended picker placement | Status / note |
| --- | --- | --- |
| Primal Dialga | Gen 4 legendary | No matching sprite verified. Keep separate from Origin Dialga. |
| Shadow Lugia (XD001) | Gen 3 legendary | No matching Gen 5-style front sprite verified. |
| Meta Groudon (Jirachi: Wish Maker) | Gen 3 legendary | No matching sprite verified; do not confuse with Primal Groudon. |
| Shadow Mewtwo | Mewtwo's Gen 1 legendary family | No matching sprite verified. Identify the specific Shadow Mewtwo design before adding. |
| Armored Mewtwo | Mewtwo's Gen 1 legendary family | No matching sprite verified. |
| Zygarde Cell | Gen 6 Zygarde family | No matching battle-style sprite verified. |
| Zygarde Core | Gen 6 Zygarde family | No matching battle-style sprite verified. |
| Ogerpon Terastal mask variants | Gen 9 legendary / gimmick | Prior artwork was rejected. Four newer Gen 5 source candidates found 2026-09-30; preview-only checklist shows them. No form registered. |
| Koraidon Limited Build | Gen 9 Koraidon family | No distinct matching sprite verified. |
| Miraidon Low-Power Mode | Gen 9 Miraidon family | No distinct matching sprite verified. |
| Purple Kecleon (Mystery Dungeon) | Gen 3 Kecleon family | No matching Gen 5-style front sprite verified. |
| Ukulele Pichu | Gen 4 Pichu family | Confirmed by Michael 2026-09-30. Pokémon Ranger: Guardian Signs design. No matching Gen 5-style front sprite verified in the searched source. |
| Mega Darkrai eye form | Gen 4 Darkrai gimmick family | The existing Mega Darkrai sprite is present; no distinct matching eye-form sprite verified. |
| Pecharunt Shell | Gen 9 Pecharunt family | No distinct matching sprite verified. |
| Gholdengo without surfboard | Gen 9 Gholdengo family | Confirmed by Michael 2026-09-30. Ordinary standing Gholdengo; a pose replacement for id 1000, not a new form. Current Smogon Gen 5 art still has the board. Smooth standing art is a rejected pose reference. |
| Koraidon ride builds (Sprinting, Swimming, Gliding) | Gen 9 Koraidon family | Requested 2026-09-30. No separately named Gen 5 front sprite found for these ride builds in the current Smogon source. |
| Miraidon ride modes (Drive, Aquatic, Glide) | Gen 9 Miraidon family | Requested 2026-09-30. No separately named Gen 5 front sprite found for these ride builds in the current Smogon source. |

Michael confirmed Ukulele Pichu and ordinary Gholdengo without the surfboard on 2026-09-30.

## Added on 2026-10-12

Michael chose these sprites from the sprite lab's locked selections (`sprite-lab/selections/`). They are copied without pixel edits. The forms are on the preview branch `claude/new-forms` until Michael ships them.

| Form | Picker id | Placement and note |
| --- | --- | --- |
| Furfrou Heart, Star, Diamond, Debutante, Matron, Dandy, La Reine, Kabuki, and Pharaoh trims | 11096–11104 | `alternateForms.ts`, in game order, right after Furfrou in Normal × VI. |
| Reshiram Overdrive and Zekrom Overdrive | 11105, 11106 | `alternateForms.ts`, beside each owner in its type × Gen V cells and Legendary × Gen V. Kept out of the League builder as battle states. |
| Black Kyurem Overdrive and White Kyurem Overdrive | 11107, 11108 | `alternateForms.ts`, owned by Kyurem (646). The Kyurem line reads Kyurem, Black Kyurem, its Overdrive, White Kyurem, its Overdrive. |
| Solgaleo Radiant Sun phase, Lunala Full Moon phase, and Marshadow Zenith | 11109–11111 | `alternateForms.ts`, beside each owner in its Gen VII cells. |
| DJ Rotom | 11112 | `alternateForms.ts`, Generation IX: it debuted in Pokémon Pokopia (2026). It sorts last in Electric × IX and Ghost × IX. |
| Mega Zygarde | 10301 | `src/league/data/powerupForms.json`, not a picker-only form. Its label is unique to Zygarde, and `npm run league:powerups` dropped it only because PokeAPI has no sprite. With the local sprite in place, the harvester keeps it, so the League builder also gets a Mega button on Zygarde. |
| Female Mega Meowstic | 10326 | Picker-only `source: 'powerup'` form in `alternateForms.ts`. The harvester keeps one Mega per label, and this one shares "Mega Meowstic" with the male Mega (10314). PokeAPI's own 10326 is a pixel copy of the male, so the app ships its own file. In the League builder, female Meowstic (10025) gets this Mega. |

Overdrive, the two phases, Zenith, and DJ Rotom have no official name in any language. Every locale shows the same English descriptor, with `english-only` provenance in the name catalogs.

## Pokopia candidates

Requested by Michael on 2026-10-06. Sprite sources and picker placement have not been researched. These candidates need distinct, verified Gen 5-style front sprites before they can enter the selector.

| Wanted character | Status / note |
| --- | --- |
| Professor Tangrowth | Sprite search pending. |
| Mosslax | Sprite search pending. |
| Tinkmaster Tinkaton | Sprite search pending. |
| Peakychu | Sprite search pending. |
| Smearguru | Sprite search pending. |
| Chef Dente Greedent | Sprite search pending. |

## Sprites to replace

These forms are in the picker, but Michael (2026-09-30) finds their sprites poor. He has seen Gen 5-style versions elsewhere and will share details. Find the candidates, and show them to him side by side with the current sprite before you replace a file.

| Form | Picker id | Note |
| --- | --- | --- |
| Mega Sceptile | 10065 (`src/league/data/powerupForms.json`) | Candidate from current Smogon Gen 5 source found 2026-09-30; review before replacing shared art. |
| Gigantamax Blastoise | 10197 (`src/league/data/powerupForms.json`) | Candidate from current Smogon Gen 5 source found 2026-09-30; review before replacing shared art. |
| Terapagos Stellar Form | 10277 (`src/favorites/model/alternateForms.ts`) | Current Smogon Gen 5 source is pixel-identical to the existing art. Continue searching for a distinct alternative. |

The sprite file is `public/sprites/pokemon/<id>.png`. Mega and Gigantamax sprites are shared with the league builder, so a replacement changes that tool too. A replaced file keeps its name, and browsers cache sprites for a year, so also add its entry to `src/data/spriteRevisions.json`. `node scripts/check-sprite-revisions.mjs` prints the entry and fails until it is there. After a replacement, rerun the sprite ink measure (`scripts/build-favorite-sprite-ink.mjs`) and commit only the changed `spriteInk.json` entries. More forms to come from Michael.

When adding one: verify the source and visual style, save the sprite under `public/sprites/pokemon/`, register a unique picker-only form in `src/favorites/model/alternateForms.ts`, add eligibility/order tests, and remove or update its row here. Keep new forms out of the main dex-browser evolution counts.

## Research and phone checklist

Open `/favorite-pokemon-by-type?spritecheck=1` on a work-branch preview. Search terms, candidate comparisons, and source provenance are recorded in [sprite review research](favorite-picker-work/sprites/README.md). The searched Smogon archive does not contain separately named front sprites for the remaining missing variants; this does not establish that none exist elsewhere. Shared sprites and selectable forms remain unchanged.
