import type { Locale } from '@/i18n/config';
import type { PickerMon } from './catalog';

/**
 * Why a form names its source game in the picker tooltip:
 *
 * - `spin-off`: the form exists only in a spin-off game.
 * - `event`: a main-series form that only an event, a demo transfer, or a
 *   Pokémon HOME reward gives.
 * - `story`: a main-series form the player meets in the story but cannot get.
 * - `state`: a look a Pokémon takes for a move, in battle, or as a ride, in
 *   the game it comes from. It is not a form the player keeps.
 *
 * Evidence for each row: docs/favorite-picker-work/source-games/README.md.
 */
type SourceGroup = 'spin-off' | 'event' | 'story' | 'state';

/**
 * The groups whose forms show the game. Michael, 2026-10-20: "let's do it for
 * spin-off games, event-only, and story-only, but not for battle/ride states".
 */
const SHOWN_GROUPS: ReadonlySet<SourceGroup> = new Set(['spin-off', 'event', 'story']);

type GameTitle = Readonly<Record<Locale, string>>;

/** Same string in every locale: the game uses one title worldwide. */
const everywhere = (title: string): GameTitle =>
  ({ en: title, ja: title, ko: title, 'zh-Hans': title, 'zh-Hant': title, fr: title, de: title, es: title, it: title });

/**
 * Official titles without the series word (Michael, 2026-10-20: "drop the word
 * "pokemon" from the game name in all languages"). Pokémon GO, Pokémon HOME
 * and Japanese Pokopia keep it: the rest of the title would not name the game.
 * Each source is in the evidence README. A game with no release in a locale
 * keeps the English title there.
 */
const GAMES = {
  pokopia: { ...everywhere('Pokopia'), ja: 'ぽこ あ ポケモン' },
  'mystery-dungeon': {
    ...everywhere('Mystery Dungeon'),
    ja: '不思議のダンジョン', ko: '불가사의 던전',
    fr: 'Donjon Mystère', es: 'Mundo misterioso',
  },
  'mystery-dungeon-explorers': {
    ...everywhere('Mystery Dungeon: Explorers of Time, Darkness and Sky'),
    ja: '不思議のダンジョン 時の探検隊・闇の探検隊・空の探検隊',
    ko: '불가사의 던전: 시간의 탐험대・어둠의 탐험대',
    fr: 'Donjon Mystère : Explorateurs du Temps, de l’Ombre et du Ciel',
    de: 'Mystery Dungeon: Erkundungsteam Zeit, Dunkelheit und Himmel',
    es: 'Mundo misterioso: Exploradores del tiempo, de la oscuridad y del cielo',
    it: 'Mystery Dungeon: Esploratori del Tempo, dell’Oscurità e del Cielo',
  },
  xd: {
    ...everywhere('XD: Gale of Darkness'),
    ja: 'ＸＤ 闇の旋風ダーク・ルギア', fr: 'XD : Le Souffle des Ténèbres', de: 'XD: Der Dunkle Sturm',
    es: 'XD: Tempestad oscura', it: 'XD: Tempesta Oscura',
  },
  go: everywhere('Pokémon GO'),
  home: everywhere('Pokémon HOME'),
  bw: {
    en: 'Black and White', ja: 'ブラック・ホワイト', ko: '블랙・화이트',
    'zh-Hans': '黑／白', 'zh-Hant': '黑／白',
    fr: 'Noir et Blanc', de: 'Schwarze Edition und Weiße Edition',
    es: 'Negro y Blanco', it: 'Nero e Bianco',
  },
  hgss: {
    en: 'HeartGold and SoulSilver', ja: 'ハートゴールド・ソウルシルバー',
    ko: '하트골드・소울실버', 'zh-Hans': '心金／魂银', 'zh-Hant': '心金／魂銀',
    fr: 'HeartGold et SoulSilver', de: 'HeartGold und SoulSilver',
    es: 'HeartGold y SoulSilver', it: 'Oro HeartGold e Argento SoulSilver',
  },
  b2w2: {
    en: 'Black 2 and White 2', ja: 'ブラック2・ホワイト2', ko: '블랙2・화이트2',
    'zh-Hans': '黑２／白２', 'zh-Hant': '黑２／白２',
    fr: 'Noir 2 et Blanc 2', de: 'Schwarze Edition 2 und Weiße Edition 2',
    es: 'Negro 2 y Blanco 2', it: 'Nero 2 e Bianco 2',
  },
  xy: {
    en: 'X and Y', ja: 'X・Y', ko: 'X・Y',
    'zh-Hans': 'X／Y', 'zh-Hant': 'X／Y',
    fr: 'X et Y', de: 'X und Y', es: 'X y Y', it: 'X e Y',
  },
  sm: {
    en: 'Sun and Moon', ja: 'サン・ムーン', ko: '썬・문',
    'zh-Hans': '太阳／月亮', 'zh-Hant': '太陽／月亮',
    fr: 'Soleil et Lune', de: 'Sonne und Mond', es: 'Sol y Luna', it: 'Sole e Luna',
  },
  usum: {
    en: 'Ultra Sun and Ultra Moon', ja: 'ウルトラサン・ウルトラムーン',
    ko: '울트라썬・울트라문', 'zh-Hans': '究极之日／究极之月', 'zh-Hant': '究極之日／究極之月',
    fr: 'Ultra-Soleil et Ultra-Lune', de: 'Ultrasonne und Ultramond',
    es: 'Ultrasol y Ultraluna', it: 'Ultrasole e Ultraluna',
  },
  swsh: {
    en: 'Sword and Shield', ja: 'ソード・シールド', ko: '소드・실드',
    'zh-Hans': '剑／盾', 'zh-Hant': '劍／盾',
    fr: 'Épée et Bouclier', de: 'Schwert und Schild', es: 'Espada y Escudo', it: 'Spada e Scudo',
  },
  sv: {
    en: 'Scarlet and Violet', ja: 'スカーレット・バイオレット', ko: '스칼렛・바이올렛',
    'zh-Hans': '朱／紫', 'zh-Hant': '朱／紫',
    fr: 'Écarlate et Violet', de: 'Karmesin und Purpur', es: 'Escarlata y Púrpura', it: 'Scarlatto e Violetto',
  },
} as const satisfies Record<string, GameTitle>;

