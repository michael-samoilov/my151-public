

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { GAME_TERMS_PATH, type GameTermsFixture } from './extract-game-terms';
import { LANGUAGE_IDS, ROMAJI_LANGUAGE_ID, ensureCsvs, readCsv } from './pokeapi';
import type { IdMapEntry } from './propose-id-map';
import { searchAffix } from './searchAffixes';
import { compactFormLabels } from './compact-form-labels';
import { ALTERNATE_PICKER_FORMS } from '../../src/favorites/model/alternateForms';

const OUT_DIR = 'src/i18n/names';
const PICKER_OUT_DIR = 'src/i18n/picker-names';
const COSMETIC_MEGA_VARIANTS = [[10318, 10317, 10147], [10323, 10322, 11006], [10324, 10322, 11007]] as const;
const ALT_FORM_OUT = 'src/i18n/alt-form-species.json';

export type NameProvenance = 'official' | 'official-composed' | 'official-bulbapedia' | 'official-usage' | 'idiomatic' | 'english-only';

const BULBAPEDIA_NAMES_PATH = 'docs/i18n/sources/bulbapedia-form-names.json';
const OFFICIAL_USAGE_PATH = 'docs/i18n/sources/official-usage-form-names.json';
const MY151_NAMES_PATH = 'docs/i18n/sources/my151-form-names.json';

interface BulbapediaSection {
  page: string;
  revid?: number;
  section: string;
  read?: string;
  via?: 'search index';
  names: Partial<Record<string, string>>;
}

interface BulbapediaNames {
  read: string;
  forms: Record<string, BulbapediaSection & { form?: BulbapediaSection }>;
}

interface OfficialUsageNames {
  forms: Record<string, { basis: string; sources: { url: string; quote: string }[]; names: Partial<Record<string, string>> }>;
}

interface My151Names {
  forms: Record<string, { basis: string; names: Partial<Record<string, string>> }>;
}

const ENGLISH_ONLY_FORMS: Readonly<Record<number, { descriptor: string; officialPrefix?: number }>> = {
  11105: { descriptor: 'Overdrive' },
  11106: { descriptor: 'Overdrive' },
  11107: { descriptor: 'Overdrive', officialPrefix: 10022 },
  11108: { descriptor: 'Overdrive', officialPrefix: 10023 },
  11109: { descriptor: 'Radiant Sun Phase' },
  11110: { descriptor: 'Full Moon Phase' },
  11111: { descriptor: 'Zenith' },
};

const STEREO_ROTOM_CODES: Readonly<Partial<Record<string, string>>> = { ja: 'S', 'zh-Hans': 'S', 'zh-Hant': 'S', it: 'D' };

// platform: PokéAPI gives all six Cosplay Pikachu one German descriptor, "Cosplayform", so game text names these forms in every locale.
const COSPLAY_PIKACHU_FORMS: ReadonlySet<string> = new Set([
  'pikachu-rock-star', 'pikachu-belle', 'pikachu-pop-star', 'pikachu-phd', 'pikachu-libre', 'pikachu-cosplay',
]);

const MASK_FORM_BY_TERASTAL_OGERPON: Readonly<Record<number, number>> = { 11113: 1017, 11114: 10273, 11115: 10274, 11116: 10275 };
const TERAPAGOS_TERASTAL_FORM = 10276;

const REGIONS: Record<string, number> = { alola: 7, galar: 8, hisui: 9, paldea: 10 };

const SWEET_ITEM_BY_ALCREMIE_FORM: Record<string, string> = {
  'alcremie-berry': 'berry-sweet',
  'alcremie-love': 'love-sweet',
  'alcremie-star': 'star-sweet',
  'alcremie-clover': 'clover-sweet',
  'alcremie-flower': 'flower-sweet',
  'alcremie-ribbon': 'ribbon-sweet',
};

interface NameCatalog {
  locale: string;
  species: string[];
  forms: Record<string, string>;
  formSource: Record<string, NameProvenance>;
  formMark: Record<string, string>;
  formCompact?: Record<string, string>;
  affix?: string[];
}

