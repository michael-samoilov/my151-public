# Sprite evidence ledger

Historical captures and commands are in this folder's Git history.

This page lists every Pokémon sprite file that my151.app can show, and the evidence for who drew each one.
The machine-readable copy is [`sprite-evidence.json`](sprite-evidence.json), one row per file.
`npm run credits:check-sprites` fails when a shown file changes without its row, or when a shown file has no row.
A lossless re-encode listed in `scripts/sprite-reencodes.json` keeps its row: the row's sha256 names the original file that the evidence describes, and the re-encode decodes to the same pixels.

Built on 2026-10-13 from production commit 8739dac6. Pages and files were read on 2026-10-13 unless a row says otherwise.

## How the evidence was gathered

1. `scripts/credits/shownSprites.ts` imports the catalogs that the pages build: the Pokédex builder data, the league builder catalog and its Mega and Gigantamax forms, the Favorite Pokémon Picker catalog, and the archetype shiny and override sprites. It also scans shipped source for literal sprite ids.
2. Each shown file was compared with every source file. An exact match means the same RGBA after the transparent margins are trimmed; fully transparent pixels count as equal whatever their colour. A 2x or 4x source matches when its exact nearest-neighbour downscale matches.
3. Sources, strongest first: a file the artist posted; the Smogon attachment on a credit-sheet row that names the artist; the Generation 9 pack file on its sheet row; a PokéAPI commit and README line that name the artist; a Game Freak sprite from PokéAPI's Black and White import.
4. A near match is reported with its mask IoU (shared opaque pixels over all opaque pixels, at the best offset) and the share of shared pixels with the same colour.

The four KingOfThe-X-Roads originals imported on 2026-10-17 are retained in `docs/favorite-picker-work/sprites/2026-10-17-king-originals/`. The two kiriaura originals imported on 2026-10-19 are retained in `docs/favorite-picker-work/sprites/2026-10-19-kiriaura-originals/`. Earlier source files are not in git. Each source in the JSON has its URL and sha256, so anyone can download it again and compare.

## Summary

| Count | What |
|---:|---|
| 1431 | Sprite files a production page can show (all of `public/sprites/pokemon`) |
| 1096 | Shown in the Pokédex builder |
| 1347 | Shown in the League builder |
| 1425 | Shown in the Favorite picker |
| 0 | Served files that no page shows |
| 0 | Shown files that are missing |
| 666 | Verdict: confirmed |
| 0 | Verdict: corrected |
| 67 | Verdict: unproven |
| 698 | Verdict: official Game Freak |