type Game = keyof typeof GAMES;

/** Picker id, then the game the form comes from and why it names it. */
const FORM_SOURCES: Readonly<Record<number, readonly [Game, SourceGroup]>> = {
  11112: ['pokopia', 'spin-off'], // DJ Rotom
  11117: ['pokopia', 'spin-off'], // Smearguru
  11120: ['pokopia', 'spin-off'], // Mosslax
  11121: ['pokopia', 'spin-off'], // Peakychu
  11122: ['mystery-dungeon', 'spin-off'], // Purple Kecleon
  11123: ['xd', 'spin-off'], // Shadow Lugia
  11124: ['mystery-dungeon-explorers', 'spin-off'], // Primal Dialga
  11125: ['pokopia', 'spin-off'], // Tinkmaster
  11126: ['pokopia', 'spin-off'], // Professor Tangrowth
  11127: ['pokopia', 'spin-off'], // Chef Dente
  10263: ['go', 'spin-off'], // Gimmighoul (Roaming Form)
  11064: ['hgss', 'event'], // Spiky-eared Pichu
  10094: ['sm', 'event'], // Pikachu (Original Cap)
  10095: ['sm', 'event'], // Pikachu (Hoenn Cap)
  10096: ['sm', 'event'], // Pikachu (Sinnoh Cap)
  10097: ['sm', 'event'], // Pikachu (Unova Cap)
  10098: ['sm', 'event'], // Pikachu (Kalos Cap)
  10099: ['sm', 'event'], // Pikachu (Alola Cap)
  10148: ['usum', 'event'], // Pikachu (Partner Cap)
  10160: ['swsh', 'event'], // Pikachu (World Cap)
  10117: ['sm', 'event'], // Ash-Greninja
  11021: ['xy', 'event'], // Vivillon (Fancy Pattern)
  11030: ['xy', 'event'], // Vivillon (Poké Ball Pattern)
  10192: ['swsh', 'event'], // Zarude (Dada)
  10147: ['home', 'event'], // Magearna (Original Color)
  10190: ['swsh', 'story'], // Eternamax Eternatus
  11105: ['bw', 'state'], // Reshiram (Overdrive)
  11106: ['bw', 'state'], // Zekrom (Overdrive)
  11107: ['b2w2', 'state'], // Black Kyurem (Overdrive)
  11108: ['b2w2', 'state'], // White Kyurem (Overdrive)
  11109: ['sm', 'state'], // Solgaleo (Radiant Sun Phase)
  11110: ['sm', 'state'], // Lunala (Full Moon Phase)
  11111: ['sm', 'state'], // Marshadow (Zenith)
  11118: ['sv', 'state'], // Koraidon (Limited Build)
  11119: ['sv', 'state'], // Miraidon (Low-Power Mode)
};

/** The source game's title in `locale`, or null when the tooltip names none. */
export function sourceGameTitle(mon: PickerMon, locale: Locale): string | null {
  const source = FORM_SOURCES[mon.id];
  if (!source || !SHOWN_GROUPS.has(source[1])) return null;
  return GAMES[source[0]][locale];
}
