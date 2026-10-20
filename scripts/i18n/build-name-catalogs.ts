

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { GAME_TERMS_PATH, type GameTermsFixture } from './extract-game-terms';
import { LANGUAGE_IDS, ROMAJI_LANGUAGE_ID, ensureCsvs, readCsv } from './pokeapi';
import type { IdMapEntry } from './propose-id-map';
import { searchAffix } from './searchAffixes';
import { compactFormLabels } from './compact-form-labels';
import { ALTERNATE_PICKER_FORMS } from '../../src/favorites/model/alternateForms';

const OUT_DIR = 'src/i18n/names';
const PICKER_OUT_DIR = 'src/i18n/picker-names';
const MEGA_VARIANTS = [[10318, 10317, 10147], [10323, 10322, 11006], [10324, 10322, 11007]] as const;
const ALT_FORM_OUT = 'src/i18n/alt-form-species.json';

/**
 * How a name was arrived at. `official` comes from game text or PokéAPI.
 * `official-bulbapedia` is an official name that no game-text corpus in the
 * repository carries, copied from Bulbapedia (BULBAPEDIA_NAMES_PATH).
 * `english-only` marks a descriptor with no official name in that language:
 * the locale carries the English words. `formProvenance` in
 * src/i18n/names.ts exposes the value; no UI marker renders it yet.
 */
export type NameProvenance = 'official' | 'official-composed' | 'official-bulbapedia' | 'english-only';

const BULBAPEDIA_NAMES_PATH = 'docs/i18n/sources/bulbapedia-form-names.json';

interface BulbapediaNames {
  read: string;
  forms: Record<string, { page: string; revid: number; section: string; names: Partial<Record<string, string>> }>;
}

/**
 * English descriptors for app forms that no game-text row names. Each locale
 * shows its official name from BULBAPEDIA_NAMES_PATH when it has one, and the
 * English words otherwise.
 */
const ENGLISH_ONLY_FORMS: Readonly<Record<number, { descriptor: string; officialPrefix?: number }>> = {
  11105: { descriptor: 'Overdrive' },
  11106: { descriptor: 'Overdrive' },
  11107: { descriptor: 'Overdrive', officialPrefix: 10022 },
  11108: { descriptor: 'Overdrive', officialPrefix: 10023 },
  11109: { descriptor: 'Radiant Sun Phase' },
  11110: { descriptor: 'Full Moon Phase' },
  11111: { descriptor: 'Zenith' },
  11112: { descriptor: 'DJ' },
  11117: { descriptor: 'Smearguru' },
  11120: { descriptor: 'Mosslax' },
  11121: { descriptor: 'Peakychu' },
  11122: { descriptor: 'Purple' },
};

/**
 * Terastallized Ogerpon, by app id, with the mask each one wears. No game
 * names these battle forms. Each joins two official descriptors in the same
 * language: the mask, then Terapagos's Terastal Form. The full name lists
 * both after the species: Ogerpon (Wellspring Mask, Terastal Form).
 */
const TERASTAL_MASKS: Readonly<Record<number, number>> = { 11113: 1017, 11114: 10273, 11115: 10274, 11116: 10275 };
const TERASTAL_FORM = 10276;

const REGIONS: Record<string, number> = { alola: 7, galar: 8, hisui: 9, paldea: 10 };

/**
 * Alcremie's six sweets, which are *items* in the games and so have an official
 * name in every language — `alcremie-berry` is the Alcremie holding a Berry
 * Sweet. The form descriptor cannot supply a marker for these (English
 * "Vanilla Cream Berry Sweet" abbreviates to `V` for all six), but the item
 * noun can, in the languages that lead with it.
 */
