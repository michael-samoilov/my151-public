

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { LOCALES, type Locale } from '../../src/i18n/config';

const COMMIT = 'd74a89ba69cbabc491b65c3e88af8722bb34a927';
const BASE = `https://raw.githubusercontent.com/abcboy101/poke-corpus/${COMMIT}/corpus`;
const CACHE = 'docs/i18n/poke-corpus/corpus';
export const MOVE_NAMES_PATH = 'docs/i18n/sources/move-names.json';
export const GAME_TERMS_PATH = 'docs/i18n/sources/game-terms.json';

type Text = Partial<Record<Locale, string>>;

export interface Sourced {
  readonly game: string;
  readonly file: string;
  readonly qid: string;
  readonly text: Text;
}

export interface GameTerm {
  readonly key: string;
  readonly use: string;
  readonly text: Text;
  readonly composed?: string;
  readonly english?: Partial<Record<Locale, string>>;
  readonly from: readonly Sourced[];
}

export interface GameTermsFixture {
  readonly source: SourceBlock;
  readonly note: string;
  readonly terms: readonly GameTerm[];
  readonly regions: Record<string, Sourced>;
}

export interface MoveNamesFixture {
  readonly source: SourceBlock;
  readonly note: string;
  readonly moves: Record<string, { qid: string; text: Record<Locale, string> }>;
}

interface SourceBlock {
  readonly repo: string;
  readonly commit: string;
  readonly sha256: Record<string, Record<string, string>>;
}

const CORPUS_FILES_NEWEST_FIRST = [
  ['Champions', 'ms'],
  ['LegendsZA', 'common'],
  ['HOME', 'megaturtle_nx'],
  ['HOME', 'megaturtle_sp'],
  ['ScarletViolet', 'common'],
  ['BrilliantDiamondShiningPearl', 'message'],
  ['SwordShield', 'common'],
  ['LetsGoPikachuLetsGoEevee', 'common'],
  ['UltraSunUltraMoon', 'common'],
  ['Bank', 'turtle'],
  ['Masters', 'messages'],
] as const;

const pinned = (path: string): SourceBlock | undefined =>
  existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as { source: SourceBlock }).source : undefined;

const pins = () => ({ ...pinned(GAME_TERMS_PATH)?.sha256, ...pinned(MOVE_NAMES_PATH)?.sha256 });
let PINS: Record<string, Record<string, string>> = {};
const sha256: Record<string, Record<string, string>> = {};

async function readGz(game: string, file: string, lang: string): Promise<string[] | undefined> {
  const path = join(CACHE, game, `${lang}_${file}.txt.gz`);
  if (!existsSync(path)) {
    const res = await fetch(`${BASE}/${game}/${lang}_${file}.txt.gz`);
    if (res.status === 404) return undefined;
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  }
  const bytes = readFileSync(path);
  const hash = createHash('sha256').update(bytes).digest('hex');
  const want = PINS[`${game}/${file}`]?.[lang];
  if (want && want !== hash) throw new Error(`${path}: SHA-256 ${hash} differs from the pinned ${want}`);
  (sha256[`${game}/${file}`] ??= {})[lang] = hash;
  // platform: The poke-corpus dumps use CRLF line endings, so a bare "\n" split leaves a carriage return on each value.
  return gunzipSync(bytes).toString('utf8').split(/\r?\n/);
}

type Table = Map<string, Text>;
const tables = new Map<string, Table>();

async function load(): Promise<void> {
  for (const [game, file] of CORPUS_FILES_NEWEST_FIRST) {
    const ids = await readGz(game, file, 'qid');
    if (!ids) throw new Error(`${game}/${file}: no qid file`);
    const table: Table = new Map(ids.map((id) => [id, {}]));
    for (const locale of LOCALES) {
      const lines = await readGz(game, file, locale);
      if (!lines) continue;
      if (lines.length !== ids.length) throw new Error(`${game}/${file} ${locale}: not line-aligned with qid`);
      ids.forEach((id, i) => {
        if (lines[i]) table.get(id)![locale] = lines[i];
      });
    }
    tables.set(`${game}/${file}`, table);
    console.log(`  read ${game}/${file}`);
  }
}

