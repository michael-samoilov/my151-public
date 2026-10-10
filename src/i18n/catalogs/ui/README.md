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

### The league and gym leader builder

All of `league.*` is translated: the tool bar, the league summary, the
trainer card and its bands, the (i) help, the hints under the card, the TM
and type pickers, the export popups, and the words drawn in the exported
pictures. The league's export popups moved from `nudge.*` to `league.nudge.*`
with the rest.

- **Game terms** follow the pinned text in
  `docs/i18n/sources/league-interface-terms.json`: Gym Leader, Elite Four,
  Champion, Mega Evolution, Gigantamax, Dynamax, Primal Reversion, TM, Badge,
  Category, Power, Accuracy, PP and Type. Champion takes the Sword/Shield
  form, because Scarlet/Violet's only Champion is a woman and its French,
  Spanish and Italian words are feminine.
- **The badge phrase** (`league.badge.phrase`) puts the badge word where each
  language puts it: after the name in English, Japanese, Korean and Chinese,
  joined into one word in German (Donnerorden), and before the name in
  French, Spanish and Italian.
- **Endgame boss** is a fan term, so it is described: 裏ボス (the post-game
  boss), 최종 보스, 隐藏头目 and 隱藏頭目, Endgegner, boss final, jefe final
  and boss finale. A minor Legendary is 準伝説, 준전설, 准传说 and 準傳說,
  Sub-Legendäres, légendaire mineur, legendario menor and leggendario minore.
- **Rows and columns** in Chinese follow the regional usage: a row is 行 and
  a column 列 in Simplified, a row 列 and a column 欄 in Traditional.
- **Not translated:** move names, move categories (Physical, Special, Status)
  and contest conditions have no sourced text in all nine languages, so they
  stay English.

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
