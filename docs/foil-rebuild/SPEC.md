# my151 holo foil: what it must look like

This describes the look and behavior of the export card's holo foil, from screenshots only. It contains no code from the current effect. Build a new effect that gives the same impression, drawn independently.

## Where it shows

- The export preview card: a PNG of the user's Pokédex, league or favorites export, shown on a card that tilts toward the pointer (hover-tilt). The foil is on screen only. The saved image has no foil.
- Today two holo layers sit on the card. They change about 26,000 to 29,000 screen pixels of a 400 x 660 px card (see the `*-all.png` and `*-no-holo.png` pairs).
- The foil shows on "ink" only: the colored sprites, the pastel circles behind them, the red header and the colored text. White paper stays white. Black outlines stay black. The app already computes masks for ink, saturated areas, edges and gloss from the export image; use them.
- The foil fades out when the card lies flat and grows as the card tilts. The app already sets `--foil-opacity` for that.

## Layer 1: rainbow holofoil

- Fine, closely spaced rainbow bands run diagonally across the card. The colors are light, pastel tints in rainbow order (red, yellow, green, cyan, blue, violet), repeating many times across the card, so each band is narrow.
- The bands tint the ink's mid-tones; they do not paint over white or black.
- As the pointer moves, the bands slide across the card, so a sprite cycles through the colors while the card tilts.
- Reference: `*-rainbow-only.png` against `*-no-holo.png`.

## Layer 2: "V" shine

- A brighter, metallic sheen over the ink, made of two sets of soft colored stripes that cross at an angle, so the highlights form a chevron or "V" pattern.
- The sheen is strongest near the pointer and fades with distance from it.
- A faint grainy texture breaks up the sheen, so it reads as foil rather than a smooth gradient.
- The stripes move with the pointer at a different rate from the card, a parallax that makes the shine glide over the ink.
- The blend lightens: highlights glow on colored ink and leave white paper unchanged.
- Reference: `*-shine-only.png` against `*-no-holo.png`.

## Behavior to keep

- Both layers follow the same pointer and tilt signals the card already uses (`--pointer-x`, `--pointer-y`, `--pointer-from-center`, `--pointer-from-left`, `--pointer-from-top`, `--hover-tilt-*`, `--foil-opacity`).
- Each layer has an on switch and an amount in the foil recipe, like the existing layers, and the workshop has dials for them.
- Mobile Safari and Chrome must render it: plain CSS gradients, masks and blend modes, no WebGL.

## Reference captures

Each capture from `capture.cjs` is the card at one frozen pointer pose: `top-left`, `center-right`, `bottom-center`. Views: `all` (every foil layer), `no-holo` (both holo layers hidden), `rainbow-only` and `shine-only` (that holo layer alone, the other foil layers hidden too).
