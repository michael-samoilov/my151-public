# How my151 credits sprites

Historical captures and commands are in this folder's Git history.

The Acknowledgements panel credits sprites through the bundles they came from. It names a sprite artist only when my151 took that artist's sprites from them directly. The panel calls these groups “Sprite projects” and “Additional sprites”. An additional artist’s direct-upload list supplements the artwork credited through the projects above.

## The policy

Michael set it on 2026-10-13. The panel credits sprites through the bundles they came from, under each bundle's own permission, as other users of these bundles do. Each bundle's pages credit its artists. The panel credits an artist separately only when my151 took the artist's sprites from the artist directly, not from a bundle.

## What counts as a bundle

A bundle is a published collection that my151 took sprite files from, and that credits its own artists on its own pages:

| Bundle | Where it credits its artists |
|---|---|
| PokéAPI sprites | Its GitHub repository and the README credits |
| Generation 9 Resource Pack | Its Eevee Expo resource page and its sprite sheet |
| Smogon Sprite Project | Its three project threads and their credit sheets |

The Smogon Sprite Project contributed fan sprites distributed through PokéAPI. Its terms ask users to credit "the spriter or the project itself", so crediting the project meets them.

The 50 form sprites previously mapped to Showdown now map to a pinned PokéAPI commit. Forty-eight match the existing visible pixels; Spiky-eared Pichu and female Pyroar use the PokéAPI variants. [The comparison](pokeapi-form-sources.json) records every path and hash. The importer downloads from PokéAPI. Historical source and artist evidence remains in the ledger. This does not claim that changing the download source overrides the artists’ terms.

Each bundle entry in the panel shows one permission quote from the bundle's own page, the bundle's links, and an "Artists" list. It does not list the sprites. Michael asked for the list on 2026-10-19: rank each project's artists by the sprites they contributed, link a relevant page, use only reliable data, and keep the credits MECE.

## The artist lists

`npm run credits:bundles` (`scripts/credits/bundle-credits.ts`) writes `src/data/bundleCredits.json` from the ledger and `src/data/spriteAttribution.json`. `npm run credits:check-sprites` fails when that file is out of date, or when the counts stop being a partition.

- Every shown fan-made sprite file counts under exactly one entry. A direct upload counts under its artist's own entry. Any other file counts under the bundle whose records credit its artist: the Smogon Sprite Project for its four credit sheets (whether the file came through PokéAPI or not), PokéAPI for its own README credits, or the Generation 9 Resource Pack for its sheet. Fan-made files with no attribution row came from PokéAPI's files, so they count under PokéAPI.
- Game Freak's sprites, the two Kyurem Overdrive stills (Game Freak's animation frames), and every `"via": "my151"` file count nowhere: Purple Kecleon, Professor Tangrowth, and Ukulele Pichu. Mega Zygarde was the sprite lab's drawing until 2026-10-29, when Caruban's Generation 9 Resource Pack sprite replaced it.
- An artist counts a file only when the ledger's verdict is `confirmed`. Every other file counts under its entry as "Artist not confirmed". A file with two artists counts for each of them.
- An artist's name links only to a profile whose `linkStatus` in `creditTerms.json` is `proven`, never to a Smogon member page. No artist's terms are quoted: the bundle's permission covers the files it carried.
- A direct-upload artist's own files appear only in their own entry. That entry also lists the bundles that credit them, with the count from each.
- A bundle entry shows its links and its license before its artists, and it lists every artist (Michael, 2026-10-20).

## What PokéAPI delivers

Michael asked on 2026-10-20 for PokéAPI's "Used for" to say how many official sprites and other sprites the app takes from PokéAPI, and then how many fan-made sprites it credits through PokéAPI itself. The Smogon Sprite Project still counts each of its sprites once in its own artist list. PokéAPI's text states only what it delivers.

`scripts/credits/pokeapi-delivery.py` writes `docs/credits/pokeapi-delivery.json`. A shown file counts as delivered when its pixels equal a PNG in PokéAPI's sprites repository: any PNG under `sprites/pokemon` at the pinned commit in `pokeapi-form-sources.json`, or an earlier version of the file at the same path. The comparison is the ledger's own: RGBA after the transparent margins are trimmed. The script header lists the clone commands; the run needs the network once. `npm run credits:check-sprites` fails when a Game Freak, Smogon, or PokéAPI-credited file has no current row, so a changed or added sprite of that kind needs a new run. A file that my151 changed is never PokéAPI's file.

