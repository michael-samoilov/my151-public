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
| Purple Kecleon (Mystery Dungeon) | Gen 3 Kecleon family | No matching Gen 5-style front sprite verified. |
| Ukulele Pichu | Gen 4 Pichu family | Confirmed by Michael 2026-09-30. Pokémon Ranger: Guardian Signs design. No matching Gen 5-style front sprite verified in the searched source. |
| Mega Darkrai eye form | Gen 4 Darkrai gimmick family | The existing Mega Darkrai sprite is present; no distinct matching eye-form sprite verified. |
| Pecharunt Shell | Gen 9 Pecharunt family | No distinct matching sprite verified. |
| Gholdengo without surfboard | Gen 9 Gholdengo family | Confirmed by Michael 2026-09-30. Ordinary standing Gholdengo; a pose replacement for id 1000, not a new form. Current Smogon Gen 5 art still has the board. Smooth standing art is a rejected pose reference. |
| Koraidon ride builds (Sprinting, Swimming, Gliding) | Gen 9 Koraidon family | Requested 2026-09-30. No separately named Gen 5 front sprite found for these ride builds in the current Smogon source. |
| Miraidon ride modes (Drive, Aquatic, Glide) | Gen 9 Miraidon family | Requested 2026-09-30. No separately named Gen 5 front sprite found for these ride builds in the current Smogon source. |

Michael confirmed Ukulele Pichu and ordinary Gholdengo without the surfboard on 2026-09-30.

## Imported on 2026-10-17 (release candidate)

The exact KingOfThe-X-Roads originals are native 96×96 PNGs. All four preserve the artist's canvas and bytes. [Originals and provenance](favorite-picker-work/sprites/2026-10-17-king-originals/originals.json) record the source pages, hashes, dimensions, transparency, and ink bounds.

| Appearance | Picker ID | Placement and source |
| --- | --- | --- |
| Smearguru | 11117 | Smeargle appearance in Normal × IX, debut Pokopia, with compact S and full label “Smeargle (Smearguru)”. https://sta.sh/0qi9vfww1kg |
| Koraidon Limited Build | 11118 | After Koraidon in Fighting/Dragon × IX and Legendary pools. https://sta.sh/01ppvyo9gx1l |
| Miraidon Low-Power Mode | 11119 | After Miraidon in Electric/Dragon × IX and Legendary pools. https://sta.sh/0p5wp0lgq01 |
| Mega Raichu X | 10304 | Replaces existing shared Picker/League art with a cache revision. Identity stays 10304. https://sta.sh/03id19f0dha |

King's direct-upload credit lists 13 sprites. Mega Raichu Y keeps its Generation 9 Resource Pack credit. The three additions stay out of the main Pokédex evolution catalog. Production release status belongs in [the picker handoff](favorite-picker-handoff.md).

## Added on 2026-10-12

Michael chose these sprites from the sprite lab's locked selections (`sprite-lab/selections/`). They are copied without pixel edits. These forms are included in production baseline `6405eb76`.

