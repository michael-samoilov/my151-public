# Initial homepage Inter

`inter-home-initial.woff2` is a 30,116-byte subset of the Latin variable font in
`@fontsource-variable/inter` 5.2.8. It retains the original 100-900 weight axis,
glyph outlines, advances, instructions, and font features. The existing
[Inter OFL license](../../../public/licenses/inter-OFL-1.1.txt) applies. Font
copyright and license records remain in the file.

The subset covers printable ASCII, supported Latin characters from the English
UI and data catalogs, and Latin language names. Its Unicode map also retains
the letters FreeType uses to calculate automatic Latin font alignment. Removing
unused letters such as `j` can change the rendering of retained letters, even
when their outlines and instructions stay identical.

The homepage embeds this font in its HTML. A short readiness gate prevents a
fallback face from painting first. Client hydration runs independently of the
full font request. After full Inter loads, the client restores its original
font family. Other pages keep their original font delivery.

`inter-home-initial.json` records the original font hash, subset hash, and exact
Unicode coverage. The build checks both hashes and the initial rendered text.
A font or copy change that fails those checks requires regeneration and browser
comparison before release. The original font does not supply CJK glyphs; their
existing font selection remains unchanged.

The offline generation uses FontTools 4.57.0 and Brotli 1.1.0, with every layout
feature, unchanged timestamps, and omitted nonrendering glyph names. It does not
add a build-time dependency. The generation inputs, operator, and retained-glyph
proofs are preserved in the font-stability evidence archive.
