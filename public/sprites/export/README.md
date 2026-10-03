# HGSS Favorite export ornaments

These byte-identical Pokémon HeartGold/SoulSilver sprites were supplied through Bulbagarden Archives on October 3, 2026.

- [Leaf Crown](https://archives.bulbagarden.net/media/upload/c/c5/Leaf_Crown_Sprite.png):31×18px, original142-color opaque palette, binary alpha.
- [Shiny Leaf](https://archives.bulbagarden.net/media/upload/b/b6/Shiny_Leaf_Sprite.png):15×15px, original7-color opaque palette, binary alpha.

Pokémon artwork belongs to its original copyright holders. The source pages provide the artwork attribution and licensing context. No palette cleanup, recoloring or white backing is applied.

The runtime draws the Crown at integer3× nearest-neighbor scale. Shiny Leaves use explicit inverse nearest-neighbor sampling at nominal2× scale, with individual rotations along the upward arc tangent. Rotations retain original opaque RGBA colors and binary alpha, but change pixel geometry. Identical unrotated2× blocks are not claimed.

The authoritative original hashes and source measurements are in `docs/favorite-picker-work/export/favorite-crown-variations/assets/measurements.json`. These production files equal the originals there byte-for-byte.