On 2026-10-20 the counts are 699 Game Freak sprites (695 PNG files, and four Overdrive stills cut from PokéAPI's animated GIFs), 596 of the Smogon Sprite Project's 601 files, and all 91 files credited through PokéAPI. The 5 other Smogon files are Vivillon, Neutral Mode Xerneas, Radiant Sun Solgaleo, Full Moon Lunala, and Zenith Marshadow.

An artist has an entry of their own only when my151 took the sprites from the artist's own upload, not from a bundle. On 2026-10-13 that is KingOfThe-X-Roads: the Ogerpon sprites from the artist's Sta.sh uploads and DJ Rotom from the artist's X post. On 2026-10-19 kiriaura joins: Mosslax and Peakychu from kiriaura's DeviantArt uploads, with the About-page terms quoted in `src/data/creditTerms.json`. On 2026-10-20 JoeTEStrikesBack joins: Shadow Lugia and Primal Dialga from the artist's DeviantArt sheet, with the deviation's terms. my151 changed both sprites by hand, so their rows carry `"changedBy": "my151"`. The panel credits the artist, and the ledger records the changes.

Tinkmaster is Travis's Tinkaton (#959) with tools that my151 added, and Chef Dente is G.E.Z.'s Greedent (#820) with a hat, neckerchief, ladle, pan, whisk and spatula that my151 added. Since 2026-11-12 the panel credits each file to its base artist through the Smogon Sprite Project: Tinkmaster's row says `"via": "smogon-gen9"` with Travis, Chef Dente's says `"via": "smogon-gen8"` with G.E.Z., and each file counts in that artist's tally. This meets the project's terms: "free for use as long as the spriter or the project itself is credited". Both rows keep `"changedBy": "my151"`, and the ledger records the additions. Professor Tangrowth is the lab's own drawing from Game Freak's #465 and has no credit line.

my151's own drawings get no credit line in the panel (Michael, 2026-10-13: "Do not credit my151 for zygarde"). The lineage of the lab's former Mega Zygarde drawing is kept in the `previousEvidence` of its row in `docs/credits/sprite-evidence.json`.

## Shiny sprites

On 2026-10-25 the Favorite Pokémon Picker and the league builder gained a Shiny switch. `scripts/credits/shownSprites.ts` lists every shiny file that the switch can show. Each one needs a ledger row like any other shown file, and the row records the shiny's source and artist.

Michael set the credit rule on 2026-10-26. When the same artist drew the normal and the shiny sprite, the credit for the normal sprite also covers the shiny. The panel credits a shiny on its own only when one of these holds:

- A source confirms that another artist drew the shiny, such as a Smogon sheet row that names a different "(shiny)" spriter.
- A source asks for normal and shiny forms to be credited separately.

A shiny whose artist is not confirmed counts as the same artist's work. Only a shiny that the panel credits on its own has a row in `src/data/spriteAttribution.json`, with the key `shiny/<file>`. The bundles count it under its shiny artist, and they count no other shiny. `npx tsx scripts/credits/bundle-credits.ts --check` fails when a shiny's row names no confirmed artist beyond its normal sprite's. On 2026-10-26, 85 shinies had such a row, and no source asked for separate credit.

The research found each shiny's source this way:

- `scripts/data/shiny-sprite-placed.json` names the source and the shiny artist of each shiny that the harvest takes from outside PokéAPI's own folders. The research run of 2026-10-25 traced these, and 60 more PokéAPI shinies, to their credit sheets. The run is not in the repository, so each ledger row keeps its source URLs and SHA-256 values.
- Any other shiny is PokéAPI's file. It is Game Freak's when its pixels equal PokéAPI's Black and White shiny. A Smogon shiny is compared with the Front shiny attachment on the sheet row that credits its normal sprite. On an exact match, the artists that the row marks "(shiny)" drew it, or the row's artists when it marks none. A PokéAPI shiny is credited through the README only when the commit whose README line credits its normal sprite also added the shiny, and the line covers shinies.
- A shiny with no such match has an artist that is not confirmed. Its ledger row says `"evidenceType": "follows-normal"`.

On 2026-10-29 Michael held 20 shinies out of the app: forms that are one individual that is never shiny, and two forms with no shiny in any game. They have no ledger row. The held-shinies record in the private sprite work folder keeps the files and the rules, and `held` in `scripts/data/shiny-sprite-sources.json` keeps the harvest from adding them back.

An artist's own entry lists a shiny only when the panel credits it on its own. The shiny follows the matching normal sprite, marked with the shiny star. On 2026-10-26 no own entry lists a shiny.

## Non-profit

"my151 makes no money and has no plans to" (Michael, 2026-10-13). Several terms allow non-profit use only, so this matters.

## Where the evidence lives

- `docs/credits/sprite-evidence.json` and `docs/credits/sprite-evidence.md`: the provenance of every sprite file a page shows, file by file. `npm run credits:check-sprites` fails when a shown file has no row or its bytes changed, unless `scripts/sprite-reencodes.json` lists the change as a lossless re-encode.
- `src/data/spriteAttribution.json`: each fan-made sprite file's artists and source, with evidence.
- `src/data/creditTerms.json`: each source's and artist's terms, quoted from their pages with the read date, and each artist's proven links with their proof.

The build ships only what the panel shows (`scripts/acknowledgements-build.ts`). Per-artist research stays in the repository as evidence.
