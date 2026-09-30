# Translated UI strings

Everything in `../terms/` is *sourced* — types, colours, egg groups, regions,
Pokémon names, all taken from the games' own text. Nothing in this directory is.
These are translations, and the distinction is the point of keeping them apart.

## What is in here

Only what has been deliberately translated and reviewed, key by key. The corpus
is ~460 strings; this is a handful of them. A locale that has no entry for a key
falls back to English, which is the intended intermediate state rather than a
gap — `loadCatalog` layers English, then the sourced terms, then these.

Currently: the five report-a-problem category chips, and the trainer card's
signature-pane headings (`league.head.*`) and what a screen reader says for
those two slots (`league.slot.*`).

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