const SWEET_ITEMS: Record<string, string> = {
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
  /**
   * A one-grapheme marker distinguishing an alt form from its species, for the
   * tile label — `A` for Alolan, `ア` in Japanese, `阿` in Chinese.
   *
   * Only present where it can be *derived from an official noun*, which in
   * practice means the regional forms: 57 of the app's 64. The reason is worth
   * recording, because the obvious generalisation does not survive contact with
   * the data. Abbreviating the composed form *label* works only in languages
   * that put the distinguishing word first — English `Alolan Form`, Japanese
   * `アローラのすがた` — and collapses in the ones that lead with a shared word:
   * French `Forme d'Alola` and `Forme de Galar` both give `F`, and every one of
   * Alcremie's six sweets gives `Z` in German (`Zucker-…`), `C` in Spanish
   * (`Confite…`) and `B` in Italian (`Bonbon…`).
   *
   * So the marker comes from the region's own name, which is a bare noun in all
   * nine languages and whose first grapheme is unique across the four regions in
   * every one of them. Forms with no such noun get no marker rather than an
   * invented one; their sprite and type badges carry the distinction, which is
   * how the games distinguish them too.
   */
  formMark: Record<string, string>;
  formCompact?: Record<string, string>;
  /**
   * Extra spellings a query might use, beyond the name itself: Hepburn romaji
   * in Japanese, jamo initials in Korean, pinyin and its initials in Chinese.
   * Dense and parallel to `species`, empty where there are none — and omitted
   * entirely for the Latin locales, which need nothing past the folding the
   * normalizer does. The name is NOT repeated here; names.ts joins it on load.
   */
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
  // Mega Meowstic has one design for both genders: PokéAPI's female Mega is a
  // pixel copy of the male one. Its name still comes from PokéAPI's
  // meowstic-male-mega row, but its identity names no gender, so its code is
  // M rather than M ♂.
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

  // Form names the Pokédex tables leave ambiguous, from newer game text: the
  // three Paldean Tauros breeds are all "Paldean Form" in zkn_form, and
  // Pokémon Champions names each breed (`npm run i18n:game-terms`).
  const sourcedForms = new Map(
    (JSON.parse(readFileSync(GAME_TERMS_PATH, 'utf8')) as GameTermsFixture).terms
      .filter((term) => term.key.startsWith('form.'))
      .map((term) => [Number(term.key.slice('form.'.length)), term.from[0].text]),
  );

  const bulbapedia = (JSON.parse(readFileSync(BULBAPEDIA_NAMES_PATH, 'utf8')) as BulbapediaNames).forms;
  for (const id of Object.keys(bulbapedia)) {
    if (!entries.some((entry) => entry.appId === Number(id))) throw new Error(`Bulbapedia name ${id} is not a picker form`);
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
    /**
     * Learn this language's regional-form pattern from forms it documents,
     * then *prove* it before trusting it.
     *
     * Deriving beats hardcoding: the result is built from the language's own
     * published wording rather than ours. But a pattern learned from a single
     * example can be badly wrong — English "Alolan Form" yields "{region}n
     * Form", which would render "Galarn Form" — so a candidate is kept only if
     * it reproduces *every* descriptor the language documents. English fails
     * that (its region adjectives are irregular) and correctly composes
     * nothing, which is harmless because it documents all 64 anyway.
     */
    const regionName = (region: string): string | undefined =>
      // Spanish has no rows in region_names.csv; these are proper nouns that
      // fr/de/it all render identically, so English is a safe stand-in.
      regionNames.get(`${REGIONS[region]}:${langId}`) ?? regionNames.get(`${REGIONS[region]}:${LANGUAGE_IDS.en}`);

    const documented = entries
      .filter((entry) => originalIds.has(entry.appId))
      .map((e) => ({ region: regionOf(e.appName), descriptor: formNames.get(`${e.formId}:${langId}`) }))
      .filter((d): d is { region: string; descriptor: string } => Boolean(d.region && d.descriptor));

    let pattern: string | null = null;
    for (const sample of documented) {
      const name = regionName(sample.region);
      if (!name || !sample.descriptor.includes(name)) continue;
      const candidate = sample.descriptor.replace(name, '{region}');
      const reproducesAll = documented.every((d) => {
        const n = regionName(d.region);
        return n ? candidate.replace('{region}', n) === d.descriptor : true;
      });
      if (reproducesAll) { pattern = candidate; break; }
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

    /**
     * Sweet markers, but only where they actually distinguish.
     *
     * The first grapheme of the item name separates all six in the languages
     * that put the distinguishing noun first — English `Berry Sweet`, Japanese
     * `ベリーアメざいく`, Chinese `野莓糖饰` — and separates none of them in the
     * ones that lead with the shared word: German `Zucker-Beere` and
     * `Zucker-Herz` both give `Z`, Spanish `Confite…` gives `C` six times,
     * Italian `Bonbon…` gives `B`. Rather than show six identical markers,
     * which claims a distinction it is not making, those languages get none and
     * fall back to the sprite.
     */
    const sweetMarks = new Map<string, string>();
    {
      const candidates = Object.entries(SWEET_ITEMS).map(([appName, slug]) => {
        const id = itemIdBySlug.get(slug);
        const name = id === undefined ? undefined : itemNames.get(`${id}:${langId}`);
        return { appName, mark: name ? firstGrapheme(name) : '' };
      });
      const marks = candidates.map((c) => c.mark);
      const usable = marks.every(Boolean) && new Set(marks).size === marks.length;
      if (usable) for (const c of candidates) sweetMarks.set(c.appName, c.mark);
    }

    let official = 0;
    let composed = 0;
    let sourced = 0;
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

      const descriptor = sourcedForms.get(entry.appId)?.[locale as keyof typeof LANGUAGE_IDS]
        ?? formNames.get(`${entry.formId}:${langId}`) ?? gameDescriptor(entry, locale);
      if (descriptor) {
        catalog.forms[entry.appId] = descriptor;
        catalog.formSource[entry.appId] = 'official';
        official += 1;
        continue;
      }
      const sweetItem = SWEET_ITEMS[entry.appName];
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
      if (!region || !pattern) continue;
      const name = regionName(region);
      if (!name) continue;
      catalog.forms[entry.appId] = pattern.replace('{region}', name);
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
    // A cosmetic variant of a Mega has an official name in only some
    // languages, and Japanese reuses the plain Mega's name for it. Compose
    // "<Mega> — <variant>" from both official names where the language has no
    // distinct name of its own.
    for (const [variantId, megaId, formId] of MEGA_VARIANTS) {
      const mega = catalog.forms[megaId];
      const variant = catalog.forms[formId];
      const own = catalog.forms[variantId];
      if (!mega || !variant || (own && own !== mega)) continue;
      catalog.forms[variantId] = `${mega} — ${variant}`;
      catalog.formSource[variantId] = 'official-composed';
    }
    for (const [id, mask] of Object.entries(TERASTAL_MASKS)) {
      if (!entries.some((entry) => entry.appId === Number(id))) throw new Error(`Terastal form ${id} is not a picker form`);
      const maskName = catalog.forms[mask];
      const terastal = catalog.forms[TERASTAL_FORM];
      if (!maskName || !terastal) throw new Error(`${locale} has no official name for ${maskName ? TERASTAL_FORM : mask}`);
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
    for (const [id, { names }] of Object.entries(bulbapedia)) {
      const name = names[locale];
      if (!name) continue;
      if (catalog.formSource[id] && catalog.formSource[id] !== 'english-only') {
        throw new Error(`${locale} ${id}: ${catalog.formSource[id]} name ${JSON.stringify(catalog.forms[id])} already exists; drop the Bulbapedia name`);
      }
      catalog.forms[id] = name;
      catalog.formSource[id] = 'official-bulbapedia';
      sourced += 1;
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
    const overlay = { formCompact: {} as Record<string, string>, species: Object.fromEntries(entries.filter(e => !originalIds.has(e.appId) && e.appId !== e.speciesId).map(e => [e.appId, e.speciesId])), forms: {} as Record<string, string>, formSource: {} as Record<string, NameProvenance> };
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
      `  ${locale.padEnd(8)} ${String(named).padStart(4)} species   ${String(official).padStart(3)} official forms   ${String(composed).padStart(3)} composed   ${String(sourced).padStart(2)} Bulbapedia   ${String(marked).padStart(3)} marked   ${pattern ?? '(no pattern)'}`,
    );
  }

  const altForms = Object.fromEntries(
    entries.filter((e) => originalIds.has(e.appId) && e.appId !== e.speciesId).map((e) => [e.appId, e.speciesId]),
  );
  // Outside OUT_DIR: names.ts glob-imports `names/*.json` as lazy per-locale
  // chunks, and a file that is both statically imported and matched by that
  // glob gets folded back into the main bundle.
  writeFileSync(ALT_FORM_OUT, `${JSON.stringify(altForms)}\n`);

  console.log(`${ALT_FORM_OUT}: ${Object.keys(altForms).length} alt forms`);
  console.log(`${OUT_DIR}/: ${Object.keys(LANGUAGE_IDS).length} catalogs`);
  for (const line of summary) console.log(line);
}

void main();