| Count | Evidence type |
|---:|---|
| 698 | Game Freak sprite: exact match to PokéAPI's Black and White import |
| 584 | Exact match to the Smogon attachment on a credit-sheet row naming the artist |
| 47 | No source names an artist |
| 45 | Byte-identical to the PokéAPI file added in the commit whose README line names the artist |
| 18 | Near match only |
| 24 | Exact match to a file the artist posted (Sta.sh upload, DeviantArt upload, or the artist's DeviantArt sheet); 2 of them carry my151's recorded pixel changes |
| 7 | Exact match to the Generation 9 pack file on its sheet row |
| 1 | Exact match to an attachment in a Smogon thread post |
| 5 | my151's own work or change, by this repository's history: two drawings, one recolor of a Game Freak sprite, two fan sprites with added items |
| 2 | Pinned source identified; individual artist unproven |

## Credit changes

- `1003.png` (ting-lu): applied on 2026-10-13. Credited before: ['KingOfThe-X-Roads', 'G.E.Z.']; credited now: ['KingOfThe-X-Roads']. Evidence: every opaque pixel equals KingOfThe-X-Roads's own DeviantArt sheet at x=684, y=498, with no stray pixel under the sprite's transparent area; the app also credits ['G.E.Z.'] from a Smogon row whose attachment is a different colouring of this drawing (Same drawing as that row's Front attachment https://www.smogon.com/forums/attachments/1003_1-png.603597/: 99.9% of opaque pixels overlap, 50% have the same colo). Source: https://www.deviantart.com/kingofthe-x-roads/art/Gen-9-Sprites---Pokemon-Scarlet-and-Violet-908341834

## Groups re-proven in this audit

- Kyle Dove, 43 Legends: Z-A Mega files: each is byte-identical to the file PokéAPI added in commit 4bc9d60186 (pull request 236, 2026-06-22). The same pull request (its commit aae6538) changed README line 313 to credit x.com/DoveKyle "for providing the back_default, back_shiny and z-a mega sprites for generation 9". No pixel proof against a file Kyle Dove posted: his X media needs a login here, his DeviantArt gallery has no Z-A sheet, and no Smogon sheet row or saved thread post holds these drawings. No other source drawing comes close: the best mask IoU against any Smogon attachment or pack file is 0.82, with at most 16% same colour.
- KingOfThe-X-Roads, 11 files from PokéAPI's 2023 Generation 9 commit: 5 (933, 940, 953, 954, 981) are pixel-exact in his own DeviantArt sheet "Gen 9 Sprites - Pokemon Scarlet and Violet"; 2 (945, 1012) are exact pack files on sheet rows naming him; 3 (922, 944, 949) rest on PokéAPI commit aa370b74e2, which added them and README line 312 crediting him; 1 (1023, Iron Crown) is unproven.
- The files credited to a project with no named artist (PokéAPI 11, Generation 9 pack 10) stay without an artist: no sheet row, post, or commit names one.
- Near matches: thread attachments for the near-matched Pokémon were downloaded and compared. Pikipek (731) now matches princessofmusic's own post exactly. Seven others match posts by people who are not credited (animators or reposts), which is not taken as authorship.

## Limits

- KingOfThe-X-Roads's 6572x5604 "ALL Pokemon sprites" sheet was searched only for 922, 944, 949, 1023, and 11112, because a full search takes hours. 944 appears there with 361 extra opaque pixels, so not as this exact file.
- The 24 Generation 4-5 forms (10001-10024) match PokéAPI files that came in its Smogon-update commit b629bcf, not in the Black and White import. Their outlines equal the original animations, but their colours differ, so they are listed as unproven, with no credit change.
- Smogon reset parallel downloads once during this audit; all downloads after that ran one at a time.

## Unproven rows

Each row keeps its current credit (or none). The reason says what was compared and what is missing.

| File | Pokémon | Credited now | Reason |
|---|---|---|---|
| `668.png` | pyroar | (none) | closest Smogon attachment 668m-png.282237 (sheet row '668 Pyroar-male', Spriter 'Arkeis (front), Layell (back)'): mask IoU 0.8363, same colour on 0% of shared pixels; closest pack file Front/PYROAR.png: mask IoU 0.8363, same colour on 0% of shared pixels; byte-identical to PokéAPI sprites/pokemon/versions/generation-v/black-white/668.png from commit b629bcff50 (2021-03-15), which names no artist |
| `669.png` | flabebe | (none) | closest Smogon attachment 669_1-png.276624 (sheet row '669 Flabébé-red', Spriter 'TheCynicalPoet, princessofmusic (colours)'): mask IoU 0.6299, same colour on 2% of shared pixels; closest Smogon attachment 669_2-png.276628 (sheet row '669 Flabébé-yellow', Spriter 'TheCynicalPoet, princessofmusic (colours)'): mask IoU 0.6299, same colour on 2% of shared pixels; byte-identical to PokéAPI sprites/pokemon/lowres/669-red.png from commit 8034a5f31e (2024-11-08), which names no artist |
| `670.png` | floette | (none) | closest Smogon attachment 670_1-png.276644 (sheet row '670 Floette-red', Spriter 'princessofmusic'): mask IoU 0.5433, same colour on 5% of shared pixels; closest Smogon attachment 670_2-png.276648 (sheet row '670 Floette-yellow', Spriter 'princessofmusic'): mask IoU 0.5433, same colour on 5% of shared pixels; byte-identical to PokéAPI sprites/pokemon/lowres/670-red.png from commit 8034a5f31e (2024-11-08), which names no artist |
| `671.png` | florges | (none) | closest Smogon attachment 671_5-png.276684 (sheet row '671 Florges-white', Spriter 'princessofmusic'): mask IoU 0.6496, same colour on 6% of shared pixels; closest pack file Front/FLORGES_4.png: mask IoU 0.6496, same colour on 6% of shared pixels; byte-identical to PokéAPI sprites/pokemon/lowres/671-red.png from commit 8034a5f31e (2024-11-08), which names no artist |
| `676.png` | furfrou | (none) | exact pixel match to Generation 9 pack file Front/FURFROU.png (1/2 scale), but the pack sheet has no row for it and Credits.txt credits Generations 6-8 to the Smogon projects as a whole |
| `698.png` | amaura | Falgaia | exact pixel match to attachment 698-png.290763, posted by leParagon (post 8654688), who is not credited; the post may be an animation, a revision, or a repost, so it is not taken as authorship; exact pixel match to attachment 698-gif.369438, posted by Antiant (post 8965429), who is not credited; the post may be an animation, a revision, or a repost, so it is not taken as authorship; exact pixel match to Generation 9 pack file Front/AMAURA.png (1/2 scale), but the pack sheet has no row for it and Credits.txt credits Generations 6-8 to the Smogon projects as a whole; closest Smogon attachment 698-png.492515 (sheet row '698 Amaura', Spriter 'aXl, leParagon (back)'): mask IoU 0.9429, same colour on 97% of shared pixels; byte-identical to PokéAPI sprites/pokemon/versions/generation-v/black-white/698.png from commit b629bcff50 (2021-03-15), which names no artist. Kept credit comes from the record's sheet row '698 Amaura' (Spriter 'aXl, leParagon (back)') |
| `716.png` | xerneas | N-Kin | closest Smogon attachment 716_1-png.273690 (sheet row '716 Xerneas', Spriter 'N-Kin'): mask IoU 0.9992, same colour on 11% of shared pixels; closest Smogon attachment 716_2-png.274485 (sheet row '716 Xerneas-inactive', Spriter 'N-Kin, leParagon, G.E.Z. (Back)'): mask IoU 0.9319, same colour on 12% of shared pixels; byte-identical to PokéAPI sprites/pokemon/lowres/716-active.png from commit 8034a5f31e (2024-11-08), which names no artist. Kept credit comes from the record's sheet row '716 Xerneas' (Spriter 'N-Kin') |
| `733.png` | toucannon | (none) | exact pixel match to Generation 9 pack file Front/TOUCANNON.png (1/2 scale), but the pack sheet has no row for it and Credits.txt credits Generations 6-8 to the Smogon projects as a whole; byte-identical to PokéAPI sprites/pokemon/versions/generation-v/black-white/733.png from commit b629bcff50 (2021-03-15), which names no artist |
| `736.png` | grubbin | Wobblebuns | exact pixel match to Generation 9 pack file Front/GRUBBIN.png (1/2 scale), but the pack sheet has no row for it and Credits.txt credits Generations 6-8 to the Smogon projects as a whole; byte-identical to PokéAPI sprites/pokemon/versions/generation-v/black-white/736.png from commit b629bcff50 (2021-03-15), which names no artist. Kept credit comes from the record's sheet row '736 Grubbin' (Spriter 'Wobblebuns') |
| `743.png` | ribombee | (none) | exact pixel match to Generation 9 pack file Front/RIBOMBEE.png (1/2 scale), but the pack sheet has no row for it and Credits.txt credits Generations 6-8 to the Smogon projects as a whole; byte-identical to PokéAPI sprites/pokemon/versions/generation-v/black-white/10150.png from commit 0744010d8d (2026-09-07), which names no artist |
| `747.png` | mareanie | leParagon, fishbowlsoul90 | exact pixel match to Generation 9 pack file Front/MAREANIE.png (1/2 scale), but the pack sheet has no row for it and Credits.txt credits Generations 6-8 to the Smogon projects as a whole; closest Smogon attachment 825-png.212832 (sheet row '825 Dottler', Spriter 'KingOfThe-X-Roads, leParagon (back)'): mask IoU 0.7726, same colour on 2% of shared pixels; byte-identical to PokéAPI sprites/pokemon/versions/generation-v/black-white/747.png from commit b629bcff50 (2021-03-15), which names no artist. Kept credit comes from the record's sheet row '747 Mareanie' (Spriter 'leParagon, fishbowlsoul90') |
| `760.png` | bewear | (none) | exact pixel match to Generation 9 pack file Front/BEWEAR.png (1/2 scale), but the pack sheet has no row for it and Credits.txt credits Generations 6-8 to the Smogon projects as a whole; byte-identical to PokéAPI sprites/pokemon/versions/generation-v/black-white/760.png from commit b629bcff50 (2021-03-15), which names no artist |
| `764.png` | comfey | (none) | exact pixel match to Generation 9 pack file Front/COMFEY.png (1/2 scale), but the pack sheet has no row for it and Credits.txt credits Generations 6-8 to the Smogon projects as a whole; byte-identical to PokéAPI sprites/pokemon/versions/generation-v/black-white/764.png from commit b629bcff50 (2021-03-15), which names no artist |
| `769.png` | sandygast | princessofmusic | exact pixel match to attachment 769-gif.171353, posted by MallowOut (post 8104144), who is not credited; the post may be an animation, a revision, or a repost, so it is not taken as authorship; exact pixel match to Generation 9 pack file Front/SANDYGAST.png (1/2 scale), but the pack sheet has no row for it and Credits.txt credits Generations 6-8 to the Smogon projects as a whole; byte-identical to PokéAPI sprites/pokemon/versions/generation-v/black-white/769.png from commit b629bcff50 (2021-03-15), which names no artist. Kept credit comes from the record's sheet row '769 Sandygast' (Spriter 'princessofmusic') |
| `770.png` | palossand | princessofmusic | exact pixel match to attachment 770-gif.477149, posted by arinoelle (post 9442492), who is not credited; the post may be an animation, a revision, or a repost, so it is not taken as authorship; exact pixel match to Generation 9 pack file Front/PALOSSAND.png (1/2 scale), but the pack sheet has no row for it and Credits.txt credits Generations 6-8 to the Smogon projects as a whole; closest Smogon attachment 844_1-png.212845 (sheet row '844 Sandaconda', Spriter 'KingOfThe-X-Roads, leParagon (back)'): mask IoU 0.6938, same colour on 2% of shared pixels; byte-identical to PokéAPI sprites/pokemon/versions/generation-v/black-white/770.png from commit b629bcff50 (2021-03-15), which names no artist. Kept credit comes from the record's sheet row '770 Palossand' (Spriter 'princessofmusic') |
| `771.png` | pyukumuku | princessofmusic | exact pixel match to attachment 771-gif.302336, posted by leParagon (post 8696190), who is not credited; the post may be an animation, a revision, or a repost, so it is not taken as authorship; exact pixel match to Generation 9 pack file Front/PYUKUMUKU.png (1/2 scale), but the pack sheet has no row for it and Credits.txt credits Generations 6-8 to the Smogon projects as a whole; byte-identical to PokéAPI sprites/pokemon/versions/generation-v/black-white/771.png from commit b629bcff50 (2021-03-15), which names no artist. Kept credit comes from the record's sheet row '771 Pyukumuku' (Spriter 'princessofmusic') |
| `777.png` | togedemaru | Espeon Scientist | exact pixel match to attachment 777-gif.369409, posted by Antiant (post 8965416), who is not credited; the post may be an animation, a revision, or a repost, so it is not taken as authorship; exact pixel match to Generation 9 pack file Front/TOGEDEMARU.png (1/2 scale), but the pack sheet has no row for it and Credits.txt credits Generations 6-8 to the Smogon projects as a whole; closest Smogon attachment 665-png.273579 (sheet row '665 Spewpa', Spriter 'leParagon, TheAetherPlayer (shiny)'): mask IoU 0.6843, same colour on 26% of shared pixels; byte-identical to PokéAPI sprites/pokemon/versions/generation-v/black-white/10154.png from commit 0744010d8d (2026-09-07), which names no artist. Kept credit comes from the record's sheet row '777 Togedemaru' (Spriter 'Espeon Scientist') |
| `789.png` | cosmog | (none) | exact pixel match to Generation 9 pack file Front/COSMOG.png (1/2 scale), but the pack sheet has no row for it and Credits.txt credits Generations 6-8 to the Smogon projects as a whole; byte-identical to PokéAPI sprites/pokemon/versions/generation-v/black-white/789.png from commit b629bcff50 (2021-03-15), which names no artist |
| `823.png` | corviknight | leParagon | exact pixel match to Generation 9 pack file Front/CORVIKNIGHT.png (1/2 scale), but the pack sheet has no row for it and Credits.txt credits Generations 6-8 to the Smogon projects as a whole; closest Smogon attachment 823_1-png.206456 (sheet row '823 Corviknight', Spriter 'leParagon'): mask IoU 1.0, same colour on 88% of shared pixels; byte-identical to PokéAPI sprites/pokemon/versions/generation-v/black-white/823.png from commit e29ed592d5 (2020-09-28), which names no artist. Kept credit comes from the record's sheet row '823 Corviknight' (Spriter 'leParagon') |
| `875.png` | eiscue | KingOfThe-X-Roads | exact pixel match to attachment 875_1-gif.641539, posted by uppa (post 10157418), who is not credited; the post may be an animation, a revision, or a repost, so it is not taken as authorship; exact pixel match to attachment 875_1-gif.290778, posted by leParagon (post 8654690), who is not credited; the post may be an animation, a revision, or a repost, so it is not taken as authorship; exact pixel match to Generation 9 pack file Front/EISCUE.png (1/2 scale), but the pack sheet has no row for it and Credits.txt credits Generations 6-8 to the Smogon projects as a whole; closest Smogon attachment 875_1-png.212859 (sheet row '875 Eiscue-ice face', Spriter 'KingOfThe-X-Roads, TheAetherPlayer (shiny), leParagon (back)'): mask IoU 0.9996, same colour on 100% of shared pixels; byte-identical to PokéAPI sprites/pokemon/versions/generation-v/black-white/875.png from commit e29ed592d5 (2020-09-28), which names no artist. Kept credit comes from the record's sheet row '875 Eiscue-ice face' (Spriter 'KingOfThe-X-Roads, TheAetherPlayer (shiny), leParagon (back)') |
| `877.png` | morpeko | leParagon | exact pixel match to Generation 9 pack file Front/MORPEKO.png (1/2 scale), but the pack sheet has no row for it and Credits.txt credits Generations 6-8 to the Smogon projects as a whole; closest Smogon attachment 877_1-png.206485 (sheet row '877 Morpeko-full belly', Spriter 'leParagon, TheAetherPlayer (shiny)'): mask IoU 1.0, same colour on 99% of shared pixels; byte-identical to PokéAPI sprites/pokemon/versions/generation-v/black-white/877.png from commit e29ed592d5 (2020-09-28), which names no artist. Kept credit comes from the record's sheet row '877 Morpeko-full belly' (Spriter 'leParagon, TheAetherPlayer (shiny)') |
| `1023.png` | iron-crown | KingOfThe-X-Roads | closest pack file Front/IRONCROWN.png: mask IoU 1.0, same colour on 9% of shared pixels; closest pack file Front/COBALION.png: mask IoU 0.6597, same colour on 0% of shared pixels; byte-identical to PokéAPI sprites/pokemon/versions/generation-v/black-white/1023.png from commit 46a3da86e0 (2026-03-12), which names no artist |
| `10001.png` | deoxys-attack | (none) | exact pixel match to PokéAPI sprites/pokemon/versions/generation-v/black-white/10001.png, but PokéAPI added that file in b629bcf ("feat: update gen-v folder with the new Smogon sprites"), and its README calls files above ID 650 in that folder not official. |
| `10002.png` | deoxys-defense | (none) | exact pixel match to PokéAPI sprites/pokemon/versions/generation-v/black-white/10002.png, but PokéAPI added that file in b629bcf ("feat: update gen-v folder with the new Smogon sprites"), and its README calls files above ID 650 in that folder not official. |
| `10003.png` | deoxys-speed | (none) | exact pixel match to PokéAPI sprites/pokemon/versions/generation-v/black-white/10003.png, but PokéAPI added that file in b629bcf ("feat: update gen-v folder with the new Smogon sprites"), and its README calls files above ID 650 in that folder not official. |
| `10004.png` | wormadam-sandy | (none) | exact pixel match to PokéAPI sprites/pokemon/versions/generation-v/black-white/10004.png, but PokéAPI added that file in b629bcf ("feat: update gen-v folder with the new Smogon sprites"), and its README calls files above ID 650 in that folder not official. |
| `10005.png` | wormadam-trash | (none) | exact pixel match to PokéAPI sprites/pokemon/versions/generation-v/black-white/10005.png, but PokéAPI added that file in b629bcf ("feat: update gen-v folder with the new Smogon sprites"), and its README calls files above ID 650 in that folder not official. |
| `10006.png` | shaymin-sky | (none) | exact pixel match to PokéAPI sprites/pokemon/versions/generation-v/black-white/10006.png, but PokéAPI added that file in b629bcf ("feat: update gen-v folder with the new Smogon sprites"), and its README calls files above ID 650 in that folder not official. |
| `10007.png` | giratina-origin | (none) | exact pixel match to PokéAPI sprites/pokemon/versions/generation-v/black-white/10007.png, but PokéAPI added that file in b629bcf ("feat: update gen-v folder with the new Smogon sprites"), and its README calls files above ID 650 in that folder not official. |
| `10008.png` | rotom-heat | (none) | exact pixel match to PokéAPI sprites/pokemon/versions/generation-v/black-white/10008.png, but PokéAPI added that file in b629bcf ("feat: update gen-v folder with the new Smogon sprites"), and its README calls files above ID 650 in that folder not official. |
| `10009.png` | rotom-wash | (none) | exact pixel match to PokéAPI sprites/pokemon/versions/generation-v/black-white/10009.png, but PokéAPI added that file in b629bcf ("feat: update gen-v folder with the new Smogon sprites"), and its README calls files above ID 650 in that folder not official. |
| `10010.png` | rotom-frost | (none) | exact pixel match to PokéAPI sprites/pokemon/versions/generation-v/black-white/10010.png, but PokéAPI added that file in b629bcf ("feat: update gen-v folder with the new Smogon sprites"), and its README calls files above ID 650 in that folder not official. |
| `10011.png` | rotom-fan | (none) | exact pixel match to PokéAPI sprites/pokemon/versions/generation-v/black-white/10011.png, but PokéAPI added that file in b629bcf ("feat: update gen-v folder with the new Smogon sprites"), and its README calls files above ID 650 in that folder not official. |
| `10012.png` | rotom-mow | (none) | exact pixel match to PokéAPI sprites/pokemon/versions/generation-v/black-white/10012.png, but PokéAPI added that file in b629bcf ("feat: update gen-v folder with the new Smogon sprites"), and its README calls files above ID 650 in that folder not official. |
| `10013.png` | castform-sunny | (none) | exact pixel match to PokéAPI sprites/pokemon/versions/generation-v/black-white/10013.png, but PokéAPI added that file in b629bcf ("feat: update gen-v folder with the new Smogon sprites"), and its README calls files above ID 650 in that folder not official. |
| `10014.png` | castform-rainy | (none) | exact pixel match to PokéAPI sprites/pokemon/versions/generation-v/black-white/10014.png, but PokéAPI added that file in b629bcf ("feat: update gen-v folder with the new Smogon sprites"), and its README calls files above ID 650 in that folder not official. |
| `10015.png` | castform-snowy | (none) | exact pixel match to PokéAPI sprites/pokemon/versions/generation-v/black-white/10015.png, but PokéAPI added that file in b629bcf ("feat: update gen-v folder with the new Smogon sprites"), and its README calls files above ID 650 in that folder not official. |
| `10016.png` | basculin-blue-striped | (none) | exact pixel match to PokéAPI sprites/pokemon/versions/generation-v/black-white/10016.png, but PokéAPI added that file in b629bcf ("feat: update gen-v folder with the new Smogon sprites"), and its README calls files above ID 650 in that folder not official. |
| `10017.png` | darmanitan (archetype 'static-encounter' art), darmanitan-zen | (none) | exact pixel match to PokéAPI sprites/pokemon/versions/generation-v/black-white/10017.png, but PokéAPI added that file in b629bcf ("feat: update gen-v folder with the new Smogon sprites"), and its README calls files above ID 650 in that folder not official. |
| `10018.png` | meloetta-pirouette | (none) | exact pixel match to PokéAPI sprites/pokemon/versions/generation-v/black-white/10018.png, but PokéAPI added that file in b629bcf ("feat: update gen-v folder with the new Smogon sprites"), and its README calls files above ID 650 in that folder not official. |
| `10019.png` | tornadus-therian | (none) | exact pixel match to PokéAPI sprites/pokemon/versions/generation-v/black-white/10019.png, but PokéAPI added that file in b629bcf ("feat: update gen-v folder with the new Smogon sprites"), and its README calls files above ID 650 in that folder not official. |
| `10020.png` | thundurus-therian | (none) | exact pixel match to PokéAPI sprites/pokemon/versions/generation-v/black-white/10020.png, but PokéAPI added that file in b629bcf ("feat: update gen-v folder with the new Smogon sprites"), and its README calls files above ID 650 in that folder not official. |
| `10021.png` | landorus-therian | (none) | exact pixel match to PokéAPI sprites/pokemon/versions/generation-v/black-white/10021.png, but PokéAPI added that file in b629bcf ("feat: update gen-v folder with the new Smogon sprites"), and its README calls files above ID 650 in that folder not official. |
| `10022.png` | kyurem-black | (none) | exact pixel match to PokéAPI sprites/pokemon/versions/generation-v/black-white/10022.png, but PokéAPI added that file in b629bcf ("feat: update gen-v folder with the new Smogon sprites"), and its README calls files above ID 650 in that folder not official. Exact pixel match to Pokémon Showdown gen5/kyurem-black.png, which names no maker. |
| `10023.png` | kyurem-white | (none) | exact pixel match to PokéAPI sprites/pokemon/versions/generation-v/black-white/10023.png, but PokéAPI added that file in b629bcf ("feat: update gen-v folder with the new Smogon sprites"), and its README calls files above ID 650 in that folder not official. Exact pixel match to Pokémon Showdown gen5/kyurem-white.png, which names no maker. |
| `10024.png` | keldeo-resolute | (none) | exact pixel match to PokéAPI sprites/pokemon/versions/generation-v/black-white/10024.png, but PokéAPI added that file in b629bcf ("feat: update gen-v folder with the new Smogon sprites"), and its README calls files above ID 650 in that folder not official. |
| `10025.png` | meowstic-female | (none) | closest Smogon attachment 678f-png.273647 (sheet row '678 Meowstic-female', Spriter 'RedRooster'): mask IoU 0.778, same colour on 0% of shared pixels; closest pack file Front/MEOWSTIC_1.png: mask IoU 0.778, same colour on 0% of shared pixels; byte-identical to PokéAPI sprites/pokemon/versions/generation-v/black-white/10025.png from commit b629bcff50 (2021-03-15), which names no artist |
| `10068.png` | Mega Gallade | (none) | exact pixel match to Generation 9 pack file Front/GALLADE_1.png (1/2 scale), but the pack sheet has no row for it and Credits.txt credits Generations 6-8 to the Smogon projects as a whole; closest Smogon attachment 323_2-png.274427 (sheet row '323 Camerupt', Spriter 'WPS, TheAetherPlayer (shiny)'): mask IoU 0.6225, same colour on 0% of shared pixels; byte-identical to PokéAPI sprites/pokemon/versions/generation-v/black-white/10068.png from commit 46a3da86e0 (2026-03-12), which names no artist |
| `10185.png` | eiscue-noice | KingOfThe-X-Roads | exact pixel match to Generation 9 pack file Front/EISCUE_1.png (1/2 scale), but the pack sheet has no row for it and Credits.txt credits Generations 6-8 to the Smogon projects as a whole; closest Smogon attachment 875_2-png.212860 (sheet row '875 Eiscue-noice face', Spriter 'KingOfThe-X-Roads, TheAetherPlayer (shiny), leParagon (back)'): mask IoU 0.9992, same colour on 100% of shared pixels; byte-identical to PokéAPI sprites/pokemon/10185.png from commit ff8ae47984 (2022-02-16), which names no artist. Kept credit comes from the record's sheet row '875 Eiscue-noice face' (Spriter 'KingOfThe-X-Roads, TheAetherPlayer (shiny), leParagon (back)') |
| `10236.png` | samurott-hisui | KingOfThe-X-Roads | closest Smogon attachment 503_1-png.450194 (sheet row '503 Samurott', Spriter 'KingOfThe-X-Roads'): mask IoU 0.998, same colour on 99% of shared pixels; closest pack file Front/SAMUROTT.png: mask IoU 0.9118, same colour on 0% of shared pixels; byte-identical to PokéAPI sprites/pokemon/versions/generation-v/black-white/10236.png from commit 46a3da86e0 (2026-03-12), which names no artist. Kept credit comes from the record's sheet row '503 Samurott' (Spriter 'KingOfThe-X-Roads') |
| `11001.png` | xerneas-neutral | N-Kin, leParagon | closest Smogon attachment 716_2-png.274485 (sheet row '716 Xerneas-inactive', Spriter 'N-Kin, leParagon, G.E.Z. (Back)'): mask IoU 0.9938, same colour on 13% of shared pixels; closest Smogon attachment 716_1-png.273690 (sheet row '716 Xerneas', Spriter 'N-Kin'): mask IoU 0.9353, same colour on 13% of shared pixels. Kept credit comes from the record's sheet row '716 Xerneas-inactive' (Spriter 'N-Kin, leParagon, G.E.Z. (Back)') |
| `11064.png` | pichu-spiky-eared | (none) | Exact pinned PokéAPI file; individual artist unproven. |
| `11071.png` | pyroar-female | (none) | Exact pinned PokéAPI file; previous artist evidence applies to the former version. |
| `11096.png` | furfrou-heart | (none) | exact pixel match to Generation 9 pack file Front/FURFROU_1.png (1/2 scale), but the pack sheet has no row for it and Credits.txt credits Generations 6-8 to the Smogon projects as a whole |
| `11097.png` | furfrou-star | (none) | exact pixel match to Generation 9 pack file Front/FURFROU_2.png (1/2 scale), but the pack sheet has no row for it and Credits.txt credits Generations 6-8 to the Smogon projects as a whole |
| `11098.png` | furfrou-diamond | (none) | exact pixel match to Generation 9 pack file Front/FURFROU_3.png (1/2 scale), but the pack sheet has no row for it and Credits.txt credits Generations 6-8 to the Smogon projects as a whole |
| `11099.png` | furfrou-debutante | (none) | exact pixel match to Generation 9 pack file Front/FURFROU_4.png (1/2 scale), but the pack sheet has no row for it and Credits.txt credits Generations 6-8 to the Smogon projects as a whole |
| `11100.png` | furfrou-matron | (none) | exact pixel match to Generation 9 pack file Front/FURFROU_5.png (1/2 scale), but the pack sheet has no row for it and Credits.txt credits Generations 6-8 to the Smogon projects as a whole |
| `11101.png` | furfrou-dandy | (none) | exact pixel match to Generation 9 pack file Front/FURFROU_6.png (1/2 scale), but the pack sheet has no row for it and Credits.txt credits Generations 6-8 to the Smogon projects as a whole |
| `11102.png` | furfrou-la-reine | (none) | exact pixel match to Generation 9 pack file Front/FURFROU_7.png (1/2 scale), but the pack sheet has no row for it and Credits.txt credits Generations 6-8 to the Smogon projects as a whole |
| `11103.png` | furfrou-kabuki | (none) | exact pixel match to Generation 9 pack file Front/FURFROU_8.png (1/2 scale), but the pack sheet has no row for it and Credits.txt credits Generations 6-8 to the Smogon projects as a whole |
| `11104.png` | furfrou-pharaoh | (none) | exact pixel match to Generation 9 pack file Front/FURFROU_9.png (1/2 scale), but the pack sheet has no row for it and Credits.txt credits Generations 6-8 to the Smogon projects as a whole |
| `11107.png` | kyurem-black-overdrive | (none) | None |
| `11108.png` | kyurem-white-overdrive | (none) | None |
| `11109.png` | solgaleo-radiant-sun | leParagon | closest Smogon attachment 791_2-png.272364 (sheet row '791 Solgaleo-radiant sun', Spriter 'leParagon'): mask IoU 0.9998, same colour on 100% of shared pixels; closest Smogon attachment 791-png.102342 (sheet row '791 Solgaleo', Spriter 'leParagon, fishbowlsoul90'): mask IoU 0.8526, same colour on 10% of shared pixels. Kept credit comes from the record's sheet row '791 Solgaleo-radiant sun' (Spriter 'leParagon') |
| `11110.png` | lunala-full-moon | leParagon | closest Smogon attachment 792_2-png.272370 (sheet row '792 Lunala-full moon', Spriter 'leParagon'): mask IoU 0.9977, same colour on 100% of shared pixels; closest pack file Front/000.png: mask IoU 0.7122, same colour on 0% of shared pixels. Kept credit comes from the record's sheet row '792 Lunala-full moon' (Spriter 'leParagon') |
| `11112.png` | rotom-dj | KingOfThe-X-Roads | KingOfThe-X-Roads's own X post: its 384x384 image is an exact 4x upscale; at 1/4 scale it has the same shape (mask IoU 1.0) and differs from the app file in 2 of 2,894 opaque pixels (colour only). The earlier research traced the app file to Ghasty001's animation frame 0, which recolours those 2 pixels; that frame was not re-downloaded in this audit; closest pack file Front/ROTOM_3.png: mask IoU 0.5303, same colour on 17% of shared pixels; closest Smogon attachment 323_2-png.274427 (sheet row '323 Camerupt', Spriter 'WPS, TheAetherPlayer (shiny)'): mask IoU 0.7038, same colour on 0% of shared pixels |

## Live recheck of cached Smogon attachments

124 attachments, up to 3 per artist whose credit rests on an exact Smogon match, were downloaded again on 2026-10-13 and compared with the cached copies: 124 have the same bytes; 0 have the same pixels with different bytes; 0 differ or failed.

## Files by artist

### Game Freak (698 files, no artist entry by the app's policy)

Every file matches PokéAPI's `sprites/pokemon/versions/generation-v/black-white/` file from commit 96c282e (2020-08-01, "Add gen-v sprite images") or a frame of an animation from commit 6c9d4ef. Files: `1.png`, `2.png`, `3.png`, `4.png`, `5.png`, `6.png`, `7.png`, `8.png`, `9.png`, `10.png`, `11.png`, `12.png`, `13.png`, `14.png`, `15.png`, `16.png`, `17.png`, `18.png`, `19.png`, `20.png`, `21.png`, `22.png`, `23.png`, `24.png`, `25.png`, `26.png`, `27.png`, `28.png`, `29.png`, `30.png`, `31.png`, `32.png`, `33.png`, `34.png`, `35.png`, `36.png`, `37.png`, `38.png`, `39.png`, `40.png`, `41.png`, `42.png`, `43.png`, `44.png`, `45.png`, `46.png`, `47.png`, `48.png`, `49.png`, `50.png`, `51.png`, `52.png`, `53.png`, `54.png`, `55.png`, `56.png`, `57.png`, `58.png`, `59.png`, `60.png`, `61.png`, `62.png`, `63.png`, `64.png`, `65.png`, `66.png`, `67.png`, `68.png`, `69.png`, `70.png`, `71.png`, `72.png`, `73.png`, `74.png`, `75.png`, `76.png`, `77.png`, `78.png`, `79.png`, `80.png`, `81.png`, `82.png`, `83.png`, `84.png`, `85.png`, `86.png`, `87.png`, `88.png`, `89.png`, `90.png`, `91.png`, `92.png`, `93.png`, `94.png`, `95.png`, `96.png`, `97.png`, `98.png`, `99.png`, `100.png`, `101.png`, `102.png`, `103.png`, `104.png`, `105.png`, `106.png`, `107.png`, `108.png`, `109.png`, `110.png`, `111.png`, `112.png`, `113.png`, `114.png`, `115.png`, `116.png`, `117.png`, `118.png`, `119.png`, `120.png`, `121.png`, `122.png`, `123.png`, `124.png`, `125.png`, `126.png`, `127.png`, `128.png`, `129.png`, `130.png`, `131.png`, `132.png`, `133.png`, `134.png`, `135.png`, `136.png`, `137.png`, `138.png`, `139.png`, `140.png`, `141.png`, `142.png`, `143.png`, `144.png`, `145.png`, `146.png`, `147.png`, `148.png`, `149.png`, `150.png`, `151.png`, `152.png`, `153.png`, `154.png`, `155.png`, `156.png`, `157.png`, `158.png`, `159.png`, `160.png`, `161.png`, `162.png`, `163.png`, `164.png`, `165.png`, `166.png`, `167.png`, `168.png`, `169.png`, `170.png`, `171.png`, `172.png`, `173.png`, `174.png`, `175.png`, `176.png`, `177.png`, `178.png`, `179.png`, `180.png`, `181.png`, `182.png`, `183.png`, `184.png`, `185.png`, `186.png`, `187.png`, `188.png`, `189.png`, `190.png`, `191.png`, `192.png`, `193.png`, `194.png`, `195.png`, `196.png`, `197.png`, `198.png`, `199.png`, `200.png`, `201.png`, `202.png`, `203.png`, `204.png`, `205.png`, `206.png`, `207.png`, `208.png`, `209.png`, `210.png`, `211.png`, `212.png`, `213.png`, `214.png`, `215.png`, `216.png`, `217.png`, `218.png`, `219.png`, `220.png`, `221.png`, `222.png`, `223.png`, `224.png`, `225.png`, `226.png`, `227.png`, `228.png`, `229.png`, `230.png`, `231.png`, `232.png`, `233.png`, `234.png`, `235.png`, `236.png`, `237.png`, `238.png`, `239.png`, `240.png`, `241.png`, `242.png`, `243.png`, `244.png`, `245.png`, `246.png`, `247.png`, `248.png`, `249.png`, `250.png`, `251.png`, `252.png`, `253.png`, `254.png`, `255.png`, `256.png`, `257.png`, `258.png`, `259.png`, `260.png`, `261.png`, `262.png`, `263.png`, `264.png`, `265.png`, `266.png`, `267.png`, `268.png`, `269.png`, `270.png`, `271.png`, `272.png`, `273.png`, `274.png`, `275.png`, `276.png`, `277.png`, `278.png`, `279.png`, `280.png`, `281.png`, `282.png`, `283.png`, `284.png`, `285.png`, `286.png`, `287.png`, `288.png`, `289.png`, `290.png`, `291.png`, `292.png`, `293.png`, `294.png`, `295.png`, `296.png`, `297.png`, `298.png`, `299.png`, `300.png`, `301.png`, `302.png`, `303.png`, `304.png`, `305.png`, `306.png`, `307.png`, `308.png`, `309.png`, `310.png`, `311.png`, `312.png`, `313.png`, `314.png`, `315.png`, `316.png`, `317.png`, `318.png`, `319.png`, `320.png`, `321.png`, `322.png`, `323.png`, `324.png`, `325.png`, `326.png`, `327.png`, `328.png`, `329.png`, `330.png`, `331.png`, `332.png`, `333.png`, `334.png`, `335.png`, `336.png`, `337.png`, `338.png`, `339.png`, `340.png`, `341.png`, `342.png`, `343.png`, `344.png`, `345.png`, `346.png`, `347.png`, `348.png`, `349.png`, `350.png`, `351.png`, `352.png`, `353.png`, `354.png`, `355.png`, `356.png`, `357.png`, `358.png`, `359.png`, `360.png`, `361.png`, `362.png`, `363.png`, `364.png`, `365.png`, `366.png`, `367.png`, `368.png`, `369.png`, `370.png`, `371.png`, `372.png`, `373.png`, `374.png`, `375.png`, `376.png`, `377.png`, `378.png`, `379.png`, `380.png`, `381.png`, `382.png`, `383.png`, `384.png`, `385.png`, `386.png`, `387.png`, `388.png`, `389.png`, `390.png`, `391.png`, `392.png`, `393.png`, `394.png`, `395.png`, `396.png`, `397.png`, `398.png`, `399.png`, `400.png`, `401.png`, `402.png`, `403.png`, `404.png`, `405.png`, `406.png`, `407.png`, `408.png`, `409.png`, `410.png`, `411.png`, `412.png`, `413.png`, `414.png`, `415.png`, `416.png`, `417.png`, `418.png`, `419.png`, `420.png`, `421.png`, `422.png`, `423.png`, `424.png`, `425.png`, `426.png`, `427.png`, `428.png`, `429.png`, `430.png`, `431.png`, `432.png`, `433.png`, `434.png`, `435.png`, `436.png`, `437.png`, `438.png`, `439.png`, `440.png`, `441.png`, `442.png`, `443.png`, `444.png`, `445.png`, `446.png`, `447.png`, `448.png`, `449.png`, `450.png`, `451.png`, `452.png`, `453.png`, `454.png`, `455.png`, `456.png`, `457.png`, `458.png`, `459.png`, `460.png`, `461.png`, `462.png`, `463.png`, `464.png`, `465.png`, `466.png`, `467.png`, `468.png`, `469.png`, `470.png`, `471.png`, `472.png`, `473.png`, `474.png`, `475.png`, `476.png`, `477.png`, `478.png`, `479.png`, `480.png`, `481.png`, `482.png`, `483.png`, `484.png`, `485.png`, `486.png`, `487.png`, `488.png`, `489.png`, `490.png`, `491.png`, `492.png`, `493.png`, `494.png`, `495.png`, `496.png`, `497.png`, `498.png`, `499.png`, `500.png`, `501.png`, `502.png`, `503.png`, `504.png`, `505.png`, `506.png`, `507.png`, `508.png`, `509.png`, `510.png`, `511.png`, `512.png`, `513.png`, `514.png`, `515.png`, `516.png`, `517.png`, `518.png`, `519.png`, `520.png`, `521.png`, `522.png`, `523.png`, `524.png`, `525.png`, `526.png`, `527.png`, `528.png`, `529.png`, `530.png`, `531.png`, `532.png`, `533.png`, `534.png`, `535.png`, `536.png`, `537.png`, `538.png`, `539.png`, `540.png`, `541.png`, `542.png`, `543.png`, `544.png`, `545.png`, `546.png`, `547.png`, `548.png`, `549.png`, `550.png`, `551.png`, `552.png`, `553.png`, `554.png`, `555.png`, `556.png`, `557.png`, `558.png`, `559.png`, `560.png`, `561.png`, `562.png`, `563.png`, `564.png`, `565.png`, `566.png`, `567.png`, `568.png`, `569.png`, `570.png`, `571.png`, `572.png`, `573.png`, `574.png`, `575.png`, `576.png`, `577.png`, `578.png`, `579.png`, `580.png`, `581.png`, `582.png`, `583.png`, `584.png`, `585.png`, `586.png`, `587.png`, `588.png`, `589.png`, `590.png`, `591.png`, `592.png`, `593.png`, `594.png`, `595.png`, `596.png`, `597.png`, `598.png`, `599.png`, `600.png`, `601.png`, `602.png`, `603.png`, `604.png`, `605.png`, `606.png`, `607.png`, `608.png`, `609.png`, `610.png`, `611.png`, `612.png`, `613.png`, `614.png`, `615.png`, `616.png`, `617.png`, `618.png`, `619.png`, `620.png`, `621.png`, `622.png`, `623.png`, `624.png`, `625.png`, `626.png`, `627.png`, `628.png`, `629.png`, `630.png`, `631.png`, `632.png`, `633.png`, `634.png`, `635.png`, `636.png`, `637.png`, `638.png`, `639.png`, `640.png`, `641.png`, `642.png`, `643.png`, `644.png`, `645.png`, `646.png`, `647.png`, `648.png`, `649.png`, `11008.png`, `11009.png`, `11010.png`, `11011.png`, `11012.png`, `11013.png`, `11037.png`, `11038.png`, `11039.png`, `11040.png`, `11041.png`, `11042.png`, `11043.png`, `11044.png`, `11045.png`, `11046.png`, `11047.png`, `11048.png`, `11049.png`, `11050.png`, `11051.png`, `11052.png`, `11053.png`, `11054.png`, `11055.png`, `11056.png`, `11057.png`, `11058.png`, `11059.png`, `11060.png`, `11061.png`, `11062.png`, `11063.png`, `11065.png`, `11066.png`, `11067.png`, `11068.png`, `11069.png`, `11070.png`, `11094.png`, `11095.png`, `11105.png`, `11106.png`, `11128.png`, `shiny/77.png`, `shiny/130.png`, `shiny/147.png`, `shiny/443.png`, `shiny/612.png`.

### Arkeis (3 files)

| File | Pokémon | Evidence | Verdict | Source |
|---|---|---|---|---|
| `683.png` | aromatisse | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/683-png.275700/ |
| `685.png` | slurpuff | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/685-png.273659/ |
| `695.png` | heliolisk | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/695-png.293922/ |

### Banana Toast (3 files)

| File | Pokémon | Evidence | Verdict | Source |
|---|---|---|---|---|
| `915.png` | lechonk | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/915-png.492535/ |
| `916.png` | oinkologne | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/916m-png.492537/ |
| `1020.png` | gouging-fire | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/1020-png.653098/ |

### Basic Vanillite (19 files)

| File | Pokémon | Evidence | Verdict | Source |
|---|---|---|---|---|
| `11018.png` | vivillon-archipelago | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/666_10-png.273598/ |
| `11019.png` | vivillon-continental | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/666_4-png.273586/ |
| `11020.png` | vivillon-elegant | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/666_6-png.273590/ |
| `11021.png` | vivillon-fancy | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/666_19-png.273616/ |
| `11022.png` | vivillon-garden | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/666_5-png.273588/ |
| `11023.png` | vivillon-high-plains | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/666_11-png.273600/ |
| `11024.png` | vivillon-icy-snow | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/666_7-png.273592/ |
| `11025.png` | vivillon-jungle | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/666_18-png.273614/ |
| `11026.png` | vivillon-marine | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/666_9-png.273596/ |
| `11027.png` | vivillon-modern | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/666_8-png.273594/ |
| `11028.png` | vivillon-monsoon | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/666_14-png.273606/ |
| `11029.png` | vivillon-ocean | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/666_17-png.273612/ |
| `11030.png` | vivillon-pokeball | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/666_20-png.273618/ |
| `11031.png` | vivillon-polar | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/666_2-png.273582/ |
| `11032.png` | vivillon-river | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/666_13-png.273604/ |
| `11033.png` | vivillon-sandstorm | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/666_12-png.273602/ |
| `11034.png` | vivillon-savanna | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/666_15-png.273608/ |
| `11035.png` | vivillon-sun | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/666_16-png.273610/ |
| `11036.png` | vivillon-tundra | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/666_3-png.273584/ |

### Blaquaza (40 files)

| File | Pokémon | Evidence | Verdict | Source |
|---|---|---|---|---|
| `811.png` | thwackey | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/811-png.214274/ |
| `812.png` | rillaboom | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/812-png.212825/ |
| `814.png` | raboot | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/814-png.208854/ |
| `815.png` | cinderace | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/815_1-png.222102/ |
| `817.png` | drizzile | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/817-png.208858/ |
| `818.png` | inteleon | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/818-png.218705/ |
| `835.png` | yamper | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/yamper-png.180075/ |
| `837.png` | rolycoly | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/rolycoly-png.185102/ |
| `840.png` | applin | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/840-png.206511/ |
| `842.png` | appletun | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/842_1-png.212841/ |
| `848.png` | toxel | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/848-png.206472/ |
| `856.png` | hatenna | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/856-png.206476/ |
| `868.png` | milcery | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/868-png.206483/ |
| `876.png` | indeedee | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/876m-png.218808/ |
| `891.png` | kubfu | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/kubfu-png.218814/ |
| `896.png` | glastrier | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/896-png.286963/ |
| `900.png` | kleavor | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/900-png.420782/ |
| `903.png` | sneasler | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/903-png.420745/ |
| `913.png` | quaxwell | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/913-png.629243/ |
| `914.png` | quaquaval | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/914-png.629245/ |
| `919.png` | nymble | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/919-png.732394/ |
| `920.png` | lokix | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/920-png.779794/ |
| `926.png` | fidough | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/926-png.779798/ |
| `927.png` | dachsbun | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/927-png.653068/ |
| `960.png` | wiglett | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/960-png.492549/ |
| `961.png` | wugtrio | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/961_1-png.573996/ |
| `971.png` | greavard | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/971-png.603595/ |
| `972.png` | houndstone | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/972-png.779822/ |
| `978.png` | tatsugiri | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/978-png.492551/ |
| `991.png` | iron-bundle | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/991-png.512414/ |
| `1005.png` | roaring-moon | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/1005-png.629261/ |
| `1007.png` | koraidon | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/1007-png.512426/ |
| `10186.png` | indeedee-female | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/876f-png.218806/ |
| `10193.png` | calyrex-ice | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/898_2-png.286974/ |
| `10231.png` | voltorb-hisui | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/100_1-png.420722/ |
| `10232.png` | electrode-hisui | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/101_1-png.420724/ |
| `10233.png` | typhlosion-hisui | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/157_1-png.420726/ |
| `10235.png` | sneasel-hisui | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/215_1-png.420766/ |
| `11006.png` | tatsugiri-droopy | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/978_1-png.492552/ |
| `11007.png` | tatsugiri-stretchy | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/978_2-png.492554/ |

### branflakes (4 files)

| File | Pokémon | Evidence | Verdict | Source |
|---|---|---|---|---|
| `675.png` | pangoro | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/675-png.273641/ |
| `705.png` | sliggoo | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/705-png.293941/ |
| `706.png` | goodra | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/706-png.290771/ |
| `10045.png` | Mega Ampharos | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/181_2-png.275718/ |

### Brylark (1 files)

| File | Pokémon | Evidence | Verdict | Source |
|---|---|---|---|---|
| `10074.png` | Mega Glalie | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/362_2-png.290747/ |

### Buna (1 files)

| File | Pokémon | Evidence | Verdict | Source |
|---|---|---|---|---|
| `975.png` | cetitan | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/975-png.536966/ |

### Bynine (2 files)

| File | Pokémon | Evidence | Verdict | Source |
|---|---|---|---|---|
| `687.png` | malamar | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/687-png.276692/ |
| `10040.png` | Mega Pinsir | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/127_2-png.300578/ |

### Corson (1 files)

| File | Pokémon | Evidence | Verdict | Source |
|---|---|---|---|---|
| `704.png` | goomy | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/704-png.273683/ |

### Cynda (7 files)

| File | Pokémon | Evidence | Verdict | Source |
|---|---|---|---|---|
| `845.png` | cramorant | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/845_1-png.206470/ |
| `852.png` | clobbopus | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/852-png.206474/ |
| `853.png` | grapploct | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/853-png.218721/ |
| `867.png` | runerigus | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/867-png.212853/ |
| `10179.png` | yamask-galar | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/562_2-png.222098/ |
| `10182.png` | cramorant-gulping | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/845_2-png.218715/ |
| `10183.png` | cramorant-gorging | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/845_3-png.212848/ |

### Dleep (1 files)

| File | Pokémon | Evidence | Verdict | Source |
|---|---|---|---|---|
| `10050.png` | Mega Blaziken | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/257_2-png.274419/ |

### Espeon Scientist (1 files)

| File | Pokémon | Evidence | Verdict | Source |
|---|---|---|---|---|
| `777.png` | togedemaru | near only | unproven | https://eeveeexpo.com/resources/1101/ |

### Falgaia (22 files)

| File | Pokémon | Evidence | Verdict | Source |
|---|---|---|---|---|
| `651.png` | quilladin | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/651-png.273559/ |
| `654.png` | braixen | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/654-png.273564/ |
| `657.png` | frogadier | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/657-png.293906/ |
| `658.png` | greninja | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/658-png.273570/ |
| `693.png` | clawitzer | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/693-png.273671/ |
| `696.png` | tyrunt | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/696-png.273672/ |
| `698.png` | amaura | near only | unproven | https://eeveeexpo.com/resources/1101/ |
| `699.png` | aurorus | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/699-png.290766/ |
| `713.png` | avalugg | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/713-png.282253/ |
| `715.png` | noivern | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/715-png.282255/ |
| `720.png` | hoopa | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/720_1-png.274487/ |
| `738.png` | vikavolt | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/738-png.128444/ |
| `741.png` | oricorio | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/741_1-png.127363/ |
| `763.png` | tsareena | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/763-png.128485/ |
| `785.png` | tapu-koko | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/785-png.130197/ |
| `786.png` | tapu-lele | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/786-png.130201/ |
| `787.png` | tapu-bulu | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/787-png.130205/ |
| `788.png` | tapu-fini | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/788-png.130209/ |
| `10053.png` | Mega Aggron | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/306_2-png.300592/ |
| `10062.png` | Mega Latias | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/380_2-png.275692/ |
| `10086.png` | hoopa-unbound | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/720_2-png.282257/ |
| `10143.png` | mimikyu-busted | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/778_2-png.116856/ |

### Farriella (1 files)

| File | Pokémon | Evidence | Verdict | Source |
|---|---|---|---|---|
| `10077.png` | Primal Kyogre | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/382_2-png.273713/ |

### fishbowlsoul90 (6 files)

| File | Pokémon | Evidence | Verdict | Source |
|---|---|---|---|---|
| `747.png` | mareanie | near only | unproven | https://eeveeexpo.com/resources/1101/ |
| `791.png` | solgaleo | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/791-png.102342/ |
| `792.png` | lunala | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/792-png.169356/ |
| `796.png` | xurkitree | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/796-png.178346/ |
| `797.png` | celesteela | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/797-png.273519/ |
| `10114.png` | exeggutor-alola | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/103-png.113996/ |

### G.E.Z. (35 files)

| File | Pokémon | Evidence | Verdict | Source |
|---|---|---|---|---|
| `755.png` | morelull | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/755-png.178622/ |
| `756.png` | shiinotic | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/756-png.171613/ |
| `762.png` | steenee | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/762-png.178628/ |
| `793.png` | nihilego | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/793-png.178632/ |
| `799.png` | guzzlord | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/799-png.273523/ |
| `806.png` | blacephalon | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/806-png.273530/ |
| `808.png` | meltan | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/808-png.272399/ |
| `819.png` | skwovet | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/819-png.218707/ |
| `820.png` | greedent | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/820-png.222104/ |
| `866.png` | mr-rime | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/866-png.218734/ |
| `896.png` | glastrier | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/896-png.286963/ |
| `899.png` | wyrdeer | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/899-png.420752/ |
| `905.png` | enamorus | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/905-png.420736/ |
| `906.png` | sprigatito | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/906-png.492529/ |
| `917.png` | tarountula | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/917-png.573992/ |
| `935.png` | charcadet | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/935-png.779804/ |
| `982.png` | dudunsparce | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/982-png.536970/ |
| `993.png` | iron-jugulis | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/993-png.779828/ |
| `999.png` | gimmighoul | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/999-png.536974/ |
| `1001.png` | wo-chien | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/1001-png.536980/ |
| `1003.png` | ting-lu | artist's own file | confirmed | https://www.deviantart.com/kingofthe-x-roads/art/Gen-9-Sprites---Pokemon-Scarlet-and-Violet-908341834 |
| `1020.png` | gouging-fire | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/1020-png.653098/ |
| `1021.png` | raging-bolt | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/1021-png.779832/ |
| `10033.png` | Mega Venusaur | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/003_2-png.276600/ |
| `10117.png` | greninja-ash | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/658_2-png.273483/ |
| `10169.png` | articuno-galar | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/144_2-png.284181/ |
| `10171.png` | moltres-galar | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/146_2-png.284189/ |
| `10176.png` | darumaka-galar | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/554_2-png.208835/ |
| `10177.png` | darmanitan-galar | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/555_3-png.208839/ |
| `10193.png` | calyrex-ice | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/898_2-png.286974/ |
| `10240.png` | braviary-hisui | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/628_1-png.420738/ |
| `10247.png` | basculin-white-striped | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/550_2-png.420769/ |
| `10249.png` | enamorus-therian | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/905_1-png.420771/ |
| `11003.png` | dudunsparce-three-segment | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/982_1-png.536971/ |
| `11072.png` | darmanitan-galar-zen | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/555_4-png.208843/ |

### Galifia (1 files)

| File | Pokémon | Evidence | Verdict | Source |
|---|---|---|---|---|
| `709.png` | trevenant | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/709-png.293924/ |

### GeoisEvil (2 files)

| File | Pokémon | Evidence | Verdict | Source |
|---|---|---|---|---|
| `650.png` | chespin | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/650-png.290751/ |
| `702.png` | dedenne | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/702-png.273680/ |

### HeaLnDeaL (1 files)

| File | Pokémon | Evidence | Verdict | Source |
|---|---|---|---|---|
| `750.png` | mudsdale | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/750-png.113784/ |

### Hematite (2 files)

| File | Pokémon | Evidence | Verdict | Source |
|---|---|---|---|---|
| `10237.png` | lilligant-hisui | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/549_1-png.420768/ |
| `10239.png` | zoroark-hisui | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/571_1-png.420759/ |

### Involuntary Twitch (2 files)

| File | Pokémon | Evidence | Verdict | Source |
|---|---|---|---|---|
| `849.png` | toxtricity | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/849_1-png.222120/ |
| `10184.png` | toxtricity-low-key | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/849_2-png.222122/ |

### Katten (18 files)

| File | Pokémon | Evidence | Verdict | Source |
|---|---|---|---|---|
| `907.png` | floragato | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/907-png.603579/ |
| `908.png` | meowscarada | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/908-png.536952/ |
| `923.png` | pawmot | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/923-png.779796/ |
| `928.png` | smoliv | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/928-png.492547/ |
| `929.png` | dolliv | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/929-png.779800/ |
| `930.png` | arboliva | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/930-png.779802/ |
| `952.png` | scovillain | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/952-png.779808/ |
| `967.png` | cyclizar | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/967-png.629251/ |
| `969.png` | glimmet | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/969-png.512412/ |
| `970.png` | glimmora | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/970-png.653080/ |
| `972.png` | houndstone | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/972-png.779822/ |
| `973.png` | flamigo | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/973-png.629253/ |
| `980.png` | clodsire | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/980-png.492559/ |
| `984.png` | great-tusk | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/984-png.574000/ |
| `986.png` | brute-bonnet | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/986-png.629257/ |
| `988.png` | slither-wing | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/988-png.779824/ |
| `1014.png` | okidogi | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/1014-png.653088/ |
| `10253.png` | wooper-paldea | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/194_1-png.512398/ |

### KattenK (1 files)

| File | Pokémon | Evidence | Verdict | Source |
|---|---|---|---|---|
| `10244.png` | decidueye-hisui | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/724_1-png.420750/ |

### KingOfThe-X-Roads (106 files)

| File | Pokémon | Evidence | Verdict | Source |
|---|---|---|---|---|
| `824.png` | blipbug | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/824-png.212830/ |
| `825.png` | dottler | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/825-png.212832/ |
| `826.png` | orbeetle | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/826_1-png.208860/ |
| `827.png` | nickit | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/827-png.218709/ |
| `828.png` | thievul | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/828-png.218711/ |
| `829.png` | gossifleur | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/gossifleur-png.179547/ |
| `831.png` | wooloo | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/wooloo_1-png.178600/ |
| `832.png` | dubwool | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/832-png.212835/ |
| `836.png` | boltund | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/836-png.206463/ |
| `843.png` | silicobra | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/843-png.212843/ |
| `844.png` | sandaconda | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/844_1-png.212845/ |
| `870.png` | falinks | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/870-png.212855/ |
| `874.png` | stonjourner | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/874-png.208878/ |
| `875.png` | eiscue | near only | unproven | https://eeveeexpo.com/resources/1101/ |
| `878.png` | cufant | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/878-png.212863/ |
| `879.png` | copperajah | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/879_1-png.208880/ |
| `880.png` | dracozolt | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/880-png.208882/ |
| `881.png` | arctozolt | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/881-png.212867/ |
| `882.png` | dracovish | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/883-png.208884/ |
| `883.png` | arctovish | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/883-png.212869/ |
| `897.png` | spectrier | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/897-png.286970/ |
| `901.png` | ursaluna | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/901-png.420767/ |
| `902.png` | basculegion | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/902m-png.420761/ |
| `906.png` | sprigatito | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/906-png.492529/ |
| `909.png` | fuecoco | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/909-png.492531/ |
| `910.png` | crocalor | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/910-png.653066/ |
| `911.png` | skeledirge | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/911-png.512400/ |
| `921.png` | pawmi | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/921-png.492539/ |
| `922.png` | pawmo | PokéAPI README | confirmed | https://github.com/PokeAPI/sprites/blob/aa370b74e27b4028c23dabeb1aaa21e75f81231d/sprites/pokemon/922.png |
| `931.png` | squawkabilly | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/931-png.653070/ |
| `933.png` | naclstack | artist's own file | confirmed | https://www.deviantart.com/kingofthe-x-roads/art/Gen-9-Sprites---Pokemon-Scarlet-and-Violet-908341834 |
| `937.png` | ceruledge | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/937-png.603583/ |
| `940.png` | wattrel | artist's own file | confirmed | https://www.deviantart.com/kingofthe-x-roads/art/Gen-9-Sprites---Pokemon-Scarlet-and-Violet-908341834 |
| `941.png` | kilowattrel | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/941-png.512404/ |
| `942.png` | maschiff | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/942-png.512406/ |
| `943.png` | mabosstiff | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/943-png.512408/ |
| `944.png` | shroodle | PokéAPI README | confirmed | https://github.com/PokeAPI/sprites/blob/aa370b74e27b4028c23dabeb1aaa21e75f81231d/sprites/pokemon/944.png |
| `945.png` | grafaiai | pack sheet | confirmed | https://eeveeexpo.com/resources/1101/ |
| `946.png` | bramblin | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/946-png.603587/ |
| `947.png` | brambleghast | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/947-png.603589/ |
| `949.png` | toedscruel | PokéAPI README | confirmed | https://github.com/PokeAPI/sprites/blob/aa370b74e27b4028c23dabeb1aaa21e75f81231d/sprites/pokemon/949.png |
| `953.png` | rellor | artist's own file | confirmed | https://www.deviantart.com/kingofthe-x-roads/art/Gen-9-Sprites---Pokemon-Scarlet-and-Violet-908341834 |
| `954.png` | rabsca | artist's own file | confirmed | https://www.deviantart.com/kingofthe-x-roads/art/Gen-9-Sprites---Pokemon-Scarlet-and-Violet-908341834 |
| `962.png` | bombirdier | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/962-png.512410/ |
| `977.png` | dondozo | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/977-png.536968/ |
| `981.png` | farigiraf | artist's own file | confirmed | https://www.deviantart.com/kingofthe-x-roads/art/Gen-9-Sprites---Pokemon-Scarlet-and-Violet-908341834 |
| `983.png` | kingambit | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/983-png.492561/ |
| `987.png` | flutter-mane | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/987-png.574002/ |
| `989.png` | sandy-shocks | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/989-png.779826/ |
| `992.png` | iron-hands | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/992-png.492563/ |
| `994.png` | iron-moth | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/994-png.653084/ |
| `1003.png` | ting-lu | artist's own file | confirmed | https://www.deviantart.com/kingofthe-x-roads/art/Gen-9-Sprites---Pokemon-Scarlet-and-Violet-908341834 |
| `1012.png` | poltchageist | pack sheet | confirmed | https://eeveeexpo.com/resources/1101/ |
| `1015.png` | munkidori | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/1015-png.653090/ |
| `1016.png` | fezandipiti | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/1016-png.653092/ |
| `1017.png` | ogerpon | artist's own file | confirmed | https://sta.sh/06ggsxxo7i8 |
| `1018.png` | archaludon | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/1018-png.653094/ |
| `1023.png` | iron-crown | near only | unproven |  |
| `1024.png` | terapagos | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/1024-png.653100/ |
| `10162.png` | ponyta-galar | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/077_2-png.206445/ |
| `10163.png` | rapidash-galar | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/078_2-png.779788/ |
| `10166.png` | farfetchd-galar | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/083_2-png.243322/ |
| `10175.png` | linoone-galar | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/264_2-png.243329/ |
| `10185.png` | eiscue-noice | near only | unproven | https://eeveeexpo.com/resources/1101/ |
| `10188.png` | zacian-crowned | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/zacian-png.178831/ |
| `10193.png` | calyrex-ice | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/898_2-png.286974/ |
| `10194.png` | calyrex-shadow | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/898_3-png.286949/ |
| `10198.png` | Gigantamax Butterfree | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/012_g-png.208828/ |
| `10200.png` | Gigantamax Meowth | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/052_g-png.206444/ |
| `10209.png` | Gigantamax Rillaboom | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/812_g-png.267922/ |
| `10213.png` | Gigantamax Orbeetle | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/826_g-png.208861/ |
| `10218.png` | Gigantamax Sandaconda | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/844_g-png.269849/ |
| `10220.png` | Gigantamax Centiskorch | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/851_g-png.271704/ |
| `10224.png` | Gigantamax Copperajah | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/879_g-png.212865/ |
| `10226.png` | Gigantamax Urshifu | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/892_g2-png.266189/ |
| `10227.png` | Gigantamax Urshifu Rapid Strike | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/892_g1-png.266187/ |
| `10230.png` | arcanine-hisui | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/059_1-png.420720/ |
| `10234.png` | qwilfish-hisui | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/211_1-png.420728/ |
| `10236.png` | samurott-hisui | near only | unproven | https://www.smogon.com/forums/attachments/503_1-png.450194/ |
| `10238.png` | zorua-hisui | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/570_1-png.450202/ |
| `10240.png` | braviary-hisui | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/628_1-png.420738/ |
| `10243.png` | avalugg-hisui | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/713_1-png.420746/ |
| `10245.png` | dialga-origin | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/483_1-png.420730/ |
| `10246.png` | palkia-origin | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/484_1-png.420758/ |
| `10248.png` | basculegion-female | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/902f-png.420732/ |
| `10260.png` | squawkabilly-blue-plumage | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/931_1-png.653071/ |
| `10261.png` | squawkabilly-yellow-plumage | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/931_2-png.653073/ |
| `10262.png` | squawkabilly-white-plumage | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/931_3-png.653075/ |
| `10263.png` | gimmighoul-roaming | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/999_1-png.536975/ |
| `10272.png` | ursaluna-bloodmoon | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/901_1-png.653064/ |
| `10273.png` | ogerpon-wellspring-mask | artist's own file | confirmed | https://sta.sh/01juz4fne5n |
| `10274.png` | ogerpon-hearthflame-mask | artist's own file | confirmed | https://sta.sh/01r7h3c3ltl |
| `10275.png` | ogerpon-cornerstone-mask | artist's own file | confirmed | https://sta.sh/01b2qwauwmzn |
| `10276.png` | terapagos, terapagos-terastal | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/1024_1-png.653101/ |
| `10277.png` | terapagos-stellar | pack sheet | confirmed | https://eeveeexpo.com/resources/1101/ |
| `10290.png` | Mega Eelektross | pack sheet | confirmed | https://eeveeexpo.com/resources/1101/ |
| `10299.png` | Mega Dragalge | artist's own file | confirmed | https://www.deviantart.com/kingofthe-x-roads/art/Mega-and-Primal-Pokemon-Sprites-880074756 |
| `10305.png` | Mega Raichu Y | artist's own file | confirmed | https://www.deviantart.com/kingofthe-x-roads/art/Mega-and-Primal-Pokemon-Sprites-880074756 |
| `10311.png` | Mega Heatran | pack sheet | confirmed | https://eeveeexpo.com/resources/1101/ |
| `11002.png` | oinkologne-female | pack sheet | confirmed | https://eeveeexpo.com/resources/1101/ |
| `11005.png` | maushold-family-of-three | pack sheet | confirmed | https://eeveeexpo.com/resources/1101/ |
| `11112.png` | rotom-dj | near only | unproven | https://www.smogon.com/forums/attachments/323_2-png.274427/ |
| `11113.png` | ogerpon-teal-tera | artist's own file | confirmed | https://sta.sh/0jzbalocru5 |
| `11114.png` | ogerpon-wellspring-tera | artist's own file | confirmed | https://sta.sh/02ctsdxqkwa4 |
| `11115.png` | ogerpon-hearthflame-tera | artist's own file | confirmed | https://sta.sh/01ft9j4y6bg0 |
| `11116.png` | ogerpon-cornerstone-tera | artist's own file | confirmed | https://sta.sh/01423lw1pqim |

### Kyle Dove (45 files)

| File | Pokémon | Evidence | Verdict | Source |
|---|---|---|---|---|
| `950.png` | klawf | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/950-png.653078/ |
| `1019.png` | hydrapple | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/1019-png.653096/ |
| `10278.png` | Mega Clefable | PokéAPI README | confirmed | https://github.com/PokeAPI/sprites/blob/4bc9d60186fe2e499ee2f3d4d1b796806cb99a67/sprites/pokemon/10278.png |
| `10279.png` | Mega Victreebel | PokéAPI README | confirmed | https://github.com/PokeAPI/sprites/blob/4bc9d60186fe2e499ee2f3d4d1b796806cb99a67/sprites/pokemon/10279.png |
| `10280.png` | Mega Starmie | PokéAPI README | confirmed | https://github.com/PokeAPI/sprites/blob/4bc9d60186fe2e499ee2f3d4d1b796806cb99a67/sprites/pokemon/10280.png |
| `10281.png` | Mega Dragonite | PokéAPI README | confirmed | https://github.com/PokeAPI/sprites/blob/4bc9d60186fe2e499ee2f3d4d1b796806cb99a67/sprites/pokemon/10281.png |
| `10282.png` | Mega Meganium | PokéAPI README | confirmed | https://github.com/PokeAPI/sprites/blob/4bc9d60186fe2e499ee2f3d4d1b796806cb99a67/sprites/pokemon/10282.png |
| `10283.png` | Mega Feraligatr | PokéAPI README | confirmed | https://github.com/PokeAPI/sprites/blob/4bc9d60186fe2e499ee2f3d4d1b796806cb99a67/sprites/pokemon/10283.png |
| `10284.png` | Mega Skarmory | PokéAPI README | confirmed | https://github.com/PokeAPI/sprites/blob/4bc9d60186fe2e499ee2f3d4d1b796806cb99a67/sprites/pokemon/10284.png |
| `10285.png` | Mega Froslass | PokéAPI README | confirmed | https://github.com/PokeAPI/sprites/blob/4bc9d60186fe2e499ee2f3d4d1b796806cb99a67/sprites/pokemon/10285.png |
| `10286.png` | Mega Emboar | PokéAPI README | confirmed | https://github.com/PokeAPI/sprites/blob/4bc9d60186fe2e499ee2f3d4d1b796806cb99a67/sprites/pokemon/10286.png |
| `10287.png` | Mega Excadrill | PokéAPI README | confirmed | https://github.com/PokeAPI/sprites/blob/4bc9d60186fe2e499ee2f3d4d1b796806cb99a67/sprites/pokemon/10287.png |
| `10288.png` | Mega Scolipede | PokéAPI README | confirmed | https://github.com/PokeAPI/sprites/blob/4bc9d60186fe2e499ee2f3d4d1b796806cb99a67/sprites/pokemon/10288.png |
| `10289.png` | Mega Scrafty | PokéAPI README | confirmed | https://github.com/PokeAPI/sprites/blob/4bc9d60186fe2e499ee2f3d4d1b796806cb99a67/sprites/pokemon/10289.png |
| `10291.png` | Mega Chandelure | PokéAPI README | confirmed | https://github.com/PokeAPI/sprites/blob/4bc9d60186fe2e499ee2f3d4d1b796806cb99a67/sprites/pokemon/10291.png |
| `10292.png` | Mega Chesnaught | PokéAPI README | confirmed | https://github.com/PokeAPI/sprites/blob/4bc9d60186fe2e499ee2f3d4d1b796806cb99a67/sprites/pokemon/10292.png |
| `10293.png` | Mega Delphox | PokéAPI README | confirmed | https://github.com/PokeAPI/sprites/blob/4bc9d60186fe2e499ee2f3d4d1b796806cb99a67/sprites/pokemon/10293.png |
| `10294.png` | Mega Greninja | PokéAPI README | confirmed | https://github.com/PokeAPI/sprites/blob/4bc9d60186fe2e499ee2f3d4d1b796806cb99a67/sprites/pokemon/10294.png |
| `10295.png` | Mega Pyroar | PokéAPI README | confirmed | https://github.com/PokeAPI/sprites/blob/4bc9d60186fe2e499ee2f3d4d1b796806cb99a67/sprites/pokemon/10295.png |
| `10296.png` | Mega Floette | PokéAPI README | confirmed | https://github.com/PokeAPI/sprites/blob/4bc9d60186fe2e499ee2f3d4d1b796806cb99a67/sprites/pokemon/10296.png |
| `10297.png` | Mega Malamar | PokéAPI README | confirmed | https://github.com/PokeAPI/sprites/blob/4bc9d60186fe2e499ee2f3d4d1b796806cb99a67/sprites/pokemon/10297.png |
| `10298.png` | Mega Barbaracle | PokéAPI README | confirmed | https://github.com/PokeAPI/sprites/blob/4bc9d60186fe2e499ee2f3d4d1b796806cb99a67/sprites/pokemon/10298.png |
| `10300.png` | Mega Hawlucha | PokéAPI README | confirmed | https://github.com/PokeAPI/sprites/blob/4bc9d60186fe2e499ee2f3d4d1b796806cb99a67/sprites/pokemon/10300.png |
| `10302.png` | Mega Drampa | PokéAPI README | confirmed | https://github.com/PokeAPI/sprites/blob/4bc9d60186fe2e499ee2f3d4d1b796806cb99a67/sprites/pokemon/10302.png |
| `10303.png` | Mega Falinks | PokéAPI README | confirmed | https://github.com/PokeAPI/sprites/blob/4bc9d60186fe2e499ee2f3d4d1b796806cb99a67/sprites/pokemon/10303.png |
| `10304.png` | Mega Raichu X | KingOfThe-X-Roads own upload | confirmed | https://sta.sh/03id19f0dha |
| `10306.png` | Mega Chimecho | PokéAPI README | confirmed | https://github.com/PokeAPI/sprites/blob/4bc9d60186fe2e499ee2f3d4d1b796806cb99a67/sprites/pokemon/10306.png |
| `10307.png` | Mega Absol Z | PokéAPI README | confirmed | https://github.com/PokeAPI/sprites/blob/4bc9d60186fe2e499ee2f3d4d1b796806cb99a67/sprites/pokemon/10307.png |
| `10308.png` | Mega Staraptor | PokéAPI README | confirmed | https://github.com/PokeAPI/sprites/blob/4bc9d60186fe2e499ee2f3d4d1b796806cb99a67/sprites/pokemon/10308.png |
| `10309.png` | Mega Garchomp Z | PokéAPI README | confirmed | https://github.com/PokeAPI/sprites/blob/4bc9d60186fe2e499ee2f3d4d1b796806cb99a67/sprites/pokemon/10309.png |
| `10310.png` | Mega Lucario Z | PokéAPI README | confirmed | https://github.com/PokeAPI/sprites/blob/4bc9d60186fe2e499ee2f3d4d1b796806cb99a67/sprites/pokemon/10310.png |
| `10312.png` | Mega Darkrai | PokéAPI README | confirmed | https://github.com/PokeAPI/sprites/blob/4bc9d60186fe2e499ee2f3d4d1b796806cb99a67/sprites/pokemon/10312.png |
| `10313.png` | Mega Golurk | PokéAPI README | confirmed | https://github.com/PokeAPI/sprites/blob/4bc9d60186fe2e499ee2f3d4d1b796806cb99a67/sprites/pokemon/10313.png |
| `10314.png` | Mega Meowstic | PokéAPI README | confirmed | https://github.com/PokeAPI/sprites/blob/4bc9d60186fe2e499ee2f3d4d1b796806cb99a67/sprites/pokemon/10314.png |
| `10315.png` | Mega Crabominable | PokéAPI README | confirmed | https://github.com/PokeAPI/sprites/blob/4bc9d60186fe2e499ee2f3d4d1b796806cb99a67/sprites/pokemon/10315.png |
| `10316.png` | Mega Golisopod | PokéAPI README | confirmed | https://github.com/PokeAPI/sprites/blob/4bc9d60186fe2e499ee2f3d4d1b796806cb99a67/sprites/pokemon/10316.png |
| `10317.png` | Mega Magearna | PokéAPI README | confirmed | https://github.com/PokeAPI/sprites/blob/4bc9d60186fe2e499ee2f3d4d1b796806cb99a67/sprites/pokemon/10317.png |
| `10318.png` | Mega Magearna (Original Color), magearna-original-mega | PokéAPI README | confirmed | https://github.com/PokeAPI/sprites/blob/4bc9d60186fe2e499ee2f3d4d1b796806cb99a67/sprites/pokemon/10318.png |
| `10319.png` | Mega Zeraora | PokéAPI README | confirmed | https://github.com/PokeAPI/sprites/blob/4bc9d60186fe2e499ee2f3d4d1b796806cb99a67/sprites/pokemon/10319.png |
| `10320.png` | Mega Scovillain | PokéAPI README | confirmed | https://github.com/PokeAPI/sprites/blob/4bc9d60186fe2e499ee2f3d4d1b796806cb99a67/sprites/pokemon/10320.png |
| `10321.png` | Mega Glimmora | PokéAPI README | confirmed | https://github.com/PokeAPI/sprites/blob/4bc9d60186fe2e499ee2f3d4d1b796806cb99a67/sprites/pokemon/10321.png |
| `10322.png` | Mega Tatsugiri | PokéAPI README | confirmed | https://github.com/PokeAPI/sprites/blob/4bc9d60186fe2e499ee2f3d4d1b796806cb99a67/sprites/pokemon/10322.png |
| `10323.png` | Mega Tatsugiri (Droopy Form), tatsugiri-droopy-mega | PokéAPI README | confirmed | https://github.com/PokeAPI/sprites/blob/4bc9d60186fe2e499ee2f3d4d1b796806cb99a67/sprites/pokemon/10323.png |
| `10324.png` | Mega Tatsugiri (Stretchy Form), tatsugiri-stretchy-mega | PokéAPI README | confirmed | https://github.com/PokeAPI/sprites/blob/4bc9d60186fe2e499ee2f3d4d1b796806cb99a67/sprites/pokemon/10324.png |
| `10325.png` | Mega Baxcalibur | PokéAPI README | confirmed | https://github.com/PokeAPI/sprites/blob/4bc9d60186fe2e499ee2f3d4d1b796806cb99a67/sprites/pokemon/10325.png |

### Larryturbo (19 files)

| File | Pokémon | Evidence | Verdict | Source |
|---|---|---|---|---|
| `11018.png` | vivillon-archipelago | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/666_10-png.273598/ |
| `11019.png` | vivillon-continental | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/666_4-png.273586/ |
| `11020.png` | vivillon-elegant | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/666_6-png.273590/ |
| `11021.png` | vivillon-fancy | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/666_19-png.273616/ |
| `11022.png` | vivillon-garden | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/666_5-png.273588/ |
| `11023.png` | vivillon-high-plains | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/666_11-png.273600/ |
| `11024.png` | vivillon-icy-snow | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/666_7-png.273592/ |
| `11025.png` | vivillon-jungle | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/666_18-png.273614/ |
| `11026.png` | vivillon-marine | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/666_9-png.273596/ |
| `11027.png` | vivillon-modern | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/666_8-png.273594/ |
| `11028.png` | vivillon-monsoon | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/666_14-png.273606/ |
| `11029.png` | vivillon-ocean | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/666_17-png.273612/ |
| `11030.png` | vivillon-pokeball | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/666_20-png.273618/ |
| `11031.png` | vivillon-polar | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/666_2-png.273582/ |
| `11032.png` | vivillon-river | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/666_13-png.273604/ |
| `11033.png` | vivillon-sandstorm | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/666_12-png.273602/ |
| `11034.png` | vivillon-savanna | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/666_15-png.273608/ |
| `11035.png` | vivillon-sun | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/666_16-png.273610/ |
| `11036.png` | vivillon-tundra | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/666_3-png.273584/ |

### Layell (13 files)

| File | Pokémon | Evidence | Verdict | Source |
|---|---|---|---|---|
| `689.png` | barbaracle | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/689-png.293914/ |
| `700.png` | sylveon | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/700-png.274482/ |
| `10034.png` | Mega Charizard X | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/006_2-png.274409/ |
| `10035.png` | Mega Charizard Y | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/006_3-png.274411/ |
| `10045.png` | Mega Ampharos | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/181_2-png.275718/ |
| `10049.png` | Mega Tyranitar | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/248_2-png.293890/ |
| `10050.png` | Mega Blaziken | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/257_2-png.274419/ |
| `10057.png` | Mega Absol | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/359_2-png.290745/ |
| `10064.png` | Mega Swampert | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/260_2-png.275685/ |
| `10070.png` | Mega Sharpedo | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/319_2-png.274425/ |
| `10071.png` | Mega Slowbro | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/080_2-png.275673/ |
| `10078.png` | Primal Groudon | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/383_2-png.273715/ |
| `10113.png` | muk-alola | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/089-png.102480/ |

### Legitimate Username (4 files)

| File | Pokémon | Evidence | Verdict | Source |
|---|---|---|---|---|
| `706.png` | goodra | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/706-png.290771/ |
| `718.png` | zygarde | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/718_1-png.275704/ |
| `719.png` | diancie | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/719_1-png.273700/ |
| `10052.png` | Mega Mawile | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/303_2-png.293892/ |

### leParagon (225 files)

| File | Pokémon | Evidence | Verdict | Source |
|---|---|---|---|---|
| `664.png` | scatterbug | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/664-png.274439/ |
| `665.png` | spewpa | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/665-png.273579/ |
| `680.png` | doublade | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/680_2-png.300600/ |
| `715.png` | noivern | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/715-png.282255/ |
| `717.png` | yveltal | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/717-png.273692/ |
| `723.png` | dartrix | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/723-png.102272/ |
| `724.png` | decidueye | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/724-png.114744/ |
| `726.png` | torracat | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/726-png.102276/ |
| `727.png` | incineroar | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/727-png.273487/ |
| `732.png` | trumbeak | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/732-png.102280/ |
| `734.png` | yungoos | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/734-png.272342/ |
| `735.png` | gumshoos | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/735-png.173680/ |
| `737.png` | charjabug | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/737-png.102490/ |
| `739.png` | crabrawler | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/739-png.102282/ |
| `740.png` | crabominable | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/740-png.113782/ |
| `744.png` | rockruff | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/744-png.102284/ |
| `745.png` | lycanroc | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/745_1-png.102811/ |
| `746.png` | wishiwashi | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/746-png.102292/ |
| `747.png` | mareanie | near only | unproven | https://eeveeexpo.com/resources/1101/ |
| `748.png` | toxapex | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/748-png.171237/ |
| `751.png` | dewpider | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/751-png.102494/ |
| `757.png` | salandit | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/757-png.114002/ |
| `758.png` | salazzle | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/758-png.114004/ |
| `759.png` | stufful | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/759-png.102294/ |
| `765.png` | oranguru | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/765-png.102296/ |
| `766.png` | passimian | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/766-png.102496/ |
| `767.png` | wimpod | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/767-png.102498/ |
| `768.png` | golisopod | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/768-png.102298/ |
| `772.png` | type-null | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/772-png.102300/ |
| `773.png` | silvally | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/773_1-png.125062/ |
| `774.png` | minior | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/774_1-png.102500/ |
| `775.png` | komala | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/775-png.102310/ |
| `776.png` | turtonator | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/776-png.102302/ |
| `778.png` | mimikyu | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/778_1-png.116854/ |
| `779.png` | bruxish | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/779-png.102304/ |
| `780.png` | drampa | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/780-png.114006/ |
| `781.png` | dhelmise | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/781-png.170288/ |
| `783.png` | hakamo-o | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/783-png.162895/ |
| `784.png` | kommo-o | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/784-png.102306/ |
| `790.png` | cosmoem | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/790-png.114008/ |
| `791.png` | solgaleo | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/791-png.102342/ |
| `792.png` | lunala | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/792-png.169356/ |
| `794.png` | buzzwole | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/794-png.178450/ |
| `795.png` | pheromosa | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/795-png.273513/ |
| `798.png` | kartana | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/798-png.102308/ |
| `800.png` | necrozma | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/800_1-png.171239/ |
| `801.png` | magearna | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/801_1-png.114010/ |
| `802.png` | marshadow | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/802-png.114013/ |
| `803.png` | poipole | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/803-png.116841/ |
| `804.png` | naganadel | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/804-png.272395/ |
| `805.png` | stakataka | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/805-png.127507/ |
| `806.png` | blacephalon | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/806-png.273530/ |
| `807.png` | zeraora | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/807-png.127371/ |
| `808.png` | meltan | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/808-png.272399/ |
| `809.png` | melmetal | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/809-png.169520/ |
| `810.png` | grookey | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/810-png.180976/ |
| `812.png` | rillaboom | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/812-png.212825/ |
| `813.png` | scorbunny | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/813-png.180978/ |
| `815.png` | cinderace | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/815_1-png.222102/ |
| `816.png` | sobble | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/816-png.180980/ |
| `818.png` | inteleon | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/818-png.218705/ |
| `821.png` | rookidee | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/821-png.206454/ |
| `822.png` | corvisquire | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/822-png.212828/ |
| `823.png` | corviknight | near only | unproven | https://eeveeexpo.com/resources/1101/ |
| `829.png` | gossifleur | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/gossifleur-png.179547/ |
| `830.png` | eldegoss | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/830-png.212833/ |
| `833.png` | chewtle | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/833-png.206461/ |
| `834.png` | drednaw | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/drednaw-png.179211/ |
| `838.png` | carkol | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/838-png.208866/ |
| `839.png` | coalossal | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/839_1-png.222112/ |
| `841.png` | flapple | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/841_1-png.212839/ |
| `846.png` | arrokuda | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/846-png.222116/ |
| `847.png` | barraskewda | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/847-png.222118/ |
| `849.png` | toxtricity | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/849_1-png.222120/ |
| `850.png` | sizzlipede | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/850-png.218719/ |
| `854.png` | sinistea | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/854-png.222128/ |
| `855.png` | polteageist | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/855-png.222130/ |
| `857.png` | hattrem | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/857-png.218724/ |
| `858.png` | hatterene | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/858_1-png.218726/ |
| `859.png` | impidimp | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/859-png.206477/ |
| `860.png` | morgrem | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/860-png.222134/ |
| `861.png` | grimmsnarl | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/861_1-png.222136/ |
| `862.png` | obstagoon | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/862-png.243360/ |
| `863.png` | perrserker | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/863-png.218730/ |
| `864.png` | cursola | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/864-png.218732/ |
| `865.png` | sirfetchd | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/865-png.206481/ |
| `871.png` | pincurchin | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/871-png.212857/ |
| `872.png` | snom | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/872-png.208874/ |
| `873.png` | frosmoth | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/873-png.208876/ |
| `877.png` | morpeko | near only | unproven | https://eeveeexpo.com/resources/1101/ |
| `878.png` | cufant | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/878-png.212863/ |
| `884.png` | duraludon | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/duraludon-png.185093/ |
| `885.png` | dreepy | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/885-png.212871/ |
| `886.png` | drakloak | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/886-png.255113/ |
| `887.png` | dragapult | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/887-png.246213/ |
| `888.png` | zacian | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/888_2-png.218810/ |
| `889.png` | zamazenta | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/889_2-png.218812/ |
| `890.png` | eternatus | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/890_1-png.235348/ |
| `892.png` | urshifu, urshifu-single-strike | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/892_2-png.255332/ |
| `893.png` | zarude | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/zarude-png.235345/ |
| `894.png` | regieleki | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/regi-lightning-png.218815/ |
| `895.png` | regidrago | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/regidrago-png.255120/ |
| `898.png` | calyrex | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/898_1-png.284222/ |
| `951.png` | capsakid | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/951-png.779806/ |
| `10026.png` | aegislash-blade | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/681_2-png.300604/ |
| `10038.png` | Mega Gengar | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/094_2-png.275675/ |
| `10041.png` | Mega Gyarados | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/130_2-png.300580/ |
| `10042.png` | Mega Aerodactyl | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/142_2-png.275677/ |
| `10043.png` | Mega Mewtwo X | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/150_2-png.274415/ |
| `10044.png` | Mega Mewtwo Y | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/150_3-png.274417/ |
| `10046.png` | Mega Scizor | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/212_2-png.300584/ |
| `10055.png` | Mega Manectric | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/310_2-png.275688/ |
| `10056.png` | Mega Banette | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/354_2-png.290743/ |
| `10058.png` | Mega Garchomp | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/445_2-png.274431/ |
| `10059.png` | Mega Lucario | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/448_2-png.274433/ |
| `10060.png` | Mega Abomasnow | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/460_2-png.276613/ |
| `10072.png` | Mega Steelix | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/208_2-png.300582/ |
| `10073.png` | Mega Pidgeot | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/018_2-png.300576/ |
| `10075.png` | Mega Diancie | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/719_2-png.653060/ |
| `10076.png` | Mega Metagross | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/376_2-png.274429/ |
| `10079.png` | Mega Rayquaza | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/384_2-png.276609/ |
| `10080.png` | pikachu-rock-star | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/025_2-png.273724/ |
| `10081.png` | pikachu-belle | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/025_3-png.273728/ |
| `10082.png` | pikachu-pop-star | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/025_4-png.273732/ |
| `10083.png` | pikachu-phd | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/025_5-png.273736/ |
| `10084.png` | pikachu-libre | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/025_6-png.273740/ |
| `10085.png` | pikachu-cosplay | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/025_1-png.273720/ |
| `10088.png` | Mega Lopunny | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/428_2-png.300596/ |
| `10089.png` | Mega Salamence | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/373_2-png.273711/ |
| `10091.png` | rattata-alola | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/019-png.102470/ |
| `10092.png` | raticate-alola | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/020-png.102472/ |
| `10094.png` | pikachu-original-cap | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/025_7-png.272407/ |
| `10095.png` | pikachu-hoenn-cap | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/025_8-png.272411/ |
| `10096.png` | pikachu-sinnoh-cap | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/025_9-png.272415/ |
| `10097.png` | pikachu-unova-cap | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/025_10-png.272419/ |
| `10098.png` | pikachu-kalos-cap | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/025_11-png.272423/ |
| `10099.png` | pikachu-alola-cap | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/025_12-png.272427/ |
| `10100.png` | raichu-alola | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/026-png.102258/ |
| `10101.png` | sandshrew-alola | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/027-png.102260/ |
| `10102.png` | sandslash-alola | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/028-png.181192/ |
| `10103.png` | vulpix-alola | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/037-png.113992/ |
| `10104.png` | ninetales-alola | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/038_2-png.273477/ |
| `10105.png` | diglett-alola | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/050-png.102262/ |
| `10106.png` | dugtrio-alola | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/051-png.102264/ |
| `10107.png` | meowth-alola | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/052-png.113994/ |
| `10108.png` | persian-alola | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/053-png.102266/ |
| `10109.png` | geodude-alola | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/074-png.102476/ |
| `10110.png` | graveler-alola | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/075-png.116840/ |
| `10111.png` | golem-alola | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/076-png.102478/ |
| `10112.png` | grimer-alola | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/088-png.102268/ |
| `10113.png` | muk-alola | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/089-png.102480/ |
| `10114.png` | exeggutor-alola | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/103-png.113996/ |
| `10115.png` | marowak-alola | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/105-png.177819/ |
| `10120.png` | zygarde-complete | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/718-p-png.102432/ |
| `10124.png` | oricorio-pau | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/741_3-png.127365/ |
| `10126.png` | lycanroc-midnight | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/745_2-png.102288/ |
| `10127.png` | wishiwashi, wishiwashi-school | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/746_2-png.114000/ |
| `10136.png` | minior-red | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/774_2-png.102501/ |
| `10137.png` | minior-orange | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/774_5-png.114222/ |
| `10138.png` | minior-yellow | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/774_8-png.114224/ |
| `10139.png` | minior-green | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/774_3-png.114220/ |
| `10140.png` | minior-blue | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/774_2-png.114219/ |
| `10141.png` | minior-indigo | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/774_4-png.114221/ |
| `10142.png` | minior-violet | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/774_7-png.114223/ |
| `10143.png` | mimikyu-busted | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/778_2-png.116856/ |
| `10147.png` | magearna-original | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/801_2-png.114011/ |
| `10148.png` | pikachu-partner-cap | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/025_13-png.272431/ |
| `10152.png` | lycanroc-dusk | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/745_3-png.102290/ |
| `10155.png` | necrozma-dusk | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/800_2-png.272376/ |
| `10156.png` | necrozma-dawn | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/800_3-png.169358/ |
| `10157.png` | necrozma-ultra | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/800_4-png.170122/ |
| `10160.png` | pikachu-world-cap | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/025_15-png.266706/ |
| `10161.png` | meowth-galar | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/052_3-png.206442/ |
| `10164.png` | slowpoke-galar | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/079_2-png.246179/ |
| `10165.png` | slowbro-galar | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/080_3-png.255073/ |
| `10167.png` | weezing-galar | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/110_2-png.189640/ |
| `10168.png` | mr-mime-galar | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/122_2-png.218701/ |
| `10170.png` | zapdos-galar | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/145_2-png.284185/ |
| `10172.png` | slowking-galar | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/199_2-png.284255/ |
| `10173.png` | corsola-galar | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/222_2-png.212821/ |
| `10174.png` | zigzagoon-galar | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/263_2-png.206448/ |
| `10180.png` | stunfisk-galar | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/618_2-png.208845/ |
| `10181.png` | zygarde-10 | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/718-d-png.113263/ |
| `10182.png` | cramorant-gulping | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/845_2-png.218715/ |
| `10187.png` | morpeko-hangry | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/877_2-png.206486/ |
| `10188.png` | zacian-crowned | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/zacian-png.178831/ |
| `10189.png` | zamazenta-crowned | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/889_1-png.222161/ |
| `10190.png` | eternatus-eternamax | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/890_g-png.212878/ |
| `10191.png` | urshifu-rapid-strike | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/urshifu-rapid-png.235343/ |
| `10192.png` | zarude-dada | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/893_2-png.266191/ |
| `10195.png` | Gigantamax Venusaur | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/003_g-png.235307/ |
| `10196.png` | Gigantamax Charizard | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/006_g-png.255065/ |
| `10197.png` | Gigantamax Blastoise | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/009_g-png.255290/ |
| `10199.png` | Gigantamax Pikachu | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/025_g-png.255069/ |
| `10201.png` | Gigantamax Machamp | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/068_g-png.255071/ |
| `10202.png` | Gigantamax Gengar | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/094_g-png.212815/ |
| `10203.png` | Gigantamax Kingler | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/099_g-png.255074/ |
| `10204.png` | Gigantamax Lapras | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/131_g-png.255076/ |
| `10205.png` | Gigantamax Eevee | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/133_g-png.255078/ |
| `10206.png` | Gigantamax Snorlax | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/143_g-png.222092/ |
| `10207.png` | Gigantamax Garbodor | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/569_g-png.255082/ |
| `10208.png` | Gigantamax Melmetal | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/809_g-png.255084/ |
| `10209.png` | Gigantamax Rillaboom | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/812_g-png.267922/ |
| `10210.png` | Gigantamax Cinderace | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/815_g-png.267592/ |
| `10211.png` | Gigantamax Inteleon | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/818_g-png.267591/ |
| `10212.png` | Gigantamax Corviknight | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/823_g-png.269836/ |
| `10214.png` | Gigantamax Drednaw | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/834_g-png.255090/ |
| `10215.png` | Gigantamax Coalossal | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/839_g-png.255092/ |
| `10216.png` | Gigantamax Flapple | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/841-842_g-png.255096/ |
| `10217.png` | Gigantamax Appletun | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/841-842_g-png.255096/ |
| `10219.png` | Gigantamax Toxtricity | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/849_g-png.222124/ |
| `10221.png` | Gigantamax Hatterene | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/858_g-png.255104/ |
| `10222.png` | Gigantamax Grimmsnarl | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/861_g-png.255106/ |
| `10223.png` | Gigantamax Alcremie | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/869_g-png.255109/ |
| `10225.png` | Gigantamax Duraludon | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/884_g-png.255111/ |
| `11001.png` | xerneas-neutral | near only | unproven | https://www.smogon.com/forums/attachments/716_2-png.274485/ |
| `11109.png` | solgaleo-radiant-sun | near only | unproven | https://www.smogon.com/forums/attachments/791_2-png.272364/ |
| `11110.png` | lunala-full-moon | near only | unproven | https://www.smogon.com/forums/attachments/792_2-png.272370/ |
| `11111.png` | marshadow-zenith | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/802_2-png.272391/ |
| `alcremie-berry.png` | alcremie-berry | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/869_2-png.218738/ |
| `alcremie-clover.png` | alcremie-clover | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/869_5-png.218744/ |
| `alcremie-flower.png` | alcremie-flower | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/869_6-png.218746/ |
| `alcremie-love.png` | alcremie-love | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/869_3-png.218740/ |
| `alcremie-ribbon.png` | alcremie-ribbon | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/869_7-png.218748/ |
| `alcremie-star.png` | alcremie-star | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/869_4-png.218742/ |

### Mintly (5 files)

| File | Pokémon | Evidence | Verdict | Source |
|---|---|---|---|---|
| `934.png` | garganacl | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/934-png.629247/ |
| `948.png` | toedscool | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/948-png.629249/ |
| `1000.png` | gholdengo | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/1000-png.536978/ |
| `1010.png` | iron-leaves | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/1010-png.512428/ |
| `1022.png` | iron-boulder | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/1022-png.779834/ |

### mjco (1 files)

| File | Pokémon | Evidence | Verdict | Source |
|---|---|---|---|---|
| `851.png` | centiskorch | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/851_1-png.212851/ |

### MrDollSteak (1 files)

| File | Pokémon | Evidence | Verdict | Source |
|---|---|---|---|---|
| `10038.png` | Mega Gengar | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/094_2-png.275675/ |

### MyMarshlands (2 files)

| File | Pokémon | Evidence | Verdict | Source |
|---|---|---|---|---|
| `727.png` | incineroar | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/727-png.273487/ |
| `10279.png` | Mega Victreebel | PokéAPI README | confirmed | https://github.com/PokeAPI/sprites/blob/4bc9d60186fe2e499ee2f3d4d1b796806cb99a67/sprites/pokemon/10279.png |

### N-Kin (17 files)

| File | Pokémon | Evidence | Verdict | Source |
|---|---|---|---|---|
| `652.png` | chesnaught | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/652-png.293902/ |
| `653.png` | fennekin | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/653-png.273560/ |
| `674.png` | pancham | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/674-png.273637/ |
| `681.png` | aegislash | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/681_1-png.300602/ |
| `688.png` | binacle | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/688-png.293910/ |
| `691.png` | dragalge | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/691-png.293916/ |
| `697.png` | tyrantrum | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/697-png.276694/ |
| `709.png` | trevenant | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/709-png.293924/ |
| `711.png` | gourgeist | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/711_1-png.293926/ |
| `716.png` | xerneas | near only | unproven | https://www.smogon.com/forums/attachments/716_1-png.273690/ |
| `721.png` | volcanion | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/721-png.273701/ |
| `722.png` | rowlet | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/722-png.102484/ |
| `725.png` | litten | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/725-png.102486/ |
| `728.png` | popplio | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/728-png.102488/ |
| `10026.png` | aegislash-blade | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/681_2-png.300604/ |
| `10036.png` | Mega Blastoise | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/009_2-png.276604/ |
| `11001.png` | xerneas-neutral | near only | unproven | https://www.smogon.com/forums/attachments/716_2-png.274485/ |

### Noscium (3 files)

| File | Pokémon | Evidence | Verdict | Source |
|---|---|---|---|---|
| `718.png` | zygarde | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/718_1-png.275704/ |
| `10035.png` | Mega Charizard Y | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/006_3-png.274411/ |
| `10037.png` | Mega Alakazam | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/065_2-png.274413/ |

### paintseagull (1 files)

| File | Pokémon | Evidence | Verdict | Source |
|---|---|---|---|---|
| `672.png` | skiddo | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/672-png.276688/ |

### princessofmusic (25 files)

| File | Pokémon | Evidence | Verdict | Source |
|---|---|---|---|---|
| `662.png` | fletchinder | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/662-png.290756/ |
| `703.png` | carbink | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/703-png.273682/ |
| `707.png` | klefki | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/707-png.284242/ |
| `730.png` | primarina | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/730-png.102278/ |
| `731.png` | pikipek | Smogon post | confirmed | https://www.smogon.com/forums/attachments/pikipek-png.71601/ |
| `742.png` | cutiefly | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/742-png.128453/ |
| `761.png` | bounsweet | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/761-png.116867/ |
| `762.png` | steenee | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/762-png.178628/ |
| `769.png` | sandygast | near only | unproven | https://eeveeexpo.com/resources/1101/ |
| `770.png` | palossand | near only | unproven | https://eeveeexpo.com/resources/1101/ |
| `771.png` | pyukumuku | near only | unproven | https://eeveeexpo.com/resources/1101/ |
| `10061.png` | floette-eternal | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/670_6-png.276664/ |
| `10123.png` | oricorio-pom-pom | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/741_2-png.127364/ |
| `11082.png` | flabebe-blue | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/669_3-png.276632/ |
| `11083.png` | flabebe-orange | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/669_4-png.276636/ |
| `11084.png` | flabebe-white | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/669_5-png.276640/ |
| `11085.png` | flabebe-yellow | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/669_2-png.276628/ |
| `11086.png` | floette-blue | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/670_3-png.276652/ |
| `11087.png` | floette-orange | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/670_4-png.276656/ |
| `11088.png` | floette-white | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/670_5-png.276660/ |
| `11089.png` | floette-yellow | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/670_2-png.276648/ |
| `11090.png` | florges-blue | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/671_3-png.276676/ |
| `11091.png` | florges-orange | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/671_4-png.276680/ |
| `11092.png` | florges-white | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/671_5-png.276684/ |
| `11093.png` | florges-yellow | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/671_2-png.276672/ |

### PumpkinPastel (7 files)

| File | Pokémon | Evidence | Verdict | Source |
|---|---|---|---|---|
| `alcremie-berry.png` | alcremie-berry | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/869_2-png.218738/ |
| `alcremie-clover.png` | alcremie-clover | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/869_5-png.218744/ |
| `alcremie-flower.png` | alcremie-flower | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/869_6-png.218746/ |
| `alcremie-love.png` | alcremie-love | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/869_3-png.218740/ |
| `alcremie-ribbon.png` | alcremie-ribbon | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/869_7-png.218748/ |
| `alcremie-star.png` | alcremie-star | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/869_4-png.218742/ |
| `alcremie-strawberry.png` | alcremie | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/869_1-png.218736/ |

### Quanyails (11 files)

| File | Pokémon | Evidence | Verdict | Source |
|---|---|---|---|---|
| `655.png` | delphox | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/655-png.293904/ |
| `656.png` | froakie | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/656-png.273566/ |
| `677.png` | espurr | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/677-png.273643/ |
| `679.png` | honedge | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/679_2-png.284236/ |
| `692.png` | clauncher | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/692-png.273667/ |
| `695.png` | heliolisk | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/695-png.293922/ |
| `706.png` | goodra | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/706-png.290771/ |
| `714.png` | noibat | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/714-png.275702/ |
| `10057.png` | Mega Absol | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/359_2-png.290745/ |
| `10063.png` | Mega Latios | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/381_2-png.275694/ |
| `10086.png` | hoopa-unbound | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/720_2-png.282257/ |

### RadicalCharizard (8 files)

| File | Pokémon | Evidence | Verdict | Source |
|---|---|---|---|---|
| `872.png` | snom | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/872-png.208874/ |
| `10172.png` | slowking-galar | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/199_2-png.284255/ |
| `alcremie-berry.png` | alcremie-berry | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/869_2-png.218738/ |
| `alcremie-clover.png` | alcremie-clover | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/869_5-png.218744/ |
| `alcremie-flower.png` | alcremie-flower | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/869_6-png.218746/ |
| `alcremie-love.png` | alcremie-love | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/869_3-png.218740/ |
| `alcremie-ribbon.png` | alcremie-ribbon | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/869_7-png.218748/ |
| `alcremie-star.png` | alcremie-star | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/869_4-png.218742/ |

### RedRooster (6 files)

| File | Pokémon | Evidence | Verdict | Source |
|---|---|---|---|---|
| `660.png` | diggersby | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/660-png.293908/ |
| `678.png` | meowstic | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/678m-png.273648/ |
| `689.png` | barbaracle | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/689-png.293914/ |
| `711.png` | gourgeist | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/711_1-png.293926/ |
| `10037.png` | Mega Alakazam | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/065_2-png.274413/ |
| `10047.png` | Mega Heracross | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/214_2-png.300586/ |

### Siiilver (1 files)

| File | Pokémon | Evidence | Verdict | Source |
|---|---|---|---|---|
| `673.png` | gogoat | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/673-png.284246/ |

### Sleet (4 files)

| File | Pokémon | Evidence | Verdict | Source |
|---|---|---|---|---|
| `682.png` | spritzee | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/682-png.273651/ |
| `690.png` | skrelp | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/690-png.273663/ |
| `712.png` | bergmite | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/712-png.273689/ |
| `10090.png` | Mega Beedrill | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/015_2-png.300574/ |

### SpheX (19 files)

| File | Pokémon | Evidence | Verdict | Source |
|---|---|---|---|---|
| `918.png` | spidops | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/918-png.573994/ |
| `936.png` | armarouge | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/936-png.603581/ |
| `938.png` | tadbulb | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/938-png.536954/ |
| `939.png` | bellibolt | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/939-png.603585/ |
| `976.png` | veluza | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/976-png.732402/ |
| `979.png` | annihilape | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/979-png.492557/ |
| `995.png` | iron-thorns | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/995-png.512418/ |
| `996.png` | frigibax | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/996-png.512420/ |
| `997.png` | arctibax | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/997-png.574006/ |
| `998.png` | baxcalibur | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/998-png.629259/ |
| `1002.png` | chien-pao | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/1002_1-png.574008/ |
| `1004.png` | chi-yu | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/1004-png.603599/ |
| `1006.png` | iron-valiant | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/1006-png.536982/ |
| `1008.png` | miraidon | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/1008-png.492565/ |
| `1009.png` | walking-wake | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/1009-png.779830/ |
| `1025.png` | pecharunt | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/1025-png.653106/ |
| `10250.png` | tauros-paldea-combat | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/128_1-png.573990/ |
| `10251.png` | tauros-paldea-blaze | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/128_2-png.603575/ |
| `10252.png` | tauros-paldea-aqua | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/128_3-png.603577/ |

### Spook (2 files)

| File | Pokémon | Evidence | Verdict | Source |
|---|---|---|---|---|
| `838.png` | carkol | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/838-png.208866/ |
| `839.png` | coalossal | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/839_1-png.222112/ |

### TeraVolt (1 files)

| File | Pokémon | Evidence | Verdict | Source |
|---|---|---|---|---|
| `10048.png` | Mega Houndoom | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/229_2-png.275683/ |

### The Cynical Poet (9 files)

| File | Pokémon | Evidence | Verdict | Source |
|---|---|---|---|---|
| `667.png` | litleo | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/667-png.273620/ |
| `752.png` | araquanid | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/752-png.141996/ |
| `10065.png` | Mega Sceptile | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/254_2-png.300590/ |
| `10067.png` | Mega Altaria | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/334_2-png.275690/ |
| `10071.png` | Mega Slowbro | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/080_2-png.275673/ |
| `11082.png` | flabebe-blue | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/669_3-png.276632/ |
| `11083.png` | flabebe-orange | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/669_4-png.276636/ |
| `11084.png` | flabebe-white | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/669_5-png.276640/ |
| `11085.png` | flabebe-yellow | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/669_2-png.276628/ |

### Tooni (2 files)

| File | Pokémon | Evidence | Verdict | Source |
|---|---|---|---|---|
| `974.png` | cetoddle | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/974-png.653082/ |
| `985.png` | scream-tail | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/985-png.629255/ |

### TrainerSplash (3 files)

| File | Pokémon | Evidence | Verdict | Source |
|---|---|---|---|---|
| `10065.png` | Mega Sceptile | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/254_2-png.300590/ |
| `10066.png` | Mega Sableye | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/302_2-png.274423/ |
| `10086.png` | hoopa-unbound | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/720_2-png.282257/ |

### Travis (21 files)

| File | Pokémon | Evidence | Verdict | Source |
|---|---|---|---|---|
| `904.png` | overqwil | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/904-png.420748/ |
| `912.png` | quaxly | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/912-png.492533/ |
| `924.png` | tandemaus | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/924-png.492541/ |
| `925.png` | maushold | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/925-png.492543/ |
| `932.png` | nacli | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/932-png.512402/ |
| `955.png` | flittle | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/955-png.779810/ |
| `956.png` | espathra | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/956-png.779812/ |
| `957.png` | tinkatink | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/957-png.732396/ |
| `958.png` | tinkatuff | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/958-png.732398/ |
| `959.png` | tinkaton | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/959-png.732400/ |
| `963.png` | finizen | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/963-png.603591/ |
| `964.png` | palafin | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/964-png.603593/ |
| `968.png` | orthworm | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/968-png.573998/ |
| `990.png` | iron-treads | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/990-png.574004/ |
| `1011.png` | dipplin | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/1011-png.653086/ |
| `1013.png` | sinistcha | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/1013-png.732404/ |
| `10229.png` | growlithe-hisui | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/058_1-png.420718/ |
| `10241.png` | sliggoo-hisui | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/705_1-png.420733/ |
| `10242.png` | goodra-hisui | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/706_1-png.420739/ |
| `10256.png` | palafin | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/964-png.536964/ |
| `11004.png` | palafin-hero | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/964-png.536964/ |

### Wobblebuns (19 files)

| File | Pokémon | Evidence | Verdict | Source |
|---|---|---|---|---|
| `659.png` | bunnelby | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/659-png.276615/ |
| `666.png` | vivillon | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/666_1-png.273580/ |
| `684.png` | swirlix | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/684-png.273655/ |
| `694.png` | helioptile | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/694-png.293918/ |
| `701.png` | hawlucha | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/701-png.273676/ |
| `708.png` | phantump | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/708-png.290774/ |
| `710.png` | pumpkaboo | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/710-png.273685/ |
| `729.png` | brionne | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/729-png.272336/ |
| `736.png` | grubbin | near only | unproven | https://eeveeexpo.com/resources/1101/ |
| `749.png` | mudbray | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/749-png.169989/ |
| `753.png` | fomantis | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/753-png.128457/ |
| `754.png` | lurantis | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/754-png.128459/ |
| `763.png` | tsareena | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/763-png.128485/ |
| `782.png` | jangmo-o | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/782-png.173937/ |
| `10039.png` | Mega Kangaskhan | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/115_2-png.273703/ |
| `10051.png` | Mega Gardevoir | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/282_2-png.274421/ |
| `10054.png` | Mega Medicham | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/308_2-png.293894/ |
| `10069.png` | Mega Audino | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/531_2-png.275696/ |
| `10125.png` | oricorio-sensu | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/741_4-png.127366/ |

### WPS (1 files)

| File | Pokémon | Evidence | Verdict | Source |
|---|---|---|---|---|
| `10087.png` | Mega Camerupt | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/323_2-png.274427/ |

### Wyverii (5 files)

| File | Pokémon | Evidence | Verdict | Source |
|---|---|---|---|---|
| `661.png` | fletchling | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/661-png.276619/ |
| `663.png` | talonflame | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/663-png.273574/ |
| `672.png` | skiddo | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/672-png.276688/ |
| `682.png` | spritzee | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/682-png.273651/ |
| `10045.png` | Mega Ampharos | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/181_2-png.275718/ |

### Z-nogyroP (3 files)

| File | Pokémon | Evidence | Verdict | Source |
|---|---|---|---|---|
| `855.png` | polteageist | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/855-png.222130/ |
| `965.png` | varoom | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/965-png.779814/ |
| `966.png` | revavroom | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/966-png.779816/ |

### Zermonious (1 files)

| File | Pokémon | Evidence | Verdict | Source |
|---|---|---|---|---|
| `686.png` | inkay | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/686-png.273661/ |

### Zerudez (1 files)

| File | Pokémon | Evidence | Verdict | Source |
|---|---|---|---|---|
| `724.png` | decidueye | Smogon sheet | confirmed | https://www.smogon.com/forums/attachments/724-png.114744/ |

### (no artist named) (49 files)

| File | Pokémon | Evidence | Verdict | Source |
|---|---|---|---|---|
| `668.png` | pyroar | none | unproven | https://www.smogon.com/forums/attachments/668m-png.282237/ |
| `669.png` | flabebe | none | unproven | https://www.smogon.com/forums/attachments/669_1-png.276624/ |
| `670.png` | floette | none | unproven | https://www.smogon.com/forums/attachments/670_1-png.276644/ |
| `671.png` | florges | none | unproven | https://www.smogon.com/forums/attachments/671_5-png.276684/ |
| `676.png` | furfrou | none | unproven | https://eeveeexpo.com/resources/1101/ |
| `733.png` | toucannon | none | unproven | https://eeveeexpo.com/resources/1101/ |
| `743.png` | ribombee | none | unproven | https://eeveeexpo.com/resources/1101/ |
| `760.png` | bewear | none | unproven | https://eeveeexpo.com/resources/1101/ |
| `764.png` | comfey | none | unproven | https://eeveeexpo.com/resources/1101/ |
| `789.png` | cosmog | none | unproven | https://eeveeexpo.com/resources/1101/ |
| `10001.png` | deoxys-attack | none | unproven | https://github.com/PokeAPI/sprites/blob/0dc105d5b12416932f29b594078282ab4be045f5/sprites/pokemon/versions/generation-v/black-white/10001.png |
| `10002.png` | deoxys-defense | none | unproven | https://github.com/PokeAPI/sprites/blob/0dc105d5b12416932f29b594078282ab4be045f5/sprites/pokemon/versions/generation-v/black-white/10002.png |
| `10003.png` | deoxys-speed | none | unproven | https://github.com/PokeAPI/sprites/blob/0dc105d5b12416932f29b594078282ab4be045f5/sprites/pokemon/versions/generation-v/black-white/10003.png |
| `10004.png` | wormadam-sandy | none | unproven | https://github.com/PokeAPI/sprites/blob/0dc105d5b12416932f29b594078282ab4be045f5/sprites/pokemon/versions/generation-v/black-white/10004.png |
| `10005.png` | wormadam-trash | none | unproven | https://github.com/PokeAPI/sprites/blob/0dc105d5b12416932f29b594078282ab4be045f5/sprites/pokemon/versions/generation-v/black-white/10005.png |
| `10006.png` | shaymin-sky | none | unproven | https://github.com/PokeAPI/sprites/blob/0dc105d5b12416932f29b594078282ab4be045f5/sprites/pokemon/versions/generation-v/black-white/10006.png |
| `10007.png` | giratina-origin | none | unproven | https://github.com/PokeAPI/sprites/blob/0dc105d5b12416932f29b594078282ab4be045f5/sprites/pokemon/versions/generation-v/black-white/10007.png |
| `10008.png` | rotom-heat | none | unproven | https://github.com/PokeAPI/sprites/blob/0dc105d5b12416932f29b594078282ab4be045f5/sprites/pokemon/versions/generation-v/black-white/10008.png |
| `10009.png` | rotom-wash | none | unproven | https://github.com/PokeAPI/sprites/blob/0dc105d5b12416932f29b594078282ab4be045f5/sprites/pokemon/versions/generation-v/black-white/10009.png |
| `10010.png` | rotom-frost | none | unproven | https://github.com/PokeAPI/sprites/blob/0dc105d5b12416932f29b594078282ab4be045f5/sprites/pokemon/versions/generation-v/black-white/10010.png |
| `10011.png` | rotom-fan | none | unproven | https://github.com/PokeAPI/sprites/blob/0dc105d5b12416932f29b594078282ab4be045f5/sprites/pokemon/versions/generation-v/black-white/10011.png |
| `10012.png` | rotom-mow | none | unproven | https://github.com/PokeAPI/sprites/blob/0dc105d5b12416932f29b594078282ab4be045f5/sprites/pokemon/versions/generation-v/black-white/10012.png |
| `10013.png` | castform-sunny | none | unproven | https://github.com/PokeAPI/sprites/blob/0dc105d5b12416932f29b594078282ab4be045f5/sprites/pokemon/versions/generation-v/black-white/10013.png |
| `10014.png` | castform-rainy | none | unproven | https://github.com/PokeAPI/sprites/blob/0dc105d5b12416932f29b594078282ab4be045f5/sprites/pokemon/versions/generation-v/black-white/10014.png |
| `10015.png` | castform-snowy | none | unproven | https://github.com/PokeAPI/sprites/blob/0dc105d5b12416932f29b594078282ab4be045f5/sprites/pokemon/versions/generation-v/black-white/10015.png |
| `10016.png` | basculin-blue-striped | none | unproven | https://github.com/PokeAPI/sprites/blob/0dc105d5b12416932f29b594078282ab4be045f5/sprites/pokemon/versions/generation-v/black-white/10016.png |
| `10017.png` | darmanitan (archetype 'static-encounter' art), darmanitan-zen | none | unproven | https://github.com/PokeAPI/sprites/blob/0dc105d5b12416932f29b594078282ab4be045f5/sprites/pokemon/versions/generation-v/black-white/10017.png |
| `10018.png` | meloetta-pirouette | none | unproven | https://github.com/PokeAPI/sprites/blob/0dc105d5b12416932f29b594078282ab4be045f5/sprites/pokemon/versions/generation-v/black-white/10018.png |
| `10019.png` | tornadus-therian | none | unproven | https://github.com/PokeAPI/sprites/blob/0dc105d5b12416932f29b594078282ab4be045f5/sprites/pokemon/versions/generation-v/black-white/10019.png |
| `10020.png` | thundurus-therian | none | unproven | https://github.com/PokeAPI/sprites/blob/0dc105d5b12416932f29b594078282ab4be045f5/sprites/pokemon/versions/generation-v/black-white/10020.png |
| `10021.png` | landorus-therian | none | unproven | https://github.com/PokeAPI/sprites/blob/0dc105d5b12416932f29b594078282ab4be045f5/sprites/pokemon/versions/generation-v/black-white/10021.png |
| `10022.png` | kyurem-black | none | unproven | https://github.com/PokeAPI/sprites/blob/0dc105d5b12416932f29b594078282ab4be045f5/sprites/pokemon/versions/generation-v/black-white/10022.png |
| `10023.png` | kyurem-white | none | unproven | https://github.com/PokeAPI/sprites/blob/0dc105d5b12416932f29b594078282ab4be045f5/sprites/pokemon/versions/generation-v/black-white/10023.png |
| `10024.png` | keldeo-resolute | none | unproven | https://github.com/PokeAPI/sprites/blob/0dc105d5b12416932f29b594078282ab4be045f5/sprites/pokemon/versions/generation-v/black-white/10024.png |
| `10025.png` | meowstic-female | none | unproven | https://www.smogon.com/forums/attachments/678f-png.273647/ |
| `10068.png` | Mega Gallade | none | unproven | https://eeveeexpo.com/resources/1101/ |
| `10301.png` | Mega Zygarde | repository | confirmed |  |
| `11064.png` | pichu-spiky-eared | none | unproven | https://play.pokemonshowdown.com/sprites/gen5/pichu-spikyeared.png |
| `11096.png` | furfrou-heart | none | unproven | https://eeveeexpo.com/resources/1101/ |
| `11097.png` | furfrou-star | none | unproven | https://eeveeexpo.com/resources/1101/ |
| `11098.png` | furfrou-diamond | none | unproven | https://eeveeexpo.com/resources/1101/ |
| `11099.png` | furfrou-debutante | none | unproven | https://eeveeexpo.com/resources/1101/ |
| `11100.png` | furfrou-matron | none | unproven | https://eeveeexpo.com/resources/1101/ |
| `11101.png` | furfrou-dandy | none | unproven | https://eeveeexpo.com/resources/1101/ |
| `11102.png` | furfrou-la-reine | none | unproven | https://eeveeexpo.com/resources/1101/ |
| `11103.png` | furfrou-kabuki | none | unproven | https://eeveeexpo.com/resources/1101/ |
| `11104.png` | furfrou-pharaoh | none | unproven | https://eeveeexpo.com/resources/1101/ |
| `11107.png` | kyurem-black-overdrive | none | unproven |  |
| `11108.png` | kyurem-white-overdrive | none | unproven |  |

## October 16 PokéAPI form sourcing

[The 50-form comparison](pokeapi-form-sources.json) records the pinned source paths and hashes. Forty-eight existing files match in visible pixels. Spiky-eared Pichu (11064) and female Pyroar (11071) now use the PokéAPI files. Individual authorship of both replacements is unproven; the former Pyroar artist attribution applies only to the previous file. Their current hashes and historical evidence are in the JSON ledger. The Smogon project credit and non-profit terms remain in the panel; its separate Showdown source entry is removed.

## KingOfThe-X-Roads originals imported on 2026-10-17

Four byte-identical native 96×96 originals are direct uploads. The three picker-only additions use IDs 11117–11119. Mega Raichu X replaces ID 10304 in both the Picker and League, with a cache revision. Mega Raichu Y retains its bundle credit. The prior X evidence remains in `docs/favorite-picker-work/sprites/2026-10-17-king-originals/previous-mega-raichu-x-evidence.json`. The JSON ledger contains the current hashes and sources.

## kiriaura originals imported on 2026-10-19

Two picker-only additions use kiriaura's own DeviantArt uploads: Mosslax (11120) and Peakychu (11121). Each original is smaller than 96×96, so its whole canvas sits on a transparent 96×96 canvas without resize, recolor, or mirror. The art is centered on the base sprite's ink and stands on that sprite's bottom edge: offset (1, 7) for Mosslax on Snorlax (143), and (28, 26) for Peakychu on Pikachu (25). The JSON ledger contains the current hashes and sources.

## Purple Kecleon added on 2026-10-19

Purple Kecleon (11122) is a picker-only appearance. The file is my151's palette recolor of the app's Game Freak Kecleon (352): the same indexed 96×96 canvas, every pixel on its palette index, and 10 palette slots changed to the Mystery Dungeon purple Kecleon colors. It has no credit and no Acknowledgements entry, because the art is Game Freak's (Michael, 2026-10-13). The ledger row is `repository-history`. Provenance: `docs/favorite-picker-work/sprites/2026-10-19-purple-kecleon/provenance.json`.

## Picker forms added on 2026-10-20

Five picker-only appearances, each a byte copy of the sprite-lab selection Michael approved. Provenance: `docs/favorite-picker-work/sprites/2026-10-20-picker-forms/provenance.json`.

- Shadow Lugia (11123) and Primal Dialga (11124) are JoeTEStrikesBack's own DeviantArt sheet, kept in the same folder (sha256 `de3c8d5c…`), with my151's recorded changes: 229 pixels on Shadow Lugia (21 background pixels made transparent, the pupil made red, 207 top-edge outline pixels lightened) and 8 background pixels on Primal Dialga. The rows carry `"changedBy": "my151"`. JoeTEStrikesBack's credit entry lists both sprites and does not mention the changes (Michael, 2026-10-20). Shadowgate31 is not credited: their outline colours are only in a variant the app does not use.
- Tinkmaster (11125) is Travis's Tinkaton (959) pixel for pixel in the body, with tools that my151 added. The tools come from the sprite lab's family edit, an image-model edit of 959.png, and code-only hand edits. Because of the model-drawn tools, the panel gives it no credit and no count, like the lab's own drawings (Michael, 2026-10-20). The row says `"creditedVia": "my151"` and carries `"changedBy": "my151"`.
- Professor Tangrowth (11126) is the sprite lab's own drawing from the app's Game Freak Tangrowth (465) and official Pokopia art. It has no credit and no Acknowledgements entry (Michael, 2026-10-13).
- Chef Dente (11127) is G.E.Z.'s Greedent (820) as the base, with a pot hat, neckerchief, ladle, pan, whisk and spatula that my151 added from the sprite lab's drawings of official Pokopia art. Because of the lab-drawn items, the panel gives it no credit and no count, like the lab's own drawings (Michael, 2026-10-20). The row says `"creditedVia": "my151"` and carries `"changedBy": "my151"`.

## Cherrim Sunshine Form added on 2026-10-20

Cherrim (Sunshine Form) (11128) is a picker-only battle form. The file is byte-identical to PokéAPI's `sprites/pokemon/versions/generation-v/black-white/421-sunshine.png`, which came in the Black and White import (96c282e, 2020-08-01); the parent commit has no such file, and the bytes are the same at 0dc105d and at the pinned ba40397. It is Game Freak's sprite, so it has no credit and no Acknowledgements entry.

## Shiny sprites added on 2026-10-25

The Favorite Pokémon Picker and the league builder show 1,396 shiny files when their Shiny switch is on: 1,395 in the picker and 1,326 in the league builder. The Pokédex builder already showed five of them through archetypes. Each file has a row in the JSON ledger. The rules are in [How my151 credits sprites](README.md#shiny-sprites).

| Count | Evidence type |
|---:|---|
| 693 | Game Freak shiny: exact match to PokéAPI's Black and White shiny; two are frames of its shiny Overdrive animations |
| 577 | Exact match to the Front shiny attachment of the Smogon sheet row that credits the shiny |
| 40 | Pixels of the PokéAPI shiny added in the commit whose README line credits Kyle Dove for the Z-A Mega sprites |
| 10 | Same pixels as the shiny that KingOfThe-X-Roads posted on Sta.sh |
| 8 | Same pixels as the Generation 9 pack shiny on the sheet row that names the artist |
| 17 | Pinned source identified; no source names the shiny's artist |
| 51 | Artist not confirmed; follows its normal sprite |

Under the [credit rule of 2026-10-26](README.md#shiny-sprites), the panel counts 85 of these files on their own. Each is an exact match to a Smogon sheet row that names a "(shiny)" artist who did not draw the normal sprite. The normal sprite's credit covers the other 1,311 files, which the bundles do not count. They include the five Game Freak shinies that the Pokédex builder already showed, so the panel's count of official sprites from PokéAPI goes from 700 to 695.

| Files | Shiny artist |
|---:|---|
| 75 | TheAetherPlayer |
| 3 | AMVictory |
| 3 | leParagon |
| 2 | G.E.Z. |
| 1 | arinoelle |
| 1 | Mega-Pokebattlerz |

Four artists appear only through shiny files: TheAetherPlayer, AMVictory, arinoelle, and Mega-Pokebattlerz.
