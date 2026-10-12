# Holo foil rebuild (clean room)

Michael decided on 2026-10-12 to redraw the export card's holo foil from scratch. The current rainbow holofoil and "V" shine adapt poke-holo (pokemon-cards-css, GNU GPL 3.0). Complying with GPL 3.0 would mean publishing the my151 front end under GPL 3.0, and the repository is private. Michael called the holo effect critical, so it stays, redrawn without the GPL code. He wants to compare the old and new foil in the foil workshop before the new one ships.

## What is on this branch

1. `Fence the poke-holo code into its own files`: the adapted code now lives only in `src/league/components/foil/pokeHolo.css`, `pokeHoloParts.tsx` and `pokeHoloPointer.ts`. No behavior change: the built CSS has the same rules as production, except that the moved custom properties sit in a second `.export-foil` rule.
2. Any `WIP:` commit after it is the first clean-room implementer's partial work, written without seeing the fenced files.

## Rules for whoever writes the new layers

The point is an independent implementation. The person or agent who writes the new layers must not have seen the GPL-derived code:

1. Never open, grep or print the three fenced files.
2. Never read the git history of `src/league/components/ExportPreview3D.css` or `ExportPreview3D.tsx` before the fence commit.
3. Never read pokemon-cards-css, poke-holo.simey.me, poke-151.simey.me, the css-tricks holographic-card article or its CodePen, or any other holo-card CSS.
4. Do not reuse the names `--sunpillar-*`, `--background-x`, `--background-y`, `export-foil-holo-*`, `export-foil-holographic` or `export-foil-holo-rainbow`.

Someone who has seen the old code can coordinate, review and integrate, but should give the writing to a fresh agent that follows these rules.

## Inputs for the writer

- `SPEC.md`: what the foil must look like, written from screenshots only.
- `capture.cjs`: captures the workshop card (`/foil-workshop.html?sample=dex-full`, 1280x900) at three frozen pointer poses, with all layers, without the holo layers, and with each holo layer alone. Run it on the current build for the reference images: `PW_MODULE=$PWD/node_modules/@playwright/test node docs/foil-rebuild/capture.cjs <base url> <out dir>`.

## Done means

- Two new layers in new files, wired into the foil recipe and the layer list, off by default in the live tools.
- A one-tap "Holo: current / new" switch in the foil workshop, with the URL sharing kept, so Michael compares on his phone.
- After Michael picks the new foil: switch the live recipe to it, delete the three fenced files and the old layer wiring, and remove poke-holo from the credits (`sprite-lab/data/site-credits.json` on `claude/sprite-lab`).
