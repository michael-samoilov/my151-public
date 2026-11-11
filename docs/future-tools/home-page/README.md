# Home page development

The home page is live at `/`. `src/home/main.tsx` mounts `src/components/home/HomePage.tsx`. Tool destinations and localized copy come from `useTools()` and the translation catalogs.

## Regenerate current artwork

Use `scripts/capture-tool-art.mjs`, `scripts/resize-tool-art.py`, and `scripts/generate-og-image.mjs`. The runtime artwork record (`docs/evidence/tool-art-rebake/README.md`) describes their inputs and commands.

`league-fixture.json` remains an active input for the capture script and the verify-my151 visual driver. The capture script also uses the retained Picker portrait renderers and saved seed. Preserve these inputs when changing artwork generation.

The old `capture-shots.mjs` generated obsolete compositions. It belongs to the [historical source tree](https://github.com/michael-samoilov/my151-public/tree/main/docs/future-tools/home-page), with the original design explanations and artboards. Replay those experiments in that revision's worktree. Use the current scripts for shipped assets.

## Check layout changes

The existing sweep drives the real page and measures its geometry:

```sh
npx playwright test e2e/sweeps/home-sweep.spec.ts --project=desktop
```

Follow `CLAUDE.md` for the affected verification scope and visual evidence. Current behavior and tests supersede historical launch proposals.
