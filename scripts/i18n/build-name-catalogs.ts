/**
 * Generates `src/i18n/names/<locale>.json` — species names, form descriptors
 * and search affixes for the nine shipped locales.
 *
 * Everything here is *sourced*, never translated. Where PokeAPI has no official
 * form descriptor for a regional form — it is missing for 26 of our 64 in
 * Korean, Chinese, Spanish and Italian, and for all 16 Hisuian forms — the
 * descriptor is composed from two official pieces: the region's published name
 * in that language, and a pattern learned from a form the language *does*
 * document. Japanese documents アローラのすがた, so the pattern is
 * "{region}のすがた", and Hisuian becomes ヒスイのすがた.
 *
 * That is a reconstruction, not an official string, and it is recorded as such:
 * every entry carries a provenance so the UI can flag anything unofficial.
 *
 * Run: npm run i18n:names
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { LANGUAGE_IDS, ROMAJI_LANGUAGE_ID, ensureCsvs, readCsv } from './pokeapi';
import type { IdMapEntry } from './propose-id-map';
import { searchAffix } from './searchAffixes';

const OUT_DIR = 'src/i18n/names';
const ALT_FORM_OUT = 'src/i18n/alt-form-species.json';

/** How a name was arrived at. Anything but `official` is flagged in the UI. */
export type NameProvenance = 'official' | 'official-composed';

/** Regions whose forms the app carries, by PokeAPI region id. */
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
  /** Dense, indexed by speciesId - 1. */
  species: string[];
  /** Form descriptor per app id, only for entries that have one. */
  forms: Record<string, string>;
  /** Provenance for each form descriptor, same keys as `forms`. */
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
  for (const region of Object.keys(REGIONS)) if (appName.includes(`-${region}`)) return region;
  return null;
}

async function main(): Promise<void> {
  await ensureCsvs();
  mkdirSync(OUT_DIR, { recursive: true });

  const { entries } = JSON.parse(readFileSync('scripts/i18n/pokemon-id-map.json', 'utf8')) as {
    entries: IdMapEntry[];
  };

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

    // First grapheme, not first code unit: Korean syllables and any character
    // outside the BMP would be cut in half by `[0]`.
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
    let marked = 0;
    for (const entry of entries) {
      const markRegion = regionOf(entry.appName);
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

      const descriptor = formNames.get(`${entry.formId}:${langId}`);
      if (descriptor) {
        catalog.forms[entry.appId] = descriptor;
        catalog.formSource[entry.appId] = 'official';
        official += 1;
        continue;
      }
      const region = regionOf(entry.appName);
      if (!region || !pattern) continue;
      const name = regionName(region);
      if (!name) continue;
      catalog.forms[entry.appId] = pattern.replace('{region}', name);
      catalog.formSource[entry.appId] = 'official-composed';
      composed += 1;
    }

    const affix = catalog.species.map((name, i) =>
      name ? searchAffix(locale, name, romaji.get(i + 1)) : '',
    );
    // Omitted rather than shipped empty: for the five Latin locales every entry
    // would be '', which is 1,025 commas of nothing in the payload.
    if (affix.some(Boolean)) catalog.affix = affix;

    writeFileSync(`${OUT_DIR}/${locale}.json`, `${JSON.stringify(catalog)}\n`);
    const named = catalog.species.filter(Boolean).length;
    summary.push(
      `  ${locale.padEnd(8)} ${String(named).padStart(4)} species   ${String(official).padStart(3)} official forms   ${String(composed).padStart(3)} composed   ${String(marked).padStart(3)} marked   ${pattern ?? '(no pattern)'}`,
    );
  }

  /**
   * appId -> speciesId, but only where they differ. For all 1,025 base species
   * they are equal, so shipping the full map would put ~1,000 redundant pairs
   * (and every entry's slug, form id and note) into the main bundle — it added
   * ~95 kB before this was split out. Only the 64 alt forms need stating.
   */
  const altForms = Object.fromEntries(
    entries.filter((e) => e.appId !== e.speciesId).map((e) => [e.appId, e.speciesId]),
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