| Form | Picker id | Placement and note |
| --- | --- | --- |
| Furfrou Heart, Star, Diamond, Debutante, Matron, Dandy, La Reine, Kabuki, and Pharaoh trims | 11096–11104 | `alternateForms.ts`, in game order, right after Furfrou in Normal × VI. Base Furfrou (676) takes the same pack's Natural Form, so all ten Furfrou sprites have one source. |
| Reshiram Overdrive and Zekrom Overdrive | 11105, 11106 | `alternateForms.ts`, beside each owner in its type × Gen V cells and Legendary × Gen V. Kept out of the League builder as battle states. |
| Black Kyurem Overdrive and White Kyurem Overdrive | 11107, 11108 | `alternateForms.ts`, owned by Kyurem (646). The Kyurem line reads Kyurem, Black Kyurem, its Overdrive, White Kyurem, its Overdrive. |
| Solgaleo Radiant Sun phase, Lunala Full Moon phase, and Marshadow Zenith | 11109–11111 | `alternateForms.ts`, beside each owner in its Gen VII cells. |
| DJ Rotom | 11112 | `alternateForms.ts`, Generation IX: it debuted in Pokémon Pokopia (2026). It sorts last in Electric × IX and Ghost × IX. |
| Mega Zygarde | 10301 | `src/league/data/powerupForms.json`, not a picker-only form. Its label is unique to Zygarde, and `npm run league:powerups` dropped it only because PokeAPI has no sprite. With the local sprite in place, the harvester keeps it, so the League builder also gets a Mega button on Zygarde. |
| Ogerpon Teal, Wellspring, Hearthflame, and Cornerstone Mask Terastal | 11113–11116 | `alternateForms.ts` and `TERASTAL_FORM_IDS`. In each type × Gen IX cell and Legendary cell, each follows its mask; in the Gimmick cells, they sort before Terapagos's Terastal forms. Kept out of the League builder as battle forms. Sprites by KingOfThe-X-Roads (`sprite-lab/inputs/kingofthe-x-roads/`), not from the locked selections. |

Overdrive, the two phases, Zenith, and DJ Rotom have no official name in any language. Every locale shows the same English descriptor, with `english-only` provenance in the name catalogs.

No game names the Terastal Ogerpon forms. Each locale joins two official names, the mask and Terapagos's Terastal Form, with `official-composed` provenance. The tooltip reads "Ogerpon (Wellspring Mask, Terastal Form)" and the compact code is WM T: the mask's code, then Terapagos's T. Black and White Kyurem Overdrive read B O and W O by the same rule.

Every new form follows production's name format (#203): a compact code from `scripts/i18n/compact-form-labels.ts` and a full tooltip name from `src/i18n/fullPokemonName.ts`. Mega Zygarde reads "Mega Zygarde" (M), as production's other Megas do: the tile shows the species and M, and the tooltip names the Mega. The other qualifiers take parentheses, such as "Furfrou (Heart Trim)" (H) and "Rotom (DJ)" (DJ: Michael kept the abbreviation whole on 2026-10-12).

Female Mega Meowstic (10326) is not added. Michael decided on 2026-10-12: PokéAPI's official artwork and HOME render for the male and female Mega are pixel-identical, so a female tile would duplicate the male one. The male Mega (10314) keeps its PokéAPI sprite.

Base Furfrou (676) changed on 2026-10-12, by Michael's rules of that day: one artist per species when avoidable, and Smogon has no trim sprites. The new file is the pack's `FURFROU.png` at 1x (every second pixel of the 192x192 file), placed as `sprite-lab/src/chooser/missing.py` placed the trims: centered on the old sprite's ink and on its bottom edge. A rerun of `missing.py` reads the new 676.png, whose ink center sits half a pixel left, so it would place three trims (Heart, Diamond, and Kabuki) 1 px further left. Keep the committed trim files.

Michael decided on 2026-10-12 that every Ogerpon sprite comes from one artist, KingOfThe-X-Roads. The four masks (1017 and 10273–10275) also use his own uploads, in his own placement.

## Pokopia candidates

Requested by Michael on 2026-10-06. Sprite sources and picker placement have not been researched. These candidates need distinct, verified Gen 5-style front sprites before they can enter the selector.

| Wanted character | Status / note |
| --- | --- |
| Professor Tangrowth | Sprite search pending. |
| Mosslax | Sprite search pending. |
| Tinkmaster Tinkaton | Sprite search pending. |
| Peakychu | Sprite search pending. |
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

## Research

Search terms, candidate comparisons, and source provenance are recorded in [sprite review research](favorite-picker-work/sprites/README.md). The searched Smogon archive does not contain separately named front sprites for the remaining missing variants; this does not establish that none exist elsewhere. Shared sprites and selectable forms remain unchanged.
