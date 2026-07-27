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

const OUT_DIR = 'src/i18n/names';

/** How a name was arrived at. Anything but `official` is flagged in the UI. */
export type NameProvenance = 'official' | 'official-composed';

/** Regions whose forms the app carries, by PokeAPI region id. */
const REGIONS: Record<string, number> = { alola: 7, galar: 8, hisui: 9, paldea: 10 };

interface NameCatalog {
  locale: string;
  /** Dense, indexed by speciesId - 1. */
  species: string[];
  /** Form descriptor per app id, only for entries that have one. */
  forms: Record<string, string>;
  /** Provenance for each form descriptor, same keys as `forms`. */
  formSource: Record<string, NameProvenance>;
  /** Hepburn romaji, ja only — a Japanese user on a Latin keyboard types this. */
  romaji?: string[];
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
    };

    let official = 0;
    let composed = 0;
    for (const entry of entries) {
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

    if (locale === 'ja') {
      catalog.romaji = Array.from({ length: maxSpecies }, (_, i) => romaji.get(i + 1) ?? '');
    }

    writeFileSync(`${OUT_DIR}/${locale}.json`, `${JSON.stringify(catalog)}\n`);
    const named = catalog.species.filter(Boolean).length;
    summary.push(
      `  ${locale.padEnd(8)} ${String(named).padStart(4)} species   ${String(official).padStart(3)} official forms   ${String(composed).padStart(3)} composed   ${pattern ?? '(no pattern)'}`,
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
  writeFileSync(`${OUT_DIR}/alt-form-species.json`, `${JSON.stringify(altForms)}\n`);

  console.log(`${OUT_DIR}/alt-form-species.json: ${Object.keys(altForms).length} alt forms`);
  console.log(`${OUT_DIR}/: ${Object.keys(LANGUAGE_IDS).length} catalogs`);
  for (const line of summary) console.log(line);
}

void main();