function message(game: string, file: string, qid: string): Sourced {
  const text = tables.get(`${game}/${file}`)?.get(qid);
  if (!text?.en) throw new Error(`${game}/${file}: no ${qid}`);
  for (const [locale, value] of Object.entries(text)) {
    // platform: A game text control code means the game composes the label at runtime, so the line is no literal.
    if (/\[VAR |\[~ |\[Name:/.test(value)) throw new Error(`${qid} ${locale} is not a literal: ${value}`);
  }
  return { game, file, qid, text };
}

const complete = (text: Text) => LOCALES.every((l) => text[l] && !/^[-―—]+$/.test(text[l]!));

function moveNames(): MoveNamesFixture['moves'] {
  const moves = JSON.parse(readFileSync('src/data/moves.json', 'utf8')) as { id: number; name: string }[];
  const out: MoveNamesFixture['moves'] = {};
  const counts: Record<string, number> = {};
  for (const move of [...moves].sort((a, b) => a.id - b.id)) {
    const n = String(move.id).padStart(3, '0');
    const candidates: [string, string, string][] = [
      ['Champions', 'ms', `cmp.wazaname.WAZANAME_${n}`],
      ['LegendsZA', 'common', `za.wazaname.WAZANAME_${n}`],
      ['ScarletViolet', 'common', `sv.wazaname.WAZANAME_${n}`],
    ];
    const hit = candidates.find(([game, file, qid]) => {
      const text = tables.get(`${game}/${file}`)?.get(qid);
      return text && complete(text);
    });
    if (!hit) throw new Error(`move ${move.id} (${move.name}) has no complete name in any game`);
    const { text } = message(...hit);
    if (text.en !== move.name) {
      throw new Error(`move ${move.id}: src/data/moves.json says ${JSON.stringify(move.name)}, ${hit[2]} says ${JSON.stringify(text.en)}`);
    }
    out[move.id] = { qid: hit[2], text: text as Record<Locale, string> };
    counts[hit[0]] = (counts[hit[0]] ?? 0) + 1;
  }
  console.log(`  moves: ${Object.keys(out).length} (${Object.entries(counts).map(([g, c]) => `${g} ${c}`).join(', ')})`);
  return out;
}

const BRAND: Record<Locale, RegExp> = {
  en: /^Pokémon\s+/,
  fr: /^Pokémon\s+/,
  de: /^Pokémon\s+/,
  es: /^Pokémon\s+/,
  it: /^Pokémon\s+/,
  ja: /^ポケットモンスター\s*(\\n)?/,
  ko: /^포켓몬스터\s*/,
  'zh-Hans': /^(精灵)?宝可梦\s+/,
  'zh-Hant': /^(精靈)?寶可夢\s+/,
};

const TITLE_JOIN: Record<Locale, string> = {
  en: '/', fr: '/', de: '/', es: '/', it: '/', ko: '・', ja: '・', 'zh-Hans': '／', 'zh-Hant': '／',
};

function seriesTitles(locale: Locale, line: string, count: number): string[] {
  let titles: string[];
  if (['en', 'fr', 'de', 'es', 'it'].includes(locale)) {
    titles = line.replace(/\\n/g, ' ').split(/Pokémon\s+/).slice(1)
      .map((t) => t.replace(/\s*(,|&|\band\b|\bund\b|\bet\b|\by\b|\be\b)\s*$/u, '').trim());
  } else {
    titles = line.replace(BRAND[locale], '').replace(/\\n/g, '').split(/[・／]/).map((t) => t.trim());
  }
  if (titles.length !== count || titles.some((t) => !t)) {
    throw new Error(`${locale}: ${JSON.stringify(line)} did not split into ${count} titles: ${JSON.stringify(titles)}`);
  }
  return titles;
}

const SERIES: Record<string, [qid: string, count: number]> = {
  RG: ['cmp.bgm_series.bgm_series_RG', 2],
  GSC: ['cmp.bgm_series.bgm_series_GSC', 3],
  RSE: ['cmp.bgm_series.bgm_series_RSE', 3],
  DPPt: ['cmp.bgm_series.bgm_series_DPPt', 3],
  HGSS: ['cmp.bgm_series.bgm_series_HGSS', 2],
  BW: ['cmp.bgm_series.bgm_series_BW', 2],
  XY: ['cmp.bgm_series.bgm_series_XY', 2],
  SM: ['cmp.bgm_series.bgm_series_SM', 2],
  SWSH: ['cmp.bgm_series.bgm_series_SWSH', 2],
  SV: ['cmp.bgm_series.bgm_series_SV', 2],
};

type Title = { series: keyof typeof SERIES; item: number } | { game: string; file: string; qid: string; brand: boolean };

const TITLES: Record<string, Title> = {
  red: { series: 'RG', item: 0 },
  blue: { series: 'RG', item: 1 },
  gold: { series: 'GSC', item: 0 },
  silver: { series: 'GSC', item: 1 },
  crystal: { series: 'GSC', item: 2 },
  ruby: { series: 'RSE', item: 0 },
  sapphire: { series: 'RSE', item: 1 },
  emerald: { series: 'RSE', item: 2 },
  diamond: { series: 'DPPt', item: 0 },
  pearl: { series: 'DPPt', item: 1 },
  platinum: { series: 'DPPt', item: 2 },
  heartgold: { series: 'HGSS', item: 0 },
  soulsilver: { series: 'HGSS', item: 1 },
  black: { series: 'BW', item: 0 },
  white: { series: 'BW', item: 1 },
  x: { series: 'XY', item: 0 },
  y: { series: 'XY', item: 1 },
  sun: { series: 'SM', item: 0 },
  moon: { series: 'SM', item: 1 },
  sword: { series: 'SWSH', item: 0 },
  shield: { series: 'SWSH', item: 1 },
  scarlet: { series: 'SV', item: 0 },
  violet: { series: 'SV', item: 1 },
  black2: { game: 'Bank', file: 'turtle', qid: 'bank.24.6', brand: true },
  white2: { game: 'Bank', file: 'turtle', qid: 'bank.24.7', brand: true },
  ultrasun: { game: 'Bank', file: 'turtle', qid: 'bank.39.67', brand: true },
  ultramoon: { game: 'Bank', file: 'turtle', qid: 'bank.39.68', brand: true },
  legendsArceus: { game: 'HOME', file: 'megaturtle_sp', qid: 'home.sp.sp_softwarename.sp_softwarename_047', brand: false },
};

const JAPANESE_SCRIPT = /[぀-ヿ]/;

function title(id: string, locale: Locale): { value: string; from: Sourced } | undefined {
  const def = TITLES[id];
  if ('series' in def) {
    const [qid, count] = SERIES[def.series];
    const from = message('Champions', 'ms', qid);
    const line = from.text[locale];
    return line ? { value: seriesTitles(locale, line, count)[def.item], from } : undefined;
  }
  const from = message(def.game, def.file, def.qid);
  const line = from.text[locale];
  if (!line) return undefined;
  // platform: Pokémon Bank shows Chinese players the Japanese title for games with no Chinese release; that is no Chinese name.
  if (locale.startsWith('zh') && JAPANESE_SCRIPT.test(line)) return undefined;
  if (!def.brand) return { value: line, from };
  if (!BRAND[locale].test(line)) throw new Error(`${def.qid} ${locale}: ${JSON.stringify(line)} does not open with the series name`);
  return { value: line.replace(BRAND[locale], '').trim(), from };
}

const GAME_TITLE_SUBLABELS: Record<string, { titles: string[]; omits?: string }> = {
  'archetype.gift-pokemon.sub.0': { titles: ['red', 'blue'], omits: 'Yellow: the Champions series list names Red and Blue (Red and Green in Japanese) only.' },
  'archetype.gift-pokemon.sub.1': { titles: ['gold', 'silver'] },
  'archetype.gift-pokemon.sub.2': { titles: ['ruby', 'sapphire', 'emerald'] },
  'archetype.gift-pokemon.sub.3': { titles: ['diamond', 'pearl', 'platinum'] },
  'archetype.gift-pokemon.sub.4': { titles: ['black', 'white'] },
  'archetype.gift-pokemon.sub.5': { titles: ['x', 'y'] },
  'archetype.gift-pokemon.sub.6': { titles: ['sun', 'moon'] },
  'archetype.gift-pokemon.sub.7': { titles: ['sword', 'shield'] },
  'archetype.reward-pokemon.sub.0': { titles: ['red', 'blue'], omits: 'Yellow, as above.' },
  'archetype.reward-pokemon.sub.1': { titles: ['crystal', 'heartgold', 'soulsilver'] },
  'archetype.reward-pokemon.sub.2': { titles: ['black2', 'white2'] },
  'archetype.static-encounter.sub.0': { titles: ['red', 'blue'], omits: 'Yellow, as above.' },
  'archetype.static-encounter.sub.1': { titles: ['gold', 'silver', 'crystal'] },
  'archetype.static-encounter.sub.2': { titles: ['ruby', 'sapphire', 'emerald'] },
  'archetype.static-encounter.sub.3': { titles: ['diamond', 'pearl', 'platinum'] },
  'archetype.static-encounter.sub.4': { titles: ['black', 'white', 'black2', 'white2'] },
  'archetype.static-encounter.sub.5': { titles: ['sun', 'moon', 'ultrasun', 'ultramoon'], omits: 'Totems: no game names the Totem Pokémon as a group.' },
  'archetype.static-encounter.sub.6': { titles: ['legendsArceus'] },
  'archetype.static-encounter.sub.7': { titles: ['scarlet', 'violet'], omits: 'Titans: no game names the Titan Pokémon as a group.' },
  'archetype.cross-gen-evo.sub.5': { titles: ['legendsArceus'] },
  'category.starter.sub.8': { titles: ['legendsArceus'] },
};

function gameTitleTerms(): GameTerm[] {
  return Object.entries(GAME_TITLE_SUBLABELS).map(([key, { titles, omits }]) => {
    const text: Text = {};
    const english: Partial<Record<Locale, string>> = {};
    const from = new Map<string, Sourced>();
    for (const locale of LOCALES) {
      if (locale === 'en') continue;
      const parts = titles.map((id) => title(id, locale));
      parts.forEach((p) => p && from.set(p.from.qid, p.from));
      const missing = titles.filter((_, i) => !parts[i]);
      const found = parts.filter((p): p is NonNullable<typeof p> => !!p).map((p) => p.value);

      if (found.length === 0) {
        english[locale] = `No ${locale} title for ${missing.join(', ')} in any game.`;
        continue;
      }
      if (missing.length) english[locale] = `Names ${found.length} of ${titles.length} titles; no ${locale} title for ${missing.join(', ')}.`;
      text[locale] = found.join(TITLE_JOIN[locale]);
    }
    return {
      key,
      use: 'A subgroup heading in the Pokédex builder’s Pokémon browser.',
      text,
      composed: `Game titles with the series name removed, joined with the separator the language’s own series lines use.${omits ? ` Leaves out ${omits}` : ''}`,
      ...(Object.keys(english).length ? { english } : {}),
      from: [...from.values()],
    };
  });
}

const PEOPLE: Record<string, [game: string, file: string, qid: string]> = {
  rocket: ['LetsGoPikachuLetsGoEevee', 'common', 'lgpe.trtype.TRTYPE_ROCKETM'],
  giovanni: ['LetsGoPikachuLetsGoEevee', 'common', 'lgpe.trname.trname_23'],
  aqua: ['UltraSunUltraMoon', 'common', 'usum.common.111.198'],
  magma: ['UltraSunUltraMoon', 'common', 'usum.common.111.200'],
  archie: ['UltraSunUltraMoon', 'common', 'usum.common.63.34'],
  maxie: ['UltraSunUltraMoon', 'common', 'usum.common.63.33'],
  galactic: ['BrilliantDiamondShiningPearl', 'message', 'bdsp.dp_trainers_type.DP_Trainers_Type_TR_GINGAM_01'],
  cyrus: ['BrilliantDiamondShiningPearl', 'message', 'bdsp.dp_trainers_name.DP_Trainers_Name_TR_GINGALBOSS_01'],
  mars: ['BrilliantDiamondShiningPearl', 'message', 'bdsp.dp_trainers_name.DP_Trainers_Name_TR_GINGALEADER1_01'],
  jupiter: ['BrilliantDiamondShiningPearl', 'message', 'bdsp.dp_trainers_name.DP_Trainers_Name_TR_GINGALEADER2_01'],
  saturn: ['BrilliantDiamondShiningPearl', 'message', 'bdsp.dp_trainers_name.DP_Trainers_Name_TR_GINGALEADER3_01'],
  plasma: ['UltraSunUltraMoon', 'common', 'usum.common.111.201'],
  ghetsis: ['UltraSunUltraMoon', 'common', 'usum.common.63.36'],
  n: ['Masters', 'messages', 'masters.trainer_name.ch0089'],
  colress: ['UltraSunUltraMoon', 'common', 'usum.common.63.43'],
  flare: ['UltraSunUltraMoon', 'common', 'usum.common.111.202'],
  lysandre: ['UltraSunUltraMoon', 'common', 'usum.common.63.37'],
  skull: ['UltraSunUltraMoon', 'common', 'usum.common.111.28'],
  guzma: ['UltraSunUltraMoon', 'common', 'usum.common.63.23'],
  plumeria: ['UltraSunUltraMoon', 'common', 'usum.common.63.24'],
  aether: ['UltraSunUltraMoon', 'common', 'usum.common.111.73'],
  lusamine: ['UltraSunUltraMoon', 'common', 'usum.common.63.20'],
  macroCosmos: ['SwordShield', 'common', 'swsh.pw_worklist.msg_ui_pw_worklist_00'],
  rose: ['SwordShield', 'common', 'swsh.trname.ROSE_01'],
  star: ['ScarletViolet', 'common', 'sv.trtype.MSG_TRTYPE_STAR_BOSS'],
  mela: ['ScarletViolet', 'common', 'sv.trname.TRNAME_MEROKO'],
  atticus: ['ScarletViolet', 'common', 'sv.trname.TRNAME_SYUUMEI'],
  ortega: ['ScarletViolet', 'common', 'sv.trname.TRNAME_ORUTHIGA'],
  eri: ['ScarletViolet', 'common', 'sv.trname.TRNAME_BIWA'],
  giacomo: ['ScarletViolet', 'common', 'sv.trname.TRNAME_PIINYA'],
  penny: ['ScarletViolet', 'common', 'sv.trname.TRNAME_BOTAN'],
};

// platform: Japanese trainer classes before Scarlet/Violet spell teams in kana; Pokémon Masters EX hashtags spell them in kanji with a leading #.
const JAPANESE_KANJI_TEAM_SOURCES: Record<string, [game: string, file: string, qid: string]> = {
  rocket: ['Masters', 'messages', 'masters.speaker_name.speaker_109'],
  magma: ['Masters', 'messages', 'masters.profile_hash_tag_name.280001000'],
  aqua: ['Masters', 'messages', 'masters.profile_hash_tag_name.280002000'],
  galactic: ['Masters', 'messages', 'masters.profile_hash_tag_name.280003000'],
  plasma: ['Masters', 'messages', 'masters.profile_hash_tag_name.280004000'],
  flare: ['Masters', 'messages', 'masters.profile_hash_tag_name.280005000'],
  skull: ['Masters', 'messages', 'masters.profile_hash_tag_name.280006000'],
  aether: ['Masters', 'messages', 'masters.profile_hash_tag_name.280007000'],
};

const VILLAINS: Record<string, { teams: string[]; people: string[]; paired?: boolean }> = {
  'archetype.evil-team.sub.1': { teams: ['rocket'], people: ['giovanni'] },
  'archetype.evil-team.sub.2': { teams: ['aqua', 'magma'], people: ['archie', 'maxie'], paired: true },
  'archetype.evil-team.sub.3': { teams: ['galactic'], people: ['cyrus', 'mars', 'jupiter', 'saturn'] },
  'archetype.evil-team.sub.4': { teams: ['plasma'], people: ['ghetsis', 'n', 'colress'] },
  'archetype.evil-team.sub.5': { teams: ['flare'], people: ['lysandre'] },
  'archetype.evil-team.sub.6': { teams: ['skull'], people: ['guzma', 'plumeria'] },
  'archetype.evil-team.sub.7': { teams: ['aether'], people: ['lusamine'] },
  'archetype.evil-team.sub.8': { teams: ['macroCosmos'], people: ['rose'] },
  'archetype.evil-team.sub.9': { teams: ['star'], people: ['mela', 'atticus', 'ortega', 'eri', 'giacomo', 'penny'] },
};

const CJK = (l: Locale) => l === 'ja' || l.startsWith('zh');

function villainTerms(): GameTerm[] {
  return Object.entries(VILLAINS).map(([key, { teams, people, paired }]) => {
    const text: Text = {};
    const english: Partial<Record<Locale, string>> = {};
    const from = new Map<string, Sourced>();
    for (const locale of LOCALES) {
      if (locale === 'en') continue;
      const pick = (id: string, sources = PEOPLE) => {
        const source = message(...sources[id]);
        from.set(source.qid, source);
        return source.text[locale];
      };
      // platform: The game's trainer class is the team name plus the possessive 的, so the label drops it to name the team.
      const teamNames = teams.map((id) =>
        locale === 'ja' && JAPANESE_KANJI_TEAM_SOURCES[id] ? pick(id, JAPANESE_KANJI_TEAM_SOURCES)?.replace(/^#/, '') : pick(id)?.replace(/的$/, ''));
      const names = people.map((id) => pick(id));
      const missing = people.filter((_, i) => !names[i]);
      if (teamNames.some((t) => !t) || missing.some((id) => id !== 'n')) {
        english[locale] = `No ${locale} text for ${[...teams, ...people].filter((id) => !pick(id)).join(', ')}.`;
        continue;
      }
      if (missing.length) english[locale] = 'N has no Simplified Chinese source; the label writes N, as every other language does.';
      const filled = names.map((n) => n ?? 'N');
      const joinTeams = TITLE_JOIN[locale];
      const joinPeople = paired ? TITLE_JOIN[locale] : CJK(locale) ? '、' : ', ';
      const [open, close] = CJK(locale) ? ['（', '）'] : [' (', ')'];
      text[locale] = `${teamNames.join(joinTeams)}${open}${filled.join(joinPeople)}${close}`;
    }
    return {
      key,
      use: 'A subgroup heading in the Pokédex builder’s Evil Team section.',
      text,
      composed: 'Team names, then their leaders in brackets, as the English label has them.',
      ...(Object.keys(english).length ? { english } : {}),
      from: [...from.values()],
    };
  });
}

function verbatim(key: string, use: string, game: string, file: string, qid: string): GameTerm {
  const from = message(game, file, qid);
  if (!complete(from.text)) throw new Error(`${qid}: missing a language`);
  const text = Object.fromEntries(LOCALES.filter((l) => l !== 'en').map((l) => [l, from.text[l]!]));
  return { key, use, text, from: [from] };
}

function singleTerms(): GameTerm[] {
  const category = (id: string, n: string) =>
    verbatim(`league.category.${id}`, 'Move category: the TM picker’s filter chips and the category icon’s name.', 'Champions', 'ms', `cmp.narrowdown.narrowdown_s_${n}`);

  const contest = (id: string, n: string) =>
    verbatim(`league.contest.${id}`, 'Contest condition: the TM picker’s filter chips.', 'HOME', 'megaturtle_nx', `home.nx.status_system.nx_status_detailed_${n}`);
  const breed = (appId: number, n: string) =>
    verbatim(`form.${appId}`, 'The Paldean Tauros breed’s form name, in the Pokémon names catalog.', 'Champions', 'ms', `cmp.zkn_form_syn.ZKN_FORM_128_${n}`);
  return [
    category('physical', '14'), category('special', '15'), category('status', '16'),
    contest('cool', '521'), contest('beautiful', '522'), contest('cute', '523'), contest('clever', '524'), contest('tough', '525'),
    breed(10250, '001'), breed(10251, '002'), breed(10252, '003'),
  ];
}

function milceryTerm(): GameTerm {
  const from = message('Champions', 'ms', 'cmp.monsname_syn.MONSNAME_868');
  return {
    key: 'archetype.evolution-item.sub.28',
    use: 'A subgroup heading in the Pokédex builder’s Evolution Item section.',
    text: Object.fromEntries(LOCALES.filter((l) => l !== 'en').map((l) => [l, from.text[l]!])),
    composed: 'Milcery’s name alone. The seven Sweets are separate items, and no game names them as a group.',
    from: [from],
  };
}

function regions(): Record<string, Sourced> {
  const ids = ['kanto', 'johto', 'hoenn', 'sinnoh', 'unova', 'kalos', 'alola', 'galar', 'hisui', 'paldea'];
  return Object.fromEntries(ids.map((id, i) =>
    [id, message('HOME', 'megaturtle_nx', `home.nx.box_system.nx_box_list_pokedex_${String(i + 1).padStart(2, '0')}`)]));
}

function writeMoves(fixture: MoveNamesFixture): void {
  const rows = Object.entries(fixture.moves).map(([id, row]) => `    ${JSON.stringify(id)}: ${JSON.stringify(row)}`);
  const head = JSON.stringify({ source: fixture.source, note: fixture.note }, null, 2).slice(0, -2);
  writeFileSync(MOVE_NAMES_PATH, `${head},\n  "moves": {\n${rows.join(',\n')}\n  }\n}\n`);
}

async function main(): Promise<void> {
  PINS = pins();
  await load();
  const source = (keys: string[]): SourceBlock => ({
    repo: 'https://github.com/abcboy101/poke-corpus',
    commit: COMMIT,
    sha256: Object.fromEntries(keys.map((k) => [k, sha256[k]])),
  });

  writeMoves({
    source: source(['Champions/ms', 'LegendsZA/common', 'ScarletViolet/common']),
    note: 'Move names in the TM picker, on the trainer card and in the exported pictures. Each move takes the newest game that names it in all nine languages: Pokémon Champions, then Legends: Z-A, then Scarlet/Violet.',
    moves: moveNames(),
  });
  console.log(`  wrote ${MOVE_NAMES_PATH}`);

  const terms = [...singleTerms(), ...gameTitleTerms(), ...villainTerms(), milceryTerm()];
  const used = new Set(terms.flatMap((t) => t.from.map((f) => `${f.game}/${f.file}`)));
  used.add('HOME/megaturtle_nx');
  const fixture: GameTermsFixture = {
    source: source(CORPUS_FILES_NEWEST_FIRST.map(([g, f]) => `${g}/${f}`).filter((k) => used.has(k))),
    note: 'Sourced values for catalog keys (src/i18n/catalogs/terms) and Tauros form names (src/i18n/names). `npm run i18n:terms` and `npm run i18n:names` copy them in; `npm run i18n:verify` holds the catalogs to them.',
    terms,
    regions: regions(),
  };
  writeFileSync(GAME_TERMS_PATH, `${JSON.stringify(fixture, null, 2)}\n`);
  console.log(`  wrote ${GAME_TERMS_PATH}: ${terms.length} terms`);
  for (const t of terms) {
    for (const [locale, why] of Object.entries(t.english ?? {})) console.log(`    ${t.key} ${locale}: ${why}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void main();
}
