# Sourced game text

Strings in this directory are not translations. They are the text the games
themselves display, extracted from dumps of the games' own message files, and
they are what `npm run i18n:verify` holds the app's catalogs to.

## Why bother, when PokeAPI already has this

PokeAPI's `type_names.csv` is a community-maintained database. It is almost
certainly right, and it was right here — all 162 strings matched. But "almost
certainly right" is not the same as sourced, and there was a specific reason to
doubt a dictionary for this particular use.

A type badge is a fixed-width slot. Fixed-width slots are where localizers
abbreviate. Italian shipped `Coleott.` rather than `Coleottero` for the Bug
type, so the question of whether a database's dictionary form is what the badge
paints was a real one rather than a pedantic one.

## The source

[`abcboy101/poke-corpus`](https://github.com/abcboy101/poke-corpus) publishes
text dumped from the games. Its `gh-pages` branch carries one gzipped file per
game per language, all line-aligned against a `qid` file of message
identifiers — so line N is the same message in every language, and the `qid`
file says which message that is.

Scarlet/Violet's `common` file has a `typename` table whose entries run
`sv.typename.TYPENAME_000` to `_020`. Those are the strings the game paints on a
type badge. (The table skips `009` and `019`; the game's internal type enum
reserves those slots. `_020` is Stellar, the Terastal-only type, which has no
Pokémon and so no badge in this app.)

Fetched by `npm run i18n:game-text`, pinned to a commit, with a SHA-256 recorded
per file so a re-run either reproduces the fixture byte-for-byte or fails loudly.
This is the only i18n step that touches the network, and it is deliberately not
part of `npm run build`.

## The Italian Bug type, settled

Bulbapedia's [Type](https://bulbapedia.bulbagarden.net/wiki/Type) article says
that beginning in Generation VI, all languages use full type names "except
Italian, which retains an abbreviated form for the Bug type".

Against the dumps that is **false for Generation VI onward and true before it**:

| Game | Italian Bug type | Where |
|---|---|---|
| Platinum (Gen IV) | `Coleott.` | `msg` |
| Black 2 / White 2 (Gen V) | `Coleott.` | `common`, file 398, entry 6 |
| X / Y (Gen VI) | `Coleottero` | `common` |
| Sun / Moon | `Coleottero` | `common` |
| Sword / Shield | `Coleottero` | `common` |
| Legends: Arceus | `Coleottero` | `common` |
| Scarlet / Violet | `Coleottero` | `common`, `sv.typename.TYPENAME_006` |

Verified both ways: `Coleott.` appears exactly once in the Gen IV and Gen V
Italian text, as the type-table entry, and appears nowhere at all in any
Generation VI-or-later Italian dump. The modern badge shows the whole word.

The consequence is a design constraint rather than a trivium. `Coleottero` is a
third wider than the space the English-tuned badge geometry reserves, and
abbreviating it is not available to us — so it is fitted in layout instead. See
`src/lib/typeBadgeFit.ts`.

## Regenerating

```
npm run i18n:game-text   # re-fetch and rewrite the fixture (network)
npm run i18n:verify      # assert the shipped catalogs still match it
```

To move the pin, resolve a newer commit with:

```
git ls-remote https://github.com/abcboy101/poke-corpus.git refs/heads/gh-pages
```

and update `COMMIT` in `scripts/i18n/fetch-game-text.ts`. A changed string will
then fail `i18n:verify` until the catalog is regenerated to match, which is the
intended behaviour: upstream changing what the game says should be a decision,
not a silent update.

## Pokémon form names

`pokemon-formnames.json` records form descriptors from Scarlet/Violet and
Legends: Z-A's `zkn_form` tables. It also records the Cosplay Pikachu names in
Omega Ruby/Alpha Sapphire and the atomic Spiky-eared descriptor in HeartGold/
SoulSilver (`hgss.802.166`). The fixture pins the same corpus commit and records
the SHA-256 of each source file.

Regenerate from that commit's extracted `corpus` directory:

```sh
node --import tsx scripts/i18n/extract-picker-form-text.ts <corpus-directory>
npm run i18n:names
node --import tsx scripts/i18n/report-picker-name-coverage.ts
```

The extractor rejects source files whose hashes differ from the pin. The name
generator checks each picker form's species before it imports a descriptor.
Combinations of official pieces retain `official-composed` provenance.

Chinese sources contain no descriptor for the six Cosplay Pikachu variants or
Spiky-eared Pichu. Female sprite variants without a published form descriptor
use the sex symbol `♀`. Neither case invents official form wording.

## Names from Bulbapedia

Michael decided on 2026-10-19 to show the official localized name of every form
the app adds, when one exists. Some official names are in no game-text corpus
that the scripts read: Pokémon Pokopia's characters, Solgaleo's and Lunala's
phases, and some Chinese names from outside the games.
`bulbapedia-form-names.json` records them. Each row names the Bulbapedia page,
the revision ID, and the table it was copied from, and the file gives the read
date. A Mandarin name in traditional characters is listed for zh-Hant only,
unless every character is the same in simplified Chinese.

`npm run i18n:names` gives these names `official-bulbapedia` provenance. Game
text wins: the generator fails when a row names a form that game text or PokéAPI
already names in that locale. A locale with no row keeps the English
descriptor. That is still true for Overdrive in every
locale, for Zenith outside Japanese, for Cosplay Pikachu in both Chinese
locales, and for Pikachu Rock Star and Pikachu Belle in Simplified Chinese.

Read a page again with the MediaWiki API, then update the row's name and
revision ID:

```sh
curl -sG https://bulbapedia.bulbagarden.net/w/api.php --data-urlencode titles=Mosslax \
  -d action=query -d prop=revisions -d rvprop='ids|content' -d rvslots=main -d format=json
npm run i18n:names
```

## Names that no official source gives

Michael decided on 2026-10-20 that Purple Kecleon reads as the species' official
name with the language's word for purple, in the place an adjective takes:
"could we just include 'purple' in that language as that adjective would
typically modify a word in that language". No game, guide or Bulbapedia page
names the purple Kecleon. `my151-form-names.json` records these names with the
basis for each, and `npm run i18n:names` gives them `idiomatic` provenance. The
same file holds Shadow Lugia in Korean and Chinese (Pokémon GO's official
Shadow term before the species name; Pokémon XD had no release there) and
Primal Dialga in Chinese (the official 原始 of Primal Reversion; the Explorers
games had no Chinese release). The generator fails when an official name
already exists, and when a form these files name in English lacks a name in
any locale.

## Character names and costume names

Pokopia forms show only the character's name in every locale (Michael,
2026-10-20): "Mosslax", not "Snorlax (Mosslax)". `CHARACTER_NAMES` in
`src/i18n/fullPokemonName.ts` lists their identities. The English names of DJ
Rotom, Smearguru, Mosslax, Peakychu, Tinkmaster, Professor Tangrowth and Chef
Dente, and Zenith Marshadow (Legendary and Mythical Guidebook: Deluxe Edition),
are in `bulbapedia-form-names.json` as well.

