# English display changes — applied

Extraction was meant to be invisible in English: same strings, different source.
Anything that would actually change what an English user sees was parked here
rather than applied, and has now been approved and shipped.

Kept as the record of *what* changed in English and why, since a diff of the
i18n work does not make that obvious.

## Applied

### 1. `Pokemon` → `Pokémon`

The browser's add/remove button read `Add 3 Pokemon` / `Remove 2 Pokemon` — the
only two strings in the app without the accent.

### 2. Pokémon names come from the name catalog

The tile used to render the raw slug with CSS `capitalize`, which mangles
anything carrying punctuation. Names now come from the published catalog:

| Was | Now |
|---|---|
| `Mr-Mime` | `Mr. Mime` |
| `Farfetchd` | `Farfetch’d` |
| `Nidoran-F` / `Nidoran-M` | `Nidoran♀` / `Nidoran♂` |
| `Type-Null` | `Type: Null` |
| `Flabebe` | `Flabébé` |
| `Ho-Oh` | `Ho-Oh` (unchanged) |

English was the one locale whose name catalog never loaded — `initLocale`
returned early for it, and that early return is what calls `loadNames`. Harmless
while the tile rendered the slug, and the reason these were still broken.

### 3. Alt forms: a marker that survives truncation

Regional forms were abbreviated *into* the name — `raichu-A`, `tauros-P-combat`,
`alcremie-clovr` — by slicing the English slug. Two problems: the surgery cannot
survive translation, and the marker was the last thing in the string, so a text
overflow ate it first. On a 320px phone a tile is about 45 pixels wide, so
"Raichu" and "Alolan Raichu" rendered identically on exactly the tiles where the
difference matters.

The label is now two elements: a species name that may truncate, and a marker
that may not. `e2e/dev/tile-label.spec.ts` forces an overlong name and asserts
the name clips while the marker keeps its width and stays inside the tile.

**Where the marker comes from.** The obvious rule — abbreviate the form label —
works only in languages that lead with the distinguishing word (`Alolan Form`,
`アローラのすがた`) and collapses in those that lead with a shared one: French
`Forme d'Alola` and `Forme de Galar` both give `F`. So the marker is taken from
the *region's own name*, a bare noun in all nine languages whose first grapheme
is unique across the four regions in every one of them:

| | Alola | Galar | Hisui | Paldea |
|---|---|---|---|---|
| en / fr / de / es / it | A | G | H | P |
| ja | ア | ガ | ヒ | パ |
| ko | 알 | 가 | 히 | 팔 |
| zh-Hans | 阿 | 伽 | 洗 | 帕 |
| zh-Hant | 阿 | 伽 | 洗 | 帕 |

That covers 57 of the app's 64 alt forms. Alcremie's six sweets are *items* in
the games, so they have an official name in every language, and their first
grapheme separates all six in English, Japanese, Korean, both Chinese scripts
and French — but gives six identical letters in German (`Zucker-…`), Spanish
(`Confite…`) and Italian (`Bonbon…`). Those three locales therefore get no sweet
marker at all: six identical markers would claim a distinction the language is
not making. The sprites differ visibly, which is how the games separate them.

Tauros is the one species a marker cannot separate — all three Paldean breeds
are Paldean, so all three are correctly `P`. The breed is not available to
abbreviate: `pokemon_form_names` says "Paldean Form" for all three in every
language but English, and Scarlet/Violet mentions Combat, Blaze and Aqua only
inside Pokédex prose, never as a label. They are still told apart on the tile by
the thing that actually differs — their types, whose badges sit directly beneath
the name.

`src/i18n/formMark.test.ts` asserts all of this, including that no *other*
species ever shares a marker.

The full form name — "Raichu — Alolan Form" — is on the label's `title` and
accessible name, so a single grapheme is a reminder rather than the only clue.

### 4. Type badges are drawn, not shipped

The badge was a PNG with the English word baked in, and no localized set exists
anywhere. It is now drawn: official colour, official symbol, and the type name
rendered live from Scarlet/Violet's own `typename` table.

- **Title case, not all caps.** The art reads `FIRE`; the game's string table
  stores `Fire`. `text-transform: uppercase` would have to be switched off for
  CJK anyway, and letter-spacing with it.
- **The app's font**, at a size that reads better than the baked-in text — at
  tile size the PNG's lettering rendered smaller than the name above it.
- **Two colours corrected**, sampled from the art: `ground` #945121 → #915121
  and `dragon` #5261DE → #5061E1. The other sixteen already matched.

### 4b. CJK type labels are set larger than Latin

Ten of the eighteen Chinese type names are a *single* character — 毒 虫 钢 火 水
草 电 冰 龙 恶 — and that is what Scarlet/Violet itself paints, not an
abbreviation of ours. Korean has five. At a 69px tile badge a lone Han character
carrying a dozen strokes has to survive in about eight pixels.

The badge originally normalised every script to the same 24-unit ink band, which
sounds right and looks wrong: a Han character packs far more stroke into the same
square than a Latin capital, so at equal *measured* height it reads visibly
smaller. CJK is now set at **1.28×** the Latin cap height, where the two match
optically.

Chosen by rendering 1.0, 1.15, 1.28 and 1.4 at the badge's real tile width and
comparing. At 1.0 the Han is clearly the smaller of the two scripts; at 1.4 it
crowds the pill and the three-character names grow wide. The room was already
there — the widest Chinese name fills only ~40% of the box the badge reserves.

Latin is unchanged. `e2e/dev/type-badge.spec.ts` asserts the per-script targets.

### 5. Header nav labels below 380px

The header has to fit the wordmark, the language globe and three tabs. Measured
at 320px with the globe present: 339px needed against 320px available in
English, 366px under `en-XA`. German's *Statistiken* would overflow too.

The active tab's text label now expands only from 380px up; below that all three
tabs are icon-only and the active one is still marked by its filled button. From
640px up every label shows, as before. A 320px or 360px phone sees three icons
instead of two icons and one labelled tab; every mainstream phone (390px iPhone,
393px Pixel, 412px Android) is unaffected.

### 6. No text beside the language globe

The trigger briefly showed the current language's endonym from `sm:` up. It has
been dropped: a globe is already the near-universal sign for this control, and
the word beside it is in the language someone opening the menu is most likely
trying to leave. It also takes a variable-width string out of the header's
tightest row.
