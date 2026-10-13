import type { IdMapEntry } from './propose-id-map';

const CODES: Record<string, string> = {
  normal: '', attack: 'ATK', defense: 'DEF', speed: 'SPD',
  spring: 'SPR', summer: 'SUM', autumn: 'AUT', winter: 'WIN',
  midday: 'MD', midnight: 'MN', dusk: 'D',
  standard: '', zen: 'Z', single: 'SS', rapid: 'RS',
  'single-strike': 'SS', 'rapid-strike': 'RS',
  'red-striped': 'R', 'blue-striped': 'B', 'white-striped': 'W',
  strawberry: 'ST', star: 'S', berry: 'B', love: 'L', clover: 'C', flower: 'F', ribbon: 'R',
  'family-of-four': '4', 'family-of-three': '3', 'two-segment': '2', 'three-segment': '3',
  '10': '10%', '50': '50%', complete: '100%',
  mega: 'M', primal: 'P', gmax: 'GMX',
  male: '♂', female: '♀',
  // An abbreviation stays whole: DJ Rotom reads DJ (Michael, 2026-10-12).
  dj: 'DJ',
};
const DEFAULT_SUFFIX: Record<string, string> = {
  castform: 'normal', hoopa: 'confined', zacian: 'hero', zamazenta: 'hero',
  ogerpon: 'teal-mask', terapagos: 'normal',
};
/**
 * Battle states that a full name lists after the form they change: Ogerpon
 * (Teal Mask, Terastal Form), Black Kyurem (Overdrive). The code keeps that
 * order, the form's own code then the state's, as "G Z" keeps Galarian
 * Darmanitan (Zen Mode). T is Terapagos's Terastal Form code.
 */
const STATE_CODES: Record<string, string> = { tera: 'T', overdrive: 'O' };
const REGIONS = ['alola', 'galar', 'hisui', 'paldea'];
const INDICATED_BASE_FORMS = new Set([585, 586, 745, 892, 1017]);

interface FormIdentity { key: string; species: number; region?: string; suffix: string; }

/** Build codes against the complete family, never the current query or viewport. */
export function compactFormLabels(entries: IdMapEntry[], forms: Record<string, string>, regionMarks: Record<string, string>): Record<string, string> {
  const base = new Map(entries.filter(entry => entry.appId === entry.speciesId).map(entry => [entry.speciesId, entry.appName]));
  const identities: FormIdentity[] = entries.flatMap(entry => {
    if (!forms[entry.appId]) return [];
    const stem = base.get(entry.speciesId);
    if (!stem) throw new Error(`Missing compact-label species ${entry.speciesId}`);
    let suffix = entry.formIdentifier.startsWith(`${stem}-`) ? entry.formIdentifier.slice(stem.length + 1)
      : entry.formIdentifier === stem ? DEFAULT_SUFFIX[stem] ?? '' : entry.appName.startsWith(`${stem}-`) ? entry.appName.slice(stem.length + 1) : '';
    const region = !suffix.endsWith('-cap') ? REGIONS.find(region => suffix === region || suffix.startsWith(`${region}-`)) : undefined;
    if (region) suffix = suffix.slice(region.length).replace(/^-/, '');
    if (entry.speciesId === 869) suffix = suffix.match(/(?:^|-)(strawberry|berry|love|star|clover|flower|ribbon)-sweet$/)?.[1] ?? suffix;
    suffix = suffix.replace(/-breed$|-plumage$|-flower$/g, '');
    return suffix || region ? [{ key: String(entry.appId), species: entry.speciesId, region, suffix }] : [];
  });
  if (forms['picker:10227']) identities.push({ key:'picker:10227', species:892, suffix:'rapid-strike-gmax' });
  const grouped = new Map<string, FormIdentity[]>();
  for (const identity of identities) {
    const key = `${identity.species}:${identity.region ?? ''}`;
    const family = grouped.get(key) ?? [];
    family.push(identity); grouped.set(key, family);
  }
  const result: Record<string,string> = {};
  for (const family of grouped.values()) {
    const codes = new Map<string,string>();
    const code = (suffix: string): string => {
      if (!suffix) return '';
      if (suffix in CODES) return CODES[suffix];
      if (suffix.endsWith('-mega') || suffix.endsWith('-gmax')) {
        const mode = suffix.endsWith('-mega') ? 'mega' : 'gmax';
        const variant = code(suffix.slice(0, -(mode.length + 1)));
        return `${mode === 'gmax' && variant ? 'GM' : CODES[mode]} ${variant}`;
      }
      if (/^mega-[xyz]$/.test(suffix)) return `M ${suffix.at(-1)!.toUpperCase()}`;
      const state = Object.keys(STATE_CODES).find(state => suffix.endsWith(`-${state}`));
      if (state) return `${code(suffix.slice(0, -(state.length + 1)))} ${STATE_CODES[state]}`;
      const words = suffix.split('-');
      return words.length > 1 ? words.map(word => CODES[word] ?? word[0].toUpperCase()).join('') : suffix[0].toUpperCase();
    };
    for (const identity of family) codes.set(identity.suffix, code(identity.suffix));
    for (const suffix of codes.keys()) {
      const initial = codes.get(suffix)!;
      if ([...codes].some(([other, value]) => other !== suffix && value === initial)) {
        const clean = suffix.replace(/-/g, '').toUpperCase();
        const siblings = [...codes.keys()].filter(other => other !== suffix).map(other => other.replace(/-/g,'').toUpperCase());
        let length = 2;
        while (length < 3 && siblings.some(other => other.startsWith(clean.slice(0,length)))) length++;
        codes.set(suffix, clean.slice(0,length));
      }
    }
    const used = new Map<string,string>();
    for (const identity of family) {
      if (identity.key === String(identity.species) && !['male', 'female'].includes(identity.suffix) && !INDICATED_BASE_FORMS.has(identity.species)) continue;
      const regionEntry = identity.region && entries.find(entry => entry.speciesId === identity.species && entry.formIdentifier.includes(`-${identity.region}`) && regionMarks[entry.appId]);
      const region = regionEntry ? regionMarks[regionEntry.appId] : identity.region?.[0].toUpperCase();
      const mark = [region, codes.get(identity.suffix)].filter(Boolean).join(' ');
      const prior = used.get(mark);
      if (prior && prior !== identity.suffix) throw new Error(`Compact form collision: ${identity.species} ${mark}: ${prior}, ${identity.suffix}`);
      used.set(mark,identity.suffix);
      result[identity.key] = mark;
    }
  }
  return result;
}
