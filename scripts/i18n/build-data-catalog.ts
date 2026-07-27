/**
 * Generates `src/i18n/catalogs/en.data.ts` from the four data modules that
 * carry user-facing English: build sections, categories, archetypes and
 * regional dexes. Around 240 strings — a third of the whole corpus.
 *
 * Those modules keep their `name` / `description` / `label` fields as the
 * English source of record, because that is where they are naturally authored
 * and reviewed. This script lifts them into catalog keys so the other eight
 * locales have something to translate, and `dataLabels.ts` reads them back
 * through `t()`.
 *
 * The pairing is enforced rather than trusted: `en.data.test.ts` asserts every
 * id has a key and every value still equals the data field, so editing a name
 * without regenerating fails the build instead of silently shipping stale
 * copy in eight languages.
 *
 * Run: npm run i18n:data
 */
import { writeFileSync } from 'node:fs';
import { ARCHETYPES } from '../../src/data/archetypes';
import { CATEGORIES } from '../../src/data/categories';
import { REGIONAL_DEXES } from '../../src/data/regional-dexes';
import { BUILD_GROUPS } from '../../src/data/slot-template';

const OUT = 'src/i18n/catalogs/en.data.ts';

function collect(): Record<string, string> {
  const out: Record<string, string> = {};
  const put = (key: string, value: string | undefined) => {
    if (!value) return;
    if (out[key] !== undefined && out[key] !== value) {
      throw new Error(`key collision: ${key} = "${out[key]}" vs "${value}"`);
    }
    out[key] = value;
  };

  for (const g of BUILD_GROUPS) put(`section.${g.id}`, g.name);

  for (const c of CATEGORIES) {
    put(`category.${c.id}`, c.name);
    c.subgroups?.forEach((s, i) => put(`category.${c.id}.sub.${i}`, s.label));
    if (c.dualColumns) {
      put(`category.${c.id}.col.left`, c.dualColumns.left.label);
      put(`category.${c.id}.col.right`, c.dualColumns.right.label);
    }
  }

  for (const a of ARCHETYPES) {
    put(`archetype.${a.id}`, a.name);
    put(`archetype.${a.id}.desc`, a.description);
    a.subgroups?.forEach((s, i) => put(`archetype.${a.id}.sub.${i}`, s.label));
  }

  for (const d of REGIONAL_DEXES) put(`region.${d.id}`, d.name);

  return out;
}

function main(): void {
  const entries = collect();
  const body = Object.keys(entries)
    .sort()
    .map((k) => `  '${k}': ${JSON.stringify(entries[k])},`)
    .join('\n');

  writeFileSync(
    OUT,
    `/**
 * GENERATED — do not edit by hand.
 *
 * Source: src/data/{slot-template,categories,archetypes,regional-dexes}.ts
 * Regenerate: npm run i18n:data
 *
 * These are the English strings authored in the data modules. They live here so
 * the other locales have keys to translate against; en.data.test.ts asserts
 * this file still matches its sources.
 */
export const enData = {
${body}
} as const;
`,
  );
  console.log(`${OUT}: ${Object.keys(entries).length} keys`);
}

main();
