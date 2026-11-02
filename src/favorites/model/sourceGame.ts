import type { Locale } from '@/i18n/config';
import type { PickerMon } from './catalog';

type SourceGroup = 'spin-off' | 'event' | 'story' | 'state';

const SHOWN_GROUPS: ReadonlySet<SourceGroup> = new Set(['spin-off', 'event', 'story']);

type GameTitle = Readonly<Record<Locale, string>>;

const everywhere = (title: string): GameTitle =>
  ({ en: title, ja: title, ko: title, 'zh-Hans': title, 'zh-Hant': title, fr: title, de: title, es: title, it: title });

const GAMES = {
  pokopia: { ...everywhere('Pokopia'), ja: 'ぽこ あ ポケモン' },
  'mystery-dungeon': {
    ...everywhere('Mystery Dungeon'),
    ja: '不思議のダンジョン', ko: '불가사의 던전',
    'zh-Hans': '不可思议迷宫', 'zh-Hant': '不可思議迷宮',
    fr: 'Donjon Mystère', es: 'Mundo misterioso',
  },
  xd: {
    ...everywhere('XD: Gale of Darkness'),
    ja: 'XD 闇の旋風ダーク・ルギア', ko: 'XD 어둠의 선풍 다크루기아',
    'zh-Hans': 'XD 暗之旋风 黑暗洛奇亚', 'zh-Hant': 'XD 暗之旋風 陰暗洛奇亞',
    fr: 'XD : Le Souffle des Ténèbres', de: 'XD: Der Dunkle Sturm',
    es: 'XD: Tempestad oscura', it: 'XD: Tempesta Oscura',
  },
  'ranger-gs': {
    ...everywhere('Ranger: Guardian Signs'),
    ja: 'レンジャー 光の軌跡', ko: '레인저 빛의 궤적',
    'zh-Hans': '巡护员 光的轨迹', 'zh-Hant': '巡護員 光的軌跡',
    fr: 'Ranger : Sillages de Lumière', de: 'Ranger: Spuren des Lichts',
    es: 'Ranger: Trazos de luz', it: 'Ranger: Tracce di Luce',
  },
  pokken: {
    ...everywhere('Pokkén Tournament'),
    ja: 'ポッ拳 POKKÉN TOURNAMENT', 'zh-Hans': '宝可拳', 'zh-Hant': '寶可拳',
  },
  go: everywhere('Pokémon GO'),
  home: everywhere('Pokémon HOME'),
  dp: {
    en: 'Diamond and Pearl', ja: 'ダイヤモンド・パール', ko: 'DP 디아루가・DP 펄기아',
    'zh-Hans': '钻石／珍珠', 'zh-Hant': '鑽石／珍珠',
    fr: 'Diamant et Perle', de: 'Diamant und Perl', es: 'Diamante y Perla', it: 'Diamante e Perla',
  },
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

const FORM_SOURCES: Readonly<Record<number, readonly [Game, SourceGroup]>> = {
  11112: ['pokopia', 'spin-off'],
  11117: ['pokopia', 'spin-off'],
  11120: ['pokopia', 'spin-off'],
  11121: ['pokopia', 'spin-off'],
  11122: ['mystery-dungeon', 'spin-off'],
  11123: ['xd', 'spin-off'],
  11124: ['mystery-dungeon', 'spin-off'],
  11125: ['pokopia', 'spin-off'],
  11126: ['pokopia', 'spin-off'],
  11127: ['pokopia', 'spin-off'],
  10263: ['go', 'spin-off'],
  11064: ['hgss', 'event'],
  10094: ['sm', 'event'],
  10095: ['sm', 'event'],
  10096: ['sm', 'event'],
  10097: ['sm', 'event'],
  10098: ['sm', 'event'],
  10099: ['sm', 'event'],
  10148: ['usum', 'event'],
  10160: ['swsh', 'event'],
  10117: ['sm', 'event'],
  11021: ['xy', 'event'],
  11030: ['xy', 'event'],
  10192: ['swsh', 'event'],
  10147: ['home', 'event'],
  10190: ['swsh', 'story'],
  11128: ['dp', 'state'],
  11129: ['ranger-gs', 'spin-off'],
  11130: ['pokken', 'spin-off'],
  11105: ['bw', 'state'],
  11106: ['bw', 'state'],
  11107: ['b2w2', 'state'],
  11108: ['b2w2', 'state'],
  11109: ['sm', 'state'],
  11110: ['sm', 'state'],
  11111: ['sm', 'state'],
  11118: ['sv', 'state'],
  11119: ['sv', 'state'],
};

export function sourceGameTitle(mon: PickerMon, locale: Locale): string | null {
  const source = FORM_SOURCES[mon.id];
  if (!source || !SHOWN_GROUPS.has(source[1])) return null;
  return GAMES[source[0]][locale];
}
