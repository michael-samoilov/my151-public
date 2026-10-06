# Pinned generation numerals

The existing Linux generation-disc SVG images resolve `system-ui,sans-serif`
to **Noto Sans Bold**, not a serif font. Chromium's platform-font inspection
reports `NotoSans-Bold`. Rendering the same image with explicit `Noto Sans`
produces zero RGBA differences at 160×160 pixels for VIII. Explicit Noto Serif
produces 8,892 differing channels. The bars on the Roman I are part of the
original Noto Sans design.

`noto-sans-bold-roman.ttf` is a subset of the installed Debian Noto Sans Bold
font. It contains only I, V and X. The original font SHA-256 is
`e83493c945848ecd4a9ad0f6d19164541a0d3e23a9c952304a00a46e00272ac5`.
The subset SHA-256 is
`2df6959e5fb3ed2f652ce14b4f139347d12bc250ff975de37f1a18182589d9c4`.
The source's embedded copyright and SIL Open Font License accompany it in
[OFL.txt](OFL.txt). Source project: <https://github.com/notofonts/noto-fonts>.

Generation discs render the bundled glyph outlines from
`roman-disc-paths.json`. An SVG image cannot inherit its host document's font.
Paths also prevent platform fallback or asynchronous font loading from changing
mobile, desktop, origin markers or native exports. Numeral outlines retain the
existing 15-unit font size, −0.4-unit tracking and 1.25-unit rounded stroke.
The baseline uses the original Linux text's measured 21.5-unit baseline.

Regenerate the geometry from the bundled font, without network access:

```sh
python scripts/build-roman-disc-glyphs.py
```

The manual generator requires fonttools 4.61.1. It is not part of application
builds. The font is source material; only its generated outlines enter the
runtime bundle.
