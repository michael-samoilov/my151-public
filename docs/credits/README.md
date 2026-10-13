# How my151 credits sprites

The Acknowledgements panel credits sprites through the bundles they came from. It names a sprite artist only when my151 took that artist's sprites from them directly.

## The policy

Michael set it on 2026-10-13. The panel credits sprites through the bundles they came from, under each bundle's own permission, as other users of these bundles do. Each bundle's pages credit its artists. The panel credits an artist separately only when my151 took the artist's sprites from the artist directly, not from a bundle.

## What counts as a bundle

A bundle is a published collection that my151 took sprite files from, and that credits its own artists on its own pages:

| Bundle | Where it credits its artists |
|---|---|
| PokéAPI sprites | Its GitHub repository and the README credits |
| Pokémon Showdown | The smogon/sprites repository |
| Generation 9 Resource Pack | Its Eevee Expo resource page and its sprite sheet |
| Smogon Sprite Project | Its three project threads and their credit sheets |

The Smogon Sprite Project drew most of the fan sprites that PokéAPI and Showdown carry. Its terms ask users to credit "the spriter or the project itself", so crediting the project meets them.

Each bundle entry in the panel says only what the evidence proves about the bundle's part in the app, with no count. It shows one permission quote from the bundle's own page and the bundle's links. It does not list the sprites.

An artist has an entry of their own only when my151 took the sprites from the artist's own upload, not from a bundle. On 2026-10-13 that is KingOfThe-X-Roads: the Ogerpon sprites from his Sta.sh uploads and DJ Rotom from his X post.

my151's own drawings get no credit line in the panel (Michael, 2026-10-13: "Do not credit my151 for zygarde"). Mega Zygarde's lineage is recorded only in `src/data/spriteAttribution.json`.

## Non-profit

"my151 makes no money and has no plans to" (Michael, 2026-10-13). Several terms allow non-profit use only, so this matters.

## Where the evidence lives

- `docs/credits/sprite-evidence.json` and `docs/credits/sprite-evidence.md`: the provenance of every sprite file a page shows, file by file. `npm run credits:check-sprites` fails when a shown file has no row or its bytes changed.
- `src/data/spriteAttribution.json`: each fan-made sprite file's artists and source, with evidence.
- `src/data/creditTerms.json`: each source's and artist's terms, quoted from their pages with the read date, and each artist's proven links with their proof.

The build ships only what the panel shows (`scripts/acknowledgements-build.ts`). Per-artist research stays in the repository as evidence.
