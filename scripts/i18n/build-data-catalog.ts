

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
    `export const enData = {
${body}
} as const;
`,
  );
  console.log(`${OUT}: ${Object.keys(entries).length} keys`);
}

main();
