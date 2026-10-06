# Pokémon shape labels: source limits

Research date: 2026-10-06. Base: `439236a1`.

## Finding

No nine-language set of official displayed category names was found. The games represent these fourteen shape categories with icons. Localized text labels in this app must be identified as authored interface descriptions, unless a specific displayed game string is later sourced.

[Bulbapedia, revision 4616890](https://bulbapedia.bulbagarden.net/w/index.php?title=List_of_Pok%C3%A9mon_by_shape&oldid=4616890) explicitly distinguishes icon-only game categories from fan-created English descriptions. It lists unused Japanese internal names in Pokédex 3D and Pokédex 3D Pro. This is secondary evidence of internal labels, not a dump verified here and not displayed game UI text.

The existing `ShapeName` values match [PokeAPI's identifiers](https://github.com/PokeAPI/pokeapi/blob/master/data/v2/csv/pokemon_shapes.csv). Identifiers such as `squiggle`, `blob`, `heads` and `armor` are database keys. Their meanings cannot be inferred reliably from their literal English spelling.

[PokeAPI's prose table](https://github.com/PokeAPI/pokeapi/blob/master/data/v2/csv/pokemon_shape_prose.csv) contains English and French labels only. It does not supply German, Spanish, Italian, Japanese, Korean, Simplified Chinese or Traditional Chinese shape names. Its names and elaborate `awesome_name` values are community database wording, not evidence of official localization.

Fetched prose SHA-256: `3c94532b01d4a98c334c23976265e387b157082d38d9a7b7b0202a93276d8060`. The source URL is a moving branch; this hash identifies the retrieved content. A commit pin was not resolved because the GitHub API host is excluded from shell network policy.

## Semantic mapping

Keep the keys and icons. Use the meanings below when authoring concise labels in `en`, `de`, `es`, `fr`, `it`, `ja`, `ko`, `zh-Hans` and `zh-Hant`. The badge locale worker owns the final localized UI wording; this document records evidence rather than duplicating those translations.

| Existing key | Category meaning | Unused Japanese internal name, secondary source |
| --- | --- | --- |
| `ball` | Head only | 丸型 |
| `squiggle` | Serpentine body | 腹這脚無型 |
| `fish` | Fins | 魚型 |
| `arms` | Head and arms | 腕型 |
| `blob` | Head and base | 直立胴型 |
| `upright` | Two legs and tail | 二足尻尾型 |
| `legs` | Head and legs | 脚型 |
| `quadruped` | Four-legged body | 四足型 |
| `wings` | One pair of wings | 二枚羽型 |
| `tentacles` | Tentacles or multiple legs | 多足型 |
| `heads` | Multiple bodies | 集合型 |
| `humanoid` | Two legs without tail | 二足人型 |
| `bug-wings` | Two or more pairs of wings | 四枚羽型 |
| `armor` | Insectoid body | 昆虫型 |

“Armor” is not a metal-shell category. “Heads” does not mean only multiple heads. A four-wing label alone narrows the `bug-wings` category incorrectly. Descriptive tooltip or accessible copy can carry detail if the compact badge needs a shorter label.

## Implementation boundary

Use authored interface provenance for newly localized descriptors. Do not mark them `official`, `official-composed`, or game-extracted. Keep internal Japanese labels separate from the displayed authored descriptions. This limitation does not affect the independently sourced official type names.

| Locale | Available source and fallback provenance |
| --- | --- |
| `en` | PokeAPI community labels and descriptions; existing app wording can remain authored UI wording. |
| `fr` | PokeAPI community labels and descriptions; adapted UI wording remains authored. |
| `de` | No displayed official category names sourced; authored localization of the category meanings. |
| `es` | No displayed official category names sourced; authored localization of the category meanings. |
| `it` | No displayed official category names sourced; authored localization of the category meanings. |
| `ja` | Secondary-source unused internal names above; compact user labels remain authored unless the exact internal string is retained and identified as such. |
| `ko` | No displayed official category names sourced; authored localization of the category meanings. |
| `zh-Hans` | No displayed official category names sourced; authored localization of the category meanings. |
| `zh-Hant` | No displayed official category names sourced; authored localization of the category meanings. |

CJK has no uppercase/lowercase distinction. Preserve Japanese, Korean and Chinese label text verbatim. English-looking lowercase CJK labels reveal an untranslated fallback, not a casing preference. Latin-script casing can follow the existing interface convention without changing the label's provenance.

## Retrieval record

The current shape list and both PokeAPI CSVs were fetched through the permitted shell proxy with per-command network access. The web connector independently returned the same Bulbapedia distinction. `/api/v2/pokemon-shape/1/` returned HTTP 403; the checked upstream CSV was available. No blocked destination was bypassed.