PokéAPI names all six Cosplay Pikachu "Cosplayform" in German. German game text
from Omega Ruby and Alpha Sapphire (`pokemon-formnames.json`, rows
`oras.common.5.729`-`734`) names each costume, and Bulbapedia's Cosplay Pikachu
page (rev 4608708) agrees: Rocker-Pikachu, Damen-Pikachu, Star-Pikachu,
Professoren-Pikachu, Wrestler-Pikachu, Cosplay-Pikachu. The generator prefers
that game text for German only. English and Japanese game text differ from
PokéAPI in two places ("Pikachu, Ph.D.", マスク・ド・ピカチュウ); those keep
PokéAPI's names until Michael decides.

## Overdrive, checked on 2026-10-20

The move Overdrive (Toxtricity's signature move) is オーバードライブ, 오버드라이브,
破音, Overdrive (French, German, Italian) and Amplificador (Spanish) in game
text (`move-names.json`, `cmp.wazaname.WAZANAME_786`). That is a different
thing from the look Reshiram, Zekrom and the Kyurem fusions take in battle.
Pokémon Masters EX text (poke-corpus `Masters/ja_messages`, pinned commit)
uses オーバードライブ only for Toxtricity's moves, and Bulbapedia has no page
with オーバードライブ状態. No official localized name for the state is
verified, so Overdrive keeps the English descriptor.

## Move names and other game terms

`move-names.json` and `game-terms.json` come from `npm run i18n:game-terms`
(`scripts/i18n/extract-game-terms.ts`), at the same pinned commit. They
record the game, file and message id of every string, and the SHA-256 of
every file read. The downloads are cached in `docs/i18n/poke-corpus/`, which
is not committed.

The newest game that has a string wins: Pokémon Champions, then Legends: Z-A,
then Pokémon HOME, then Scarlet/Violet and older games.

| What | Where in the games |
|---|---|
| 845 move names | Champions `wazaname` (832), Legends: Z-A `wazaname` (13) |
| Physical, Special, Status | Champions `narrowdown_s_14` to `_16`, the move filter |
| Contest conditions | HOME `nx_status_detailed_521` to `_525` (かっこよさ, Coolness, Sang-froid) |
| Paldean Tauros breeds | Champions `zkn_form_syn.ZKN_FORM_128_001` to `_003` |
| Game titles | Champions `bgm_series`, Bank's Poké Transporter titles, HOME's software names |
| Villain teams and leaders | Let's Go, BDSP, Ultra Sun/Ultra Moon, Sword/Shield, Scarlet/Violet and Masters trainer classes and names |
| Region names | HOME's box list, `nx_box_list_pokedex_01` to `_10` |

A sub-label that joins several strings says so in `composed`, and a language
the games leave without a string is listed in `english`. Chinese has no Black 2
or White 2, so the Chinese "Black 2/White 2" label stays English. No game
names Yellow in Korean or Chinese, or the Totem and Titan Pokémon as a group,
so those labels name only the titles the games give. Traditional Chinese
writes the Ultra Sun/Ultra Moon team names as trainer classes with the
possessive 的 (海洋隊的, "Team Aqua's", as in "Team Aqua's Grunt"), the only form
those games use. The labels drop that trailing 的 to name the team (海洋隊).
Japanese trainer classes before Scarlet/Violet spell the teams in kana
(アクアだん), so the Japanese labels take the kanji team names (アクア団,
エーテル財団) from Pokémon Masters EX: its profile hashtags
(`profile_hash_tag_name.280001000` to `280007000`, with the # removed) and
`speaker_name.speaker_109` for ロケット団. They match Scarlet/Violet's スター団.

```sh
npm run i18n:game-terms   # re-extract (network on the first run)
npm run i18n:terms        # catalogs/terms and src/i18n/moves
npm run i18n:names        # the Tauros breeds in src/i18n/names
npm run i18n:verify       # holds the catalogs to the fixtures
```
