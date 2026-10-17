import { describe, expect, it } from 'vitest';
import { LOCALES } from './config';
import altFormSpecies from './alt-form-species.json';

const ALT_FORM_SPECIES = altFormSpecies as Record<string, number>;

interface Catalog {
  species: string[];
  forms: Record<string, string>;
  formMark: Record<string, string>;
}

const FILES = import.meta.glob<Catalog>('./names/*.json', { import: 'default', eager: true });
const catalogs = new Map<string, Catalog>(
  LOCALES.map((l) => [l, FILES[`./names/${l}.json`]]),
);

const bySpecies = new Map<number, string[]>();
for (const [appId, speciesId] of Object.entries(ALT_FORM_SPECIES)) {
  if (!bySpecies.has(speciesId)) bySpecies.set(speciesId, []);
  bySpecies.get(speciesId)!.push(appId);
}

const graphemes = (s: string) => [
  ...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s.normalize('NFC')),
];

describe('form marker', () => {
  it.each(LOCALES)('%s marks every regional form', (locale) => {
    const { formMark } = catalogs.get(locale)!;
    const marked = Object.keys(formMark).length;
    expect(marked).toBeGreaterThanOrEqual(57);
  });

  it.each(LOCALES)('%s uses exactly one grapheme per marker', (locale) => {
    const { formMark } = catalogs.get(locale)!;
    const tooLong = Object.entries(formMark).filter(([, m]) => graphemes(m).length !== 1);
    expect(tooLong).toEqual([]);
  });

  const SHARED_MARKER_OK = new Set([128]);

  it.each(LOCALES)('%s never gives two forms of one species the same marker', (locale) => {
    const { formMark } = catalogs.get(locale)!;
    const clashes: string[] = [];
    for (const [speciesId, appIds] of bySpecies) {
      if (SHARED_MARKER_OK.has(speciesId)) continue;
      const marks = appIds.map((id) => formMark[id]).filter(Boolean);
      const dupes = marks.filter((m, i) => marks.indexOf(m) !== i);
      if (dupes.length) clashes.push(`species ${speciesId}: ${marks.join(' ')}`);
    }
    expect(clashes).toEqual([]);
  });
});
