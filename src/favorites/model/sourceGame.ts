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

/** The groups whose forms show the game. `state` waits on Michael. */
const SHOWN_GROUPS: ReadonlySet<SourceGroup> = new Set(['spin-off', 'event', 'story']);

type GameTitle = Readonly<Record<Locale, string>>;

/** Same string in every locale: the game uses one title worldwide. */
const everywhere = (title: string): GameTitle =>
  ({ en: title, ja: title, ko: title, 'zh-Hans': title, 'zh-Hant': title, fr: title, de: title, es: title, it: title });

/**
 * Official titles. Each source is in the evidence README. Mystery Dungeon has
 * no Chinese release, so both Chinese locales keep the English title.
 */
const GAMES = {
  pokopia: { ...everywhere('Pokémon Pokopia'), ja: 'ぽこ あ ポケモン' },
  'mystery-dungeon': {
    ...everywhere('Pokémon Mystery Dungeon'),
    ja: 'ポケモン不思議のダンジョン', ko: '포켓몬 불가사의 던전',
    fr: 'Pokémon Donjon Mystère', es: 'Pokémon Mundo misterioso',
  },
  go: everywhere('Pokémon GO'),
  home: everywhere('Pokémon HOME'),
  bw: {
    en: 'Pokémon Black and White', ja: 'ポケットモンスター ブラック・ホワイト', ko: '포켓몬스터 블랙・화이트',
    'zh-Hans': '宝可梦 黑／白', 'zh-Hant': '寶可夢 黑／白',
    fr: 'Pokémon Noir et Blanc', de: 'Pokémon Schwarze Edition und Weiße Edition',
    es: 'Pokémon Negro y Blanco', it: 'Pokémon Nero e Bianco',
  },
  hgss: {
    en: 'Pokémon HeartGold and SoulSilver', ja: 'ポケットモンスター ハートゴールド・ソウルシルバー',
    ko: '포켓몬스터 하트골드・소울실버', 'zh-Hans': '宝可梦 心金／魂银', 'zh-Hant': '寶可夢 心金／魂銀',
    fr: 'Pokémon HeartGold et SoulSilver', de: 'Pokémon HeartGold und SoulSilver',
    es: 'Pokémon HeartGold y SoulSilver', it: 'Pokémon Oro HeartGold e Argento SoulSilver',
  },
  b2w2: {
    en: 'Pokémon Black 2 and White 2', ja: 'ポケットモンスター ブラック2・ホワイト2', ko: '포켓몬스터 블랙2・화이트2',
    'zh-Hans': '宝可梦 黑２／白２', 'zh-Hant': '寶可夢 黑２／白２',
    fr: 'Pokémon Noir 2 et Blanc 2', de: 'Pokémon Schwarze Edition 2 und Weiße Edition 2',
    es: 'Pokémon Negro 2 y Blanco 2', it: 'Pokémon Nero 2 e Bianco 2',
  },
  xy: {
    en: 'Pokémon X and Y', ja: 'ポケットモンスター X・Y', ko: '포켓몬스터 X・Y',
    'zh-Hans': '宝可梦 X／Y', 'zh-Hant': '寶可夢 X／Y',
    fr: 'Pokémon X et Y', de: 'Pokémon X und Y', es: 'Pokémon X y Y', it: 'Pokémon X e Y',
  },
  sm: {
    en: 'Pokémon Sun and Moon', ja: 'ポケットモンスター サン・ムーン', ko: '포켓몬스터 썬・문',
    'zh-Hans': '精灵宝可梦 太阳／月亮', 'zh-Hant': '精靈寶可夢 太陽／月亮',
    fr: 'Pokémon Soleil et Lune', de: 'Pokémon Sonne und Mond', es: 'Pokémon Sol y Luna', it: 'Pokémon Sole e Luna',
  },
  usum: {
    en: 'Pokémon Ultra Sun and Ultra Moon', ja: 'ポケットモンスター ウルトラサン・ウルトラムーン',
    ko: '포켓몬스터 울트라썬・울트라문', 'zh-Hans': '精灵宝可梦 究极之日／究极之月', 'zh-Hant': '精靈寶可夢 究極之日／究極之月',
    fr: 'Pokémon Ultra-Soleil et Ultra-Lune', de: 'Pokémon Ultrasonne und Ultramond',
    es: 'Pokémon Ultrasol y Ultraluna', it: 'Pokémon Ultrasole e Ultraluna',
  },
  swsh: {
    en: 'Pokémon Sword and Shield', ja: 'ポケットモンスター ソード・シールド', ko: '포켓몬스터 소드・실드',
    'zh-Hans': '宝可梦 剑／盾', 'zh-Hant': '寶可夢 劍／盾',
    fr: 'Pokémon Épée et Bouclier', de: 'Pokémon Schwert und Schild', es: 'Pokémon Espada y Escudo', it: 'Pokémon Spada e Scudo',
  },
  sv: {
    en: 'Pokémon Scarlet and Violet', ja: 'ポケットモンスター スカーレット・バイオレット', ko: '포켓몬스터 스칼렛・바이올렛',
    'zh-Hans': '宝可梦 朱／紫', 'zh-Hant': '寶可夢 朱／紫',
    fr: 'Pokémon Écarlate et Violet', de: 'Pokémon Karmesin und Purpur', es: 'Pokémon Escarlata y Púrpura', it: 'Pokémon Scarlatto e Violetto',
  },
} as const satisfies Record<string, GameTitle>;

type Game = keyof typeof GAMES;

/** Picker id, then the game the form comes from and why it names it. */
const FORM_SOURCES: Readonly<Record<number, readonly [Game, SourceGroup]>> = {
  11112: ['pokopia', 'spin-off'], // DJ Rotom
  11117: ['pokopia', 'spin-off'], // Smearguru
  11120: ['pokopia', 'spin-off'], // Mosslax, live once claude/pokopia-kiriaura merges
  11121: ['pokopia', 'spin-off'], // Peakychu, likewise
  11122: ['mystery-dungeon', 'spin-off'], // Purple Kecleon
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
