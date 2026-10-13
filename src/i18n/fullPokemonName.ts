import type { Locale } from './config';
import { genderFormOf, GENDER_MARKS } from './genderForms';

export interface PokemonNameContext {
  locale: Locale;
  identity?: string;
  regionalDescriptor?: string;
  qualifiers?: readonly string[];
  gender?: { mark: string; descriptor: string; attached: boolean };
}

type Transformation = 'mega' | 'gigantamax' | 'primal' | 'ultra' | 'eternamax';

const TRANSFORMATIONS: Record<Locale, Record<Transformation, string>> = {
  en: { mega: 'Mega {name}', gigantamax: 'Gigantamax {name}', primal: 'Primal {name}', ultra: 'Ultra {name}', eternamax: 'Eternamax {name}' },
  fr: { mega: 'Méga-{name}', gigantamax: '{name} Gigamax', primal: 'Primo-{name}', ultra: 'Ultra-{name}', eternamax: '{name} Infinimax' },
  de: { mega: 'Mega-{name}', gigantamax: 'Gigadynamax-{name}', primal: 'Proto-{name}', ultra: 'Ultra-{name}', eternamax: 'Unendynamax-{name}' },
  es: { mega: 'Mega-{name}', gigantamax: '{name} Gigamax', primal: '{name} Primigenio', ultra: 'Ultra-{name}', eternamax: '{name} Dinamax Infinito' },
  it: { mega: 'Mega{name}', gigantamax: '{name} Gigamax', primal: 'Archeo{name}', ultra: 'Ultra{name}', eternamax: '{name} Dynamax Infinito' },
  ja: { mega: 'メガ{name}', gigantamax: 'キョダイマックス{name}', primal: 'ゲンシ{name}', ultra: 'ウルトラ{name}', eternamax: 'ムゲンダイマックス{name}' },
  ko: { mega: '메가{name}', gigantamax: '거다이맥스 {name}', primal: '원시{name}', ultra: '울트라{name}', eternamax: '무한다이맥스 {name}' },
  'zh-Hans': { mega: '超级{name}', gigantamax: '超极巨化{name}', primal: '原始{name}', ultra: '究极{name}', eternamax: '无极巨化{name}' },
  'zh-Hant': { mega: '超級{name}', gigantamax: '超極巨化{name}', primal: '原始{name}', ultra: '究極{name}', eternamax: '無極巨化{name}' },
};

const TRANSFORMATION_DESCRIPTORS: readonly [Transformation, RegExp][] = [
  ['gigantamax', /Gigantamax(?: Form)?|Forme Gigamax|Gigadynamax-Form|Gigamax|キョダイマックス(?:のすがた)?|거다이맥스|超极巨化|超極巨化/u],
  ['mega', /^(?:Mega[- ]Form|Méga-Évolution|Megaevolución|メガシンカ|메가진화|超级进化|超級進化)$/u],
  ['primal', /^(?:Primal Reversion|Primo-Résurgence|Protomorphose|Regresión Primigenia|Archeorisveglio|ゲンシカイキのすがた|원시회귀의 모습|原始回归的样子|原始回歸的樣子)$/u],
  ['ultra', /^Ultra$/u],
  ['eternamax', /^(?:Eternamax|Infinimax|Unendynamax|Dinamax Infinito|Dynamax Infinito|ムゲンダイマックス|무한다이맥스|无极巨化|無極巨化)$/u],
];

