# Translated UI strings

Everything in `../terms/` is *sourced* — types, colours, egg groups, regions,
Pokémon names, all taken from the games' own text. Nothing in this directory is.
These are translations, and the distinction is the point of keeping them apart.

## What is in here

Only what has been deliberately translated and reviewed, key by key. The corpus
is ~460 strings; this is a handful of them. A locale that has no entry for a key
falls back to English, which is the intended intermediate state rather than a
gap — `loadCatalog` layers English, then the sourced terms, then these.

The translated keys cover the whole bug report flow (the form, its "What gets
sent" panel, the crash screen, and the hub card that opens it), trainer-card headings and
slot labels, picker interface, favorite home card and FAQ, the compact homepage intro, favorites filter,
and the shared controls visible on the picker. Other app copy still falls
back to English.

## Provenance

| Source | Meaning |
|---|---|
| `official` | Published in-game text. Lives in `../terms/`, never here. |
| `authored` | Written for this app, then held to the checks below. |

Every value here is `authored`. None of it is official-anything, and it must not
be presented as though it were.

## How these are checked without a translation service

Four things are asserted, none of which needs a network call or an API key:

1. **Key parity** — every locale carries exactly the keys English does for the
   namespaces present here, and no key that English does not have.
   `npm run i18n:verify`.
2. **Nothing is silently English** — a value identical to the English one is
   only allowed where it is genuinely the same word in that language
   (`Idea` in Spanish and Italian, `Bug` in French), and each of those is listed
   explicitly rather than allowed by a blanket rule.
3. **Length** — chips sit in a wrapping row on a 320px screen, so a value that
   runs long pushes the layout rather than wrapping gracefully. Budgeted per
   script, since a CJK character is roughly twice as wide as a Latin one.
4. **It renders** — `e2e/dev/feedback-i18n.spec.ts` opens the form in all nine
   languages, reads the chips out of the live DOM, and checks each one both
   matches its catalog entry and fits inside its own row without overflowing.

What none of that can tell you is whether the wording is *good*. It catches a
missing key, a stray copy of English, an overflow, a string that never reaches
the screen — not a clumsy phrase. That needs a speaker, which is what the
"Wrong translation" chip these strings label is for.

## Notes on specific choices

- **Japanese** uses 不具合 for a bug rather than バグ: it is the word Japanese
  software actually puts in a report form. 提案 for Idea rather than アイデア,
  for the same reason — the form is asking for a suggestion, not a notion.
- **Korean** keeps 버그, which is the ordinary word in Korean software, and uses
  기타 for Other, which is the standard list-ending term.
- **Chinese** splits on the usual Mainland/Taiwan vocabulary: 程序 vs 程式 for
  "program", 数据 vs 資料 for "data".
- **French** keeps `Bug`, which is what French tech writing uses.
- **German** uses `Fehler` rather than `Bug`, and `Sonstiges` for Other, which
  is the conventional German list terminator.

### The bug report flow

The "What gets sent" panel shows each line as one key, label and value
together (`feedback.context.*`), so each locale picks its own colon and its own
words for yes, no and none. Only the label is translated. The values are the
raw data the report sends: route, locale codes, filter ids, version and user
agent. The Japanese and Chinese lines take a full-width colon, the French
lines a space before it, and German capitalizes its nouns. Spanish `error` and
Italian `browser` are the same word as English and are listed in
`SAME_AS_ENGLISH_OK`. The favorites line counts its two parts with plural
keys, so English now says `1 pick`, not `1 picks`.

### The trainer card's headings

The pane draws ACE POKÉMON, PARTNER / SHOULDERMON and SIGNATURE POKÉMON in
capitals. A newline in the value is where the heading breaks when it stands
in two lines; `src/league/slotHeadings.ts` joins the lines when it draws one.
The pane fits each heading to its room, tracking first and then size
(`fitHeadings`), so a long wording costs a smaller face, not a cut. Where
the games have a word, it is theirs; the corpus is Scarlet/Violet and
Sword/Shield text from `abcboy101/poke-corpus`.

- **Pokémon** is each locale's own word: ポケモン, 포켓몬, 宝可梦, 寶可夢, and
  Pokémon in the Latin locales.
- **Partner** follows the games' "partner Pokémon": 相棒, 파트너, 搭档 and 搭檔,
  Partenaire, Partner(-Pokémon), Compañero and Compagno.
- **Signature** follows the games' "signature dish": 看板, 간판 and 招牌. French
  says fétiche, the usual word for a trainer's own Pokémon; Spanish insignia,
  Italian simbolo and German Signatur- are the nearest plain words.
- **Ace** is the gym leader's strongest Pokémon. エース and 에이스 as fans
  say it, 王牌 as the games translate Trump Card, Ass as in the German
  games' Turnier-Ass, estrella as Piers's star in Spanish, and asso as the
  Italian games say it. French takes phare: the games' vedette is wider than
  the ace's room on a phone.
- **Shouldermon** is a fan word, so it is described rather than sourced:
  肩乗りポケモン (肩乗り is the Japanese for a pet that rides the shoulder),
  어깨 위 포켓몬, 肩上宝可梦, "on the shoulder" in French, Spanish and Italian,
  and the German coinage Schultermon, which mirrors the English one.

### The hub, the FAQ, and the footer

`faq.*`, `home.*`, `footer.*`, and `common.dismiss` have translations in all
eight overlays. The FAQ answers are prose, so they use the same words as the
tool names in `tools.*` and the official terms: Kanto, the Elite Four, the
Champion, and Pokémon names come from `../terms/` and the name catalogs.

The FAQ also names fan concepts that the games do not. These are described,
not sourced: Japanese 600族 and Chinese 准神 and 準神 for pseudo-legendary,
ピカチュウ枠 for Pikaclone, and 創作ポケモン, 창작 포켓몬, 自创宝可梦, and
自創寶可夢 for fakemon. The Latin locales write 1025 without a thousands
separator, so the number cannot break across two lines. Korean keeps 1,025.

### The Pokédex builder

The build page is translated in all eight overlays: its header and nav, the
intro card, the section headings, the selection sheet's title, the settings
menu, the milestone nudges, and the analytics advisor. The build sections,
archetypes and categories (`section.*`, `archetype.*`, `category.*`) are
translated too, so the browser's filters can show them.

- **Official terms** come from the games. Evolution items, Paradox, Mythical,
  Ultra Beast, Grunt, Champion, Elite Four, Pokémon League, the island
  challenge and the National Pokédex are pinned with their message ids in
  `docs/i18n/sources/build-section-terms.json`. Regional forms come from
  `pokemon-formnames.json`, and Gym Leader and Legendary from
  `picker-interface-terms.json`. Region names come from the term catalogs,
  except Spanish Unova: the term catalog says Unova, and the games say Teselia.
- **Fan terms** use each fandom's own word: 600族 and 600족 for
  pseudo-legendary, 准神 and 準神 in Chinese, 電鼠/电鼠 and 전기쥐 for
  Pikaclones, and 序盤 (early game) for the regional bug, bird and mammal in
  Japanese.
- **Left in English**, because the games' names for them are not sourced here:
  the game titles in the gift, prize and static encounter sub-labels, Legends:
  Arceus, the villain team and character names, and "Sweet (Milcery)". Every
  overlay omits the same keys.
- **One cell.** Outline labels on the View page shorten from the section name
  to `sectionShort` to `sectionTiny`, and the tiny form is what a one-cell
  outline shows. Every section has a tiny key. Where English has no shorter
  word, its tiny form repeats its shortest one, and the repeat is skipped, so
  English renders as before. Each translated tiny form fits one cell at the
  0.72 squash floor or at the English label's own scale, whichever is lower.
  `e2e/dev/i18n-layout.spec.ts` checks every language.

### The favorite picker

`favorites.*`, `home.favorites.*`, and `faq.favorites.*` have translations in
all eight overlays. `favorites.completion` stays in the English base because
its value contains only numbers and a slash. Its accessible label is translated.

The picker also uses translated language controls, report buttons, FAQ summary,
and tool-menu labels. These controls share their translations with the other tools.

The copy is authored. Gym Leader and Legendary terminology follows the pinned
game text in `docs/i18n/sources/picker-interface-terms.json`. That fixture also
records German `Starter-Pokémon`, shortened to `Starter` on the badge.

`docs/favorite-picker-localization/verification.md` records the temporary proof
and the nine-locale render measurements at 320, 390, and 1280 pixels.

### The export flows

`export.*`, `exportSurvey.*`, `leagueExport.*`, `view.*`, `viewSettings.*`,
`sort.*`, `stats.*`, and `poster.*` cover the View page, the Pokédex, league,
trainer card, and favorites export panes, the survey after an export, and the
text drawn into the exported Pokédex image.

- **National Dex** uses each game's own name: Nationaler Pokédex, Pokédex
  National, Pokédex Nacional, Pokédex Nazionale, 全国図鑑, 전국도감, 全国图鉴,
  and 全國圖鑑. TM uses each game's abbreviation (TM, CT, MT, わざマシン,
  기술머신, 招式学习器, 招式學習器), and Badge is Orden in German.
- **Ordinals** in the survey ("the 151st person") come from
  `exportSurvey.ordinal_*`, picked by the locale's ordinal plural rule. English
  needs four forms. The other locales need only `_other`, because every export
  milestone is 151 or more: 151., 151e, 151.ª, 151ª, 151人目, 151번째, 第151位.
- **The survey's answers** stay in English in the report that is sent, so the
  replies read the same in every language. Only the labels on screen are
  translated. Brand names (Discord, Reddit, X / Twitter, 4chan, Bluesky,
  Tumblr) are not.
- **The poster separator** is a spaced middle dot in every locale, so each
  locale's `poster.separator` is listed in `SAME_AS_ENGLISH_OK`. French
  `sort.type` is listed for the same reason: Type is the French noun.