function regionOf(appName: string): string | null {
  if (appName.endsWith('-cap')) return null;
  for (const region of Object.keys(REGIONS)) if (appName.includes(`-${region}`)) return region;
  return null;
}

async function main(): Promise<void> {
  await ensureCsvs();
  mkdirSync(OUT_DIR, { recursive: true });

  const { entries } = JSON.parse(readFileSync('scripts/i18n/pokemon-id-map.json', 'utf8')) as {
    entries: IdMapEntry[];
  };
  const formsBySlug = new Map(readCsv('pokemon_forms').map((row) => [row.identifier, row]));
  const pokemonById = new Map(readCsv('pokemon').map((row) => [row.id, row]));
  const originalIds = new Set(entries.map((entry) => entry.appId));
  const addForm = (appId: number, appName: string, slug: string, speciesId: number) => {
    const form = formsBySlug.get(slug);
    if (form && Number(pokemonById.get(form.pokemon_id)?.species_id) !== speciesId) {
      throw new Error(`${appName}: ${slug} belongs to a different species`);
    }
    entries.push({ appId, appName, speciesId, formId: Number(form?.id ?? 0), formIdentifier: slug });
  };
  for (const form of ALTERNATE_PICKER_FORMS) {
    if (originalIds.has(form.id)) continue;
    const speciesId = entries.find((entry) => entry.appId === form.ownerId)?.speciesId ?? form.ownerId;

    addForm(form.id, form.name, form.name === 'vivillon-pokeball' ? 'vivillon-poke-ball'
      : form.name.replace(/^(ogerpon-[a-z]+)-tera$/, '$1-mask-tera'), speciesId);
  }
  const powerups = JSON.parse(readFileSync('src/league/data/powerupForms.json', 'utf8')) as
    Record<string, Record<string, { id: number; label: string }[]>>;
  for (const [species, kinds] of Object.entries(powerups)) {
    for (const [kind, forms] of Object.entries(kinds)) {
      for (const form of forms) {
        if (originalIds.has(form.id)) continue;
        const owner = entries.find((entry) => entry.appId === Number(species));
        if (!owner) throw new Error(`Power-up owner ${species} is missing`);
        const suffix = form.label.match(/ (X|Y|Z)$/)?.[1].toLowerCase();
        const stem = Number(species) === 892 ? 'urshifu-single-strike' : owner.appName;
        const mode = form.label.startsWith('Primal ') ? 'primal' : kind === 'dynamax' ? 'gmax' : 'mega';
        const powerupAliases: Record<number, string> = {
          10219: 'toxtricity-amped-gmax', 10314: 'meowstic-male-mega', 10322: 'tatsugiri-curly-mega',
        };
        const slug = powerupAliases[form.id] ?? `${stem}-${mode}${suffix ? `-${suffix}` : ''}`;
        addForm(form.id, form.label, slug, owner.speciesId);
      }
    }
  }
  // platform: PokéAPI's female Mega Meowstic is a pixel copy of the male, so this identity names no gender.
  entries.find((entry) => entry.appId === 10314)!.formIdentifier = 'meowstic-mega';
  const xerneas = entries.find((entry) => entry.appId === 716)!;
  xerneas.formId = Number(formsBySlug.get('xerneas-active')!.id);
  xerneas.formIdentifier = 'xerneas-active';

  const speciesNames = new Map<string, string>();
  const romaji = new Map<number, string>();
  for (const r of readCsv('pokemon_species_names')) {
    speciesNames.set(`${r.pokemon_species_id}:${r.local_language_id}`, r.name);
    if (Number(r.local_language_id) === ROMAJI_LANGUAGE_ID) {
      romaji.set(Number(r.pokemon_species_id), r.name.toLowerCase());
    }
  }

  const formNames = new Map<string, string>();
  for (const r of readCsv('pokemon_form_names')) {
    if (r.form_name) formNames.set(`${r.pokemon_form_id}:${r.local_language_id}`, r.form_name);
  }
  const gameText = JSON.parse(readFileSync('docs/i18n/sources/pokemon-formnames.json', 'utf8')) as {
    forms: Record<string, { species: string; names: Record<string, string> }>;
  };
  const gameDescriptor = (entry: IdMapEntry, locale: string): string | undefined => {
    const species = speciesNames.get(`${entry.speciesId}:${LANGUAGE_IDS.en}`);
    const english = formNames.get(`${entry.formId}:${LANGUAGE_IDS.en}`);
    if (!english) return;
    const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');
    const target = entry.formIdentifier.endsWith('-gmax') ? 'Gigantamax'
      : entry.formIdentifier === 'tatsugiri-curly-mega' ? 'Mega Tatsugiri'
      : english;
    const match = Object.values(gameText.forms).find((row) =>
      row.species === species && normalize(row.names.en) === normalize(target));
    return match?.names[locale] || undefined;
  };

  // platform: Pokédex game text names all three Paldean Tauros breeds "Paldean Form"; Pokémon Champions names each breed.
  const sourcedForms = new Map(
    (JSON.parse(readFileSync(GAME_TERMS_PATH, 'utf8')) as GameTermsFixture).terms
      .filter((term) => term.key.startsWith('form.'))
      .map((term) => [Number(term.key.slice('form.'.length)), term.from[0].text]),
  );

  const bulbapedia = (JSON.parse(readFileSync(BULBAPEDIA_NAMES_PATH, 'utf8')) as BulbapediaNames).forms;
  const officialUsage = (JSON.parse(readFileSync(OFFICIAL_USAGE_PATH, 'utf8')) as OfficialUsageNames).forms;
  const my151 = (JSON.parse(readFileSync(MY151_NAMES_PATH, 'utf8')) as My151Names).forms;
  for (const id of [...Object.keys(bulbapedia), ...Object.keys(officialUsage), ...Object.keys(my151)]) {
    if (!entries.some((entry) => entry.appId === Number(id))) throw new Error(`Sourced name ${id} is not a picker form`);
  }

  const itemIdBySlug = new Map<string, number>();
  for (const r of readCsv('items')) itemIdBySlug.set(r.identifier, Number(r.id));
  const itemNames = new Map<string, string>();
  for (const r of readCsv('item_names')) {
    itemNames.set(`${r.item_id}:${r.local_language_id}`, r.name);
  }

  const regionNames = new Map<string, string>();
  for (const r of readCsv('region_names')) {
    regionNames.set(`${r.region_id}:${r.local_language_id}`, r.name);
  }

  const maxSpecies = Math.max(...entries.map((e) => e.speciesId));
  const summary: string[] = [];
  let englishDescriptors: Record<string,string> = {};

  for (const [locale, langId] of Object.entries(LANGUAGE_IDS)) {
    const regionName = (region: string): string | undefined =>
      // platform: PokéAPI region_names.csv has no Spanish rows, so the English proper noun stands in.
      regionNames.get(`${REGIONS[region]}:${langId}`) ?? regionNames.get(`${REGIONS[region]}:${LANGUAGE_IDS.en}`);

    const documented = entries
      .filter((entry) => originalIds.has(entry.appId))
      .map((e) => ({ region: regionOf(e.appName), descriptor: formNames.get(`${e.formId}:${langId}`) }))
      .filter((d): d is { region: string; descriptor: string } => Boolean(d.region && d.descriptor));

    let regionalFormPattern: string | null = null;
    for (const sample of documented) {
      const name = regionName(sample.region);
      if (!name || !sample.descriptor.includes(name)) continue;
      const candidate = sample.descriptor.replace(name, '{region}');
      const reproducesAll = documented.every((d) => {
        const n = regionName(d.region);
        return n ? candidate.replace('{region}', n) === d.descriptor : true;
      });
      if (reproducesAll) { regionalFormPattern = candidate; break; }
    }

    const catalog: NameCatalog = {
      locale,
      species: Array.from({ length: maxSpecies }, (_, i) => speciesNames.get(`${i + 1}:${langId}`) ?? ''),
      forms: {},
      formSource: {},
      formMark: {},
    };

    const firstGrapheme = (text: string): string => {
      const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
      return [...seg.segment(text.normalize('NFC'))][0]?.segment ?? '';
    };

    const sweetMarks = new Map<string, string>();
    {
      const candidates = Object.entries(SWEET_ITEM_BY_ALCREMIE_FORM).map(([appName, slug]) => {
        const id = itemIdBySlug.get(slug);
        const name = id === undefined ? undefined : itemNames.get(`${id}:${langId}`);
        return { appName, mark: name ? firstGrapheme(name) : '' };
      });
      const marks = candidates.map((c) => c.mark);
      const everyMarkDistinct = marks.every(Boolean) && new Set(marks).size === marks.length;
      if (everyMarkDistinct) for (const c of candidates) sweetMarks.set(c.appName, c.mark);
    }

    let official = 0;
    let composed = 0;
    let sourced = 0;
    let usage = 0;
    let idiomatic = 0;
    let marked = 0;
    for (const entry of entries) {
      const markRegion = originalIds.has(entry.appId) ? regionOf(entry.appName) : null;
      const sweet = sweetMarks.get(entry.appName);
      if (markRegion) {
        const noun = regionName(markRegion);
        if (noun) {
          catalog.formMark[entry.appId] = firstGrapheme(noun);
          marked += 1;
        }
      } else if (sweet) {
        catalog.formMark[entry.appId] = sweet;
        marked += 1;
      }

      const pokeapi = formNames.get(`${entry.formId}:${langId}`);
      const game = gameDescriptor(entry, locale);
      // platform: PokéAPI names Japanese base forms "<species>のすがた", so the descriptor is the species name alone.
      const speciesName = speciesNames.get(`${entry.speciesId}:${langId}`);
      const japaneseBaseFormName = locale === 'ja' && speciesName && pokeapi === `${speciesName}のすがた` ? speciesName : undefined;
      const descriptor = sourcedForms.get(entry.appId)?.[locale as keyof typeof LANGUAGE_IDS]
        ?? (COSPLAY_PIKACHU_FORMS.has(entry.formIdentifier) && game ? game : japaneseBaseFormName ?? pokeapi ?? game);
      if (descriptor) {
        catalog.forms[entry.appId] = descriptor;
        catalog.formSource[entry.appId] = 'official';
        official += 1;
        continue;
      }
      const sweetItem = SWEET_ITEM_BY_ALCREMIE_FORM[entry.appName];
      if (sweetItem) {
        const vanilla = Object.values(gameText.forms).find((row) => row.species === 'Alcremie' && row.names.en === 'Vanilla Cream');
        const itemId = itemIdBySlug.get(sweetItem);
        const item = itemId === undefined ? undefined : itemNames.get(`${itemId}:${langId}`);
        if (vanilla?.names[locale] && item) {
          catalog.forms[entry.appId] = `${vanilla.names[locale]} — ${item}`;
          catalog.formSource[entry.appId] = 'official-composed';
          composed += 1;
          continue;
        }
      }
      if (entry.speciesId === 201) {
        const glyph = formNames.get(`${entry.formId}:${LANGUAGE_IDS.en}`);
        if (glyph) {
          catalog.forms[entry.appId] = glyph;
          catalog.formSource[entry.appId] = 'official-composed';
          composed += 1;
          continue;
        }
      }
      const region = regionOf(entry.appName);
      if (!region || !regionalFormPattern) continue;
      const name = regionName(region);
      if (!name) continue;
      catalog.forms[entry.appId] = regionalFormPattern.replace('{region}', name);
      catalog.formSource[entry.appId] = 'official-composed';
      composed += 1;
    }
    const rapidGmax = formsBySlug.get('urshifu-rapid-strike-gmax');
    if (!rapidGmax) throw new Error('Gigantamax Rapid Strike Urshifu is missing');
    const rapidEntry: IdMapEntry = {
      appId: 10227, appName: 'urshifu-rapid-strike-gmax', speciesId: 892,
      formId: Number(rapidGmax.id), formIdentifier: rapidGmax.identifier,
    };
    const rapidDescriptor = formNames.get(`${rapidEntry.formId}:${langId}`) ?? gameDescriptor(rapidEntry, locale);
    const styleDescriptor = catalog.forms[10227];
    if (rapidDescriptor && styleDescriptor) {
      const complete = rapidDescriptor.includes(styleDescriptor);
      catalog.forms['picker:10227'] = complete ? rapidDescriptor : `${rapidDescriptor} — ${styleDescriptor}`;
      catalog.formSource['picker:10227'] = complete ? 'official' : 'official-composed';
    }
    for (const [variantId, megaId, formId] of COSMETIC_MEGA_VARIANTS) {
      const mega = catalog.forms[megaId];
      const variant = catalog.forms[formId];
      const own = catalog.forms[variantId];
      if (!mega || !variant || (own && own !== mega)) continue;
      catalog.forms[variantId] = `${mega} — ${variant}`;
      catalog.formSource[variantId] = 'official-composed';
    }
    for (const [id, mask] of Object.entries(MASK_FORM_BY_TERASTAL_OGERPON)) {
      if (!entries.some((entry) => entry.appId === Number(id))) throw new Error(`Terastal form ${id} is not a picker form`);
      const maskName = catalog.forms[mask];
      const terastal = catalog.forms[TERAPAGOS_TERASTAL_FORM];
      if (!maskName || !terastal) throw new Error(`${locale} has no official name for ${maskName ? TERAPAGOS_TERASTAL_FORM : mask}`);
      catalog.forms[id] = `${maskName} — ${terastal}`;
      catalog.formSource[id] = 'official-composed';
    }
    for (const [id, { descriptor, officialPrefix }] of Object.entries(ENGLISH_ONLY_FORMS)) {
      if (!entries.some((entry) => entry.appId === Number(id))) throw new Error(`English-only form ${id} is not a picker form`);
      const prefix = officialPrefix === undefined ? undefined : catalog.forms[officialPrefix];
      if (officialPrefix !== undefined && !prefix) throw new Error(`${locale} has no official name for ${officialPrefix}`);
      catalog.forms[id] = prefix ? `${prefix} — ${descriptor}` : descriptor;
      catalog.formSource[id] = 'english-only';
    }
    const withOfficialPrefix = (id: string, name: string): string => {
      const prefix = ENGLISH_ONLY_FORMS[Number(id)]?.officialPrefix;
      return prefix === undefined ? name : `${catalog.forms[prefix]} — ${name}`;
    };
    const formAlias: Record<string, string> = {};
    for (const [id, { names, form }] of Object.entries(bulbapedia)) {
      const name = form?.names[locale] ?? names[locale];
      if (!name) continue;
      if (catalog.formSource[id] && catalog.formSource[id] !== 'english-only') {
        throw new Error(`${locale} ${id}: ${catalog.formSource[id]} name ${JSON.stringify(catalog.forms[id])} already exists; drop the Bulbapedia name`);
      }
      catalog.forms[id] = name;
      catalog.formSource[id] = 'official-bulbapedia';
      sourced += 1;
    }
    for (const [id, { names }] of Object.entries(officialUsage)) {
      const name = names[locale];
      if (!name) continue;
      if (catalog.formSource[id] && !['english-only', 'official-bulbapedia'].includes(catalog.formSource[id])) {
        throw new Error(`${locale} ${id}: ${catalog.formSource[id]} name ${JSON.stringify(catalog.forms[id])} already exists; drop the official-usage name`);
      }
      catalog.forms[id] = withOfficialPrefix(id, name);
      catalog.formSource[id] = 'official-usage';
      usage += 1;
    }
    for (const [id, { names }] of Object.entries(my151)) {
      const name = names[locale];
      if (!name) continue;
      if (catalog.formSource[id] && catalog.formSource[id] !== 'english-only') {
        throw new Error(`${locale} ${id}: ${catalog.formSource[id]} name ${JSON.stringify(catalog.forms[id])} already exists; drop the my151 name`);
      }
      catalog.forms[id] = withOfficialPrefix(id, name);
      catalog.formSource[id] = 'idiomatic';
      idiomatic += 1;
    }
    for (const [id, { names, form }] of Object.entries(bulbapedia)) {
      const character = names[locale];
      if (form && character && character !== catalog.forms[id]) formAlias[id] = character;
    }
    const formsNeedingEveryLocale = [...Object.entries(bulbapedia), ...Object.entries(my151)]
      .filter(([id, row]) => row.names.en && !(Number(id) in ENGLISH_ONLY_FORMS)).map(([id]) => id);
    for (const id of formsNeedingEveryLocale) {
      if (!catalog.forms[id]) throw new Error(`${locale} ${id}: no name; add one to ${BULBAPEDIA_NAMES_PATH} or ${MY151_NAMES_PATH}`);
    }
    const femaleDescriptor = catalog.forms[10025];
    if (femaleDescriptor) {
      for (const entry of entries.filter(entry => entry.formIdentifier.endsWith('-female') && !catalog.forms[entry.appId])) {
        catalog.forms[entry.appId] = femaleDescriptor;
        catalog.formSource[entry.appId] = 'official-composed';
        composed += 1;
      }
    }

    const affix = catalog.species.map((name, i) =>
      name ? searchAffix(locale, name, romaji.get(i + 1)) : '',
    );

    if (affix.some(Boolean)) catalog.affix = affix;

    if (locale === 'en') englishDescriptors = { ...catalog.forms };
    for (const [key, descriptor] of Object.entries(englishDescriptors)) {
      if (catalog.forms[key]) continue;
      catalog.forms[key] = descriptor;
      catalog.formSource[key] = 'official-composed';
      composed += 1;
    }
    catalog.formCompact = compactFormLabels(entries, catalog.forms, catalog.formMark);
    const stereoRotom = STEREO_ROTOM_CODES[locale];
    if (stereoRotom) catalog.formCompact[11112] = stereoRotom;
    const overlay = { formCompact: {} as Record<string, string>, formAlias, species: Object.fromEntries(entries.filter(e => !originalIds.has(e.appId) && e.appId !== e.speciesId).map(e => [e.appId, e.speciesId])), forms: {} as Record<string, string>, formSource: {} as Record<string, NameProvenance> };
    for (const key of Object.keys(catalog.forms)) {
      if (originalIds.has(Number(key))) continue;
      overlay.forms[key] = catalog.forms[key];
      if (catalog.formCompact[key]) {
        overlay.formCompact[key] = catalog.formCompact[key];
        delete catalog.formCompact[key];
      }
      overlay.formSource[key] = catalog.formSource[key];
      delete catalog.forms[key];
      delete catalog.formSource[key];
    }
    mkdirSync(PICKER_OUT_DIR, { recursive: true });
    writeFileSync(`${PICKER_OUT_DIR}/${locale}.json`, `${JSON.stringify(overlay)}\n`);
    writeFileSync(`${OUT_DIR}/${locale}.json`, `${JSON.stringify(catalog)}\n`);
    const named = catalog.species.filter(Boolean).length;
    summary.push(
      `  ${locale.padEnd(8)} ${String(named).padStart(4)} species   ${String(official).padStart(3)} official forms   ${String(composed).padStart(3)} composed   ${String(sourced).padStart(2)} Bulbapedia   ${String(usage).padStart(2)} official usage   ${String(idiomatic).padStart(2)} idiomatic   ${String(marked).padStart(3)} marked   ${regionalFormPattern ?? '(no pattern)'}`,
    );
  }

  const altForms = Object.fromEntries(
    entries.filter((e) => originalIds.has(e.appId) && e.appId !== e.speciesId).map((e) => [e.appId, e.speciesId]),
  );
  // platform: Vite folds a glob-matched file that is also statically imported into the main bundle, so this file sits outside OUT_DIR.
  writeFileSync(ALT_FORM_OUT, `${JSON.stringify(altForms)}\n`);

  console.log(`${ALT_FORM_OUT}: ${Object.keys(altForms).length} alt forms`);
  console.log(`${OUT_DIR}/: ${Object.keys(LANGUAGE_IDS).length} catalogs`);
  for (const line of summary) console.log(line);
}

void main();