const REGIONAL_DESCRIPTOR = /^(?:(?:Alolan|Galarian|Hisuian|Paldean) Form|Forme (?:d[’']Alola|de (?:Galar|Hisui|Paldea))|(?:Alola|Galar|Hisui|Paldea)-Form|Forma (?:de|di) (?:Alola|Galar|Hisui|Paldea)|(?:アローラ|ガラル|ヒスイ|パルデア)のすがた|(?:알로라|가라르|히스이|팔데아)의 모습|(?:阿罗拉|伽勒尔|洗翠|帕底亚)的样子|(?:阿羅拉|伽勒爾|洗翠|帕底亞)的樣子)/u;
const REGION_FORM_IDS: Record<string, number> = { alola: 10100, galar: 10177, hisui: 10238, paldea: 10250 };
const POWERUP_QUALIFIERS: Record<number, number> = { 10219: 849, 10226: 892, 10322: 978 };

export function pokemonNameContext(appId: number, identity: string, forms: Record<string, string>, locale: Locale): PokemonNameContext {
  const region = identity.match(/-(alola|galar|hisui|paldea)(?!-cap)(?:-|$)/u)?.[1];
  const regionalDescriptor = region ? forms[REGION_FORM_IDS[region]]?.match(REGIONAL_DESCRIPTOR)?.[0] : undefined;
  const qualifier = forms[POWERUP_QUALIFIERS[appId]];
  const gender = genderFormOf(appId, identity);
  return { locale, identity, regionalDescriptor, qualifiers: qualifier ? [qualifier] : [],
    gender: gender ? { mark: GENDER_MARKS[gender], descriptor: forms[gender === 'male' ? 678 : 10025] ?? GENDER_MARKS[gender],
      attached: appId === 29 || appId === 32 } : undefined };
}

function folded(text: string): string {
  return text.normalize('NFKC').toLocaleLowerCase();
}

export function includesSpecies(descriptor: string, species: string): boolean {
  const name = folded(species);
  const form = folded(descriptor);
  let index = form.indexOf(name);
  while (index !== -1) {
    const before = form[index - 1] ?? '';
    const after = form[index + name.length] ?? '';
    const joinedPrefix = /^(mega|ultra)$/u.test(form.slice(0, index));
    const joinedSuffix = /^[XYＸＹ]$/u.test(descriptor.normalize('NFKC').slice(index + name.length));
    const joinedName = index === 0 && /^\p{Lu}/u.test(descriptor.normalize('NFKC').slice(name.length));
    if (!/\p{Script=Latin}/u.test(name) ||
      ((!/[\p{L}\p{N}]/u.test(before) || joinedPrefix) && (!/[\p{L}\p{N}]/u.test(after) || joinedSuffix || joinedName))) return true;
    index = form.indexOf(name, index + name.length);
  }
  return false;
}

function regionalName(species: string, descriptor: string, locale: Locale): string {
  if (locale === 'en') return `${descriptor.replace(/ Form$/u, '')} ${species}`;
  if (locale === 'fr') return `${species} ${descriptor.replace(/^Forme /u, '')}`;
  if (locale === 'de') return `${descriptor.replace(/Form$/u, '')}${species}`;
  if (locale === 'es' || locale === 'it') return `${species} ${descriptor.replace(/^Forma /u, '')}`;
  return appendQualifiers(species, [descriptor], locale);
}

function cleanQualifier(qualifier: string): string {
  return qualifier.trim().replace(/^[・/\s]+|[・/\s]+$/gu, '').replace(/^[（(](.*)[）)]$/u, '$1').trim();
}

function qualifierPresent(name: string, qualifier: string): boolean {
  const reduced = qualifier.replace(/^(?:Forme?|Forma) |(?: Forme?|[- ]Form)$/u, '');
  if (!/\p{Script=Latin}/u.test(reduced)) return folded(name).includes(folded(reduced));
  const escaped = folded(reduced).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'u').test(folded(name));
}

function appendQualifiers(name: string, qualifiers: readonly string[], locale: Locale): string {
  const values: string[] = [];
  for (const qualifier of qualifiers.map(cleanQualifier)) {
    if (qualifier && !qualifierPresent(name, qualifier) && !values.some(value => folded(value) === folded(qualifier))) values.push(qualifier);
  }
  if (!values.length) return name;
  const cjk = locale === 'ja' || locale.startsWith('zh-');
  const open = cjk ? '（' : ' (';
  const close = cjk ? '）' : ')';
  const separator = cjk ? '、' : ', ';
  return name.endsWith(close) ? `${name.slice(0, -1)}${separator}${values.join(separator)}${close}`
    : `${name}${open}${values.join(separator)}${close}`;
}

export function formatFullPokemonName(species: string, descriptor: string | undefined, context: PokemonNameContext): string {
  const gender = context.gender;
  const parts = (descriptor?.split(/\s*—\s*/u) ?? []).filter(part => !gender ||
    (cleanQualifier(part) !== gender.descriptor && cleanQualifier(part) !== gender.mark));
  let principal = parts.shift() ?? '';
  const qualifiers = [...parts];
  const complete = principal && includesSpecies(principal, species);
  let name = complete ? principal : gender ? species.replace(/[♂♀]$/u, '') : species;
  if (!complete) {
    const regionalDescriptor = principal.match(REGIONAL_DESCRIPTOR)?.[0] ?? context.regionalDescriptor;
    if (regionalDescriptor) {
      name = regionalName(name, regionalDescriptor, context.locale);
      if (principal.startsWith(regionalDescriptor)) principal = principal.slice(regionalDescriptor.length);
    }
    const transformation = TRANSFORMATION_DESCRIPTORS.find(([, pattern]) => pattern.test(principal));
    if (transformation) {
      name = TRANSFORMATIONS[context.locale][transformation[0]].replace('{name}', name);
      principal = principal.replace(transformation[1], '');
    }
    if (context.locale === 'en' && context.identity === 'pichu-spiky-eared' && principal === 'Spiky-eared') {
      name = `${principal} ${name}`;
      principal = '';
    }
    qualifiers.unshift(principal);
  }
  const variant = context.identity?.match(/(?:[- ]mega[- ]|^Mega .+ )([XYZ])$/iu)?.[1].toUpperCase();
  if (variant && !new RegExp(`[${variant}${variant === 'X' ? 'Ｘ' : variant === 'Y' ? 'Ｙ' : 'Ｚ'}]$`, 'u').test(name)) name += ` ${variant}`;
  const full = appendQualifiers(name, [...qualifiers, ...(context.qualifiers ?? [])], context.locale);
  return gender ? `${full}${gender.attached ? '' : ' '}${gender.mark}` : full;
}
