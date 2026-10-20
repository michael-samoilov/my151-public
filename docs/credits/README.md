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
- Game Freak's sprites, the two Kyurem Overdrive stills (Game Freak's animation frames), and my151's Mega Zygarde count nowhere.
- An artist counts a file only when the ledger's verdict is `confirmed`. Every other file counts under its entry as "Artist not confirmed". A file with two artists counts for each of them.
- An artist's name links only to a profile whose `linkStatus` in `creditTerms.json` is `proven`, never to a Smogon member page. No artist's terms are quoted: the bundle's permission covers the files it carried.
- A direct-upload artist's own files appear only in their own entry. That entry also lists the bundles that credit them, with the count from each.

An artist has an entry of their own only when my151 took the sprites from the artist's own upload, not from a bundle. On 2026-10-13 that is KingOfThe-X-Roads: the Ogerpon sprites from the artist's Sta.sh uploads and DJ Rotom from the artist's X post. On 2026-10-19 kiriaura joins: Mosslax and Peakychu from kiriaura's DeviantArt uploads, with the About-page terms quoted in `src/data/creditTerms.json`. On 2026-10-20 JoeTEStrikesBack joins: Shadow Lugia and Primal Dialga from the artist's DeviantArt sheet, with the deviation's terms. my151 changed both sprites, so their rows carry `"changedBy": "my151"` and the entry shows one line that says so (Michael: "indicate we made a change").

A fan sprite that my151 extended keeps its artist's credit through the project that published it: Tinkmaster (Travis, #959) and Chef Dente (G.E.Z., #820) are credited through the Smogon Sprite Project, and their rows carry `"changedBy": "my151"`. The items the sprite lab added get no credit of their own. Professor Tangrowth is the lab's own drawing from Game Freak's #465 and has no credit line.

my151's own drawings get no credit line in the panel (Michael, 2026-10-13: "Do not credit my151 for zygarde"). Mega Zygarde's lineage is recorded only in `src/data/spriteAttribution.json`.

## Non-profit

"my151 makes no money and has no plans to" (Michael, 2026-10-13). Several terms allow non-profit use only, so this matters.

## Where the evidence lives

- `docs/credits/sprite-evidence.json` and `docs/credits/sprite-evidence.md`: the provenance of every sprite file a page shows, file by file. `npm run credits:check-sprites` fails when a shown file has no row or its bytes changed, unless `scripts/sprite-reencodes.json` lists the change as a lossless re-encode.
- `src/data/spriteAttribution.json`: each fan-made sprite file's artists and source, with evidence.
- `src/data/creditTerms.json`: each source's and artist's terms, quoted from their pages with the read date, and each artist's proven links with their proof.

The build ships only what the panel shows (`scripts/acknowledgements-build.ts`). Per-artist research stays in the repository as evidence.
