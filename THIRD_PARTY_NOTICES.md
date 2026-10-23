# Third-party notices

These notices apply to the identified third-party assets. They do not change the license of other repository content.

## Pokémon type icons by Partywhale

<!-- type-icons:partywhale -->
Fighting, Rock, Bug, Water, and Psychic use SVG artwork from [Partywhale's Pokémon type icons](https://github.com/partywhale/pokemon-type-icons), commit `fcbe6978c61c359680bc07636c3f9bdc0f346b43`. Bug, Water, and Psychic are modified to mirror the original right half.

These assets use the MIT license. The original copyright notice and full license text are preserved in [the source license](scripts/type-icons/sources/partywhale/LICENSE) and [the distributed license](public/licenses/partywhale-pokemon-type-icons-MIT.txt).

## Generation 9 Pokémon type icons by Elginive

<!-- type-icons:elginive -->
Normal, Flying, Poison, Ground, Ghost, Steel, Fire, Grass, Electric, Ice, Dragon, Dark, and Fairy use artwork from [Elginive's Pokémon type icons](https://github.com/Elginive/pokemon-type-icons), commit `b8562e080dd0b48742a9ba0c9b0bc7f1acdc5d88`.

The source README says “Free to use. Credit is always appreciated, but not necessary.” Its original text is preserved in [the source README](scripts/type-icons/sources/elginive/README.md).

## hover-tilt by Simon Goellner

The export card's pointer tilt, springs, drop shadow, and glare are adapted from [hover-tilt](https://github.com/simeydotme/hover-tilt), commit `5db58f38cbbfa20054ca2c21a144d866d304b34a`: `packages/hover-tilt/src/lib/components/HoverTilt.svelte` and `packages/hover-tilt/src/lib/utils.ts`. Copyright (c) 2026 Simeydotme.

hover-tilt states two licenses. The repository's `LICENSE` file is MIT. The package (`packages/hover-tilt/package.json`, its README, and npm `hover-tilt@1.0.0`) states MPL-2.0. my151 meets both:

- MIT: the copyright notice and full license text ship in [the distributed MIT license](public/licenses/hover-tilt-MIT.txt), served at <https://my151.app/licenses/hover-tilt-MIT.txt>.
- MPL-2.0: the full license text ships in [the distributed MPL-2.0 license](public/licenses/hover-tilt-MPL-2.0.txt), served at <https://my151.app/licenses/hover-tilt-MPL-2.0.txt>. MPL-2.0 applies file by file, so hover-tilt's code sits only in the files below, and they hold no other my151 code. Each file starts with the MPL-2.0 notice and lists what my151 changed. The site serves each file's source as is.

| File | What it holds | Source for people who use the app |
|---|---|---|
| `src/components/export/hover-tilt/hoverTilt.ts` | The spring defaults and the spring that imitates svelte/motion, the leave spring and delay, `ROTATION`, the pointer position, the `--rotation-x` and `--rotation-y` formulas, the enter, move, and leave steps, the scale, and the shadow offset and alpha. | [hoverTilt.ts.txt](public/licenses/source/hover-tilt/hoverTilt.ts.txt), <https://my151.app/licenses/source/hover-tilt/hoverTilt.ts.txt> |
| `src/components/export/hover-tilt/hoverTilt.css` | The tilt transform, the two-layer shadow, the glare gradient, and the glare layer with its mask. | [hoverTilt.css.txt](public/licenses/source/hover-tilt/hoverTilt.css.txt), <https://my151.app/licenses/source/hover-tilt/hoverTilt.css.txt> |

`scripts/published-source.json` maps each published copy to its file, and `node scripts/check-published-source.mjs` fails when a copy differs from its file, when a file lacks the MPL-2.0 notice, or when the folder holds a file that is not published. Run it with `--write` to update the copies, and commit them. Put new code from hover-tilt in `src/components/export/hover-tilt/` only, list each new file in the manifest, and keep my151's own code out of that folder.

## npm packages

`build.license` in `vite.config.ts` makes each production build write the name, version, license, and license text of every npm package in the browser bundle to `dist/licenses/npm-packages.txt`, served at <https://my151.app/licenses/npm-packages.txt>. Vite's list misses three notices, which [npm-packages-extra.txt](public/licenses/npm-packages-extra.txt) holds: Tailwind CSS with modern-normalize, country-flag-icons, and the Apache ECharts NOTICE. Its versions are written by hand, and the build fails when one differs from the installed package. The build also writes `dist/licenses/npm-packages.json`, the name, version, and license of every package in both files (`scripts/acknowledgements-build.ts`). The Acknowledgements panel lists the packages from it and links both files.
