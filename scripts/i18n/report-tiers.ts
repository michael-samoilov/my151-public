/**
 * Prints what a locale would actually have to translate, by tier and by
 * source group. Run: npm run i18n:tiers
 *
 * The headline number is how much of the corpus a locale needs before it can
 * leave the preview flag. The per-group breakdown matters more than the total,
 * because the groups differ enormously in how translatable they are: official
 * terminology is *looked up*, whereas archetype and section names are fandom
 * coinages with no published translation in any language.
 */
import { en } from '../../src/i18n/catalogs/en';
import { keysByTier, tierOf, LAUNCH_TIERS, type Tier } from '../../src/i18n/tiers';
import type { MessageKey } from '../../src/i18n/types';

/** Coarse grouping by key prefix, to show where the volume actually is. */
function group(key: string): string {
  if (key.startsWith('term.')) return 'in-game terms';
  if (key.startsWith('region.') || key === 'dex.national') return 'regions';
  if (key.startsWith('archetype.')) return 'archetype labels';
  if (key.startsWith('category.')) return 'category labels';
  if (key.startsWith('section.')) return 'build sections';
  if (key.startsWith('advisor.')) return "what's-missing advisor";
  if (key.startsWith('milestone.') || key.startsWith('nudge.')) return 'milestones';
  if (key.startsWith('analytics.') || key.startsWith('drilldown.')) return 'analytics';
  if (key.startsWith('browser.')) return 'browser / filters';
  if (key.startsWith('viewSettings.') || key.startsWith('sort.')) return 'view settings';
  return 'other UI';
}

function main(): void {
  const keys = Object.keys(en) as MessageKey[];
  const byTier = keysByTier();
  const total = keys.length;
  const launch = LAUNCH_TIERS.reduce((n, tier) => n + byTier[tier].length, 0);
  const pct = (n: number) => `${((n * 100) / total).toFixed(0).padStart(3)}%`;

  console.log(`\ncatalog: ${total} keys\n`);
  for (const tier of ['official', 'core', 'editorial'] as Tier[]) {
    console.log(`  ${tier.padEnd(10)} ${String(byTier[tier].length).padStart(4)}  ${pct(byTier[tier].length)}`);
  }
  console.log(`  ${'—'.repeat(20)}`);
  console.log(`  ${'LAUNCH'.padEnd(10)} ${String(launch).padStart(4)}  ${pct(launch)}   (${LAUNCH_TIERS.join(' + ')})\n`);

  // Cross-tab: which groups make up each tier, and whether they can be sourced.
  const table = new Map<string, Record<Tier, number>>();
  for (const key of keys) {
    const g = group(key);
    const row = table.get(g) ?? { official: 0, core: 0, editorial: 0 };
    row[tierOf(key)] += 1;
    table.set(g, row);
  }

  console.log(`  ${'group'.padEnd(24)}${'official'.padStart(9)}${'core'.padStart(7)}${'editorial'.padStart(11)}`);
  const rows = [...table.entries()].sort(
    (a, b) => b[1].official + b[1].core + b[1].editorial - (a[1].official + a[1].core + a[1].editorial),
  );
  for (const [g, row] of rows) {
    console.log(
      `  ${g.padEnd(24)}${String(row.official).padStart(9)}${String(row.core).padStart(7)}${String(row.editorial).padStart(11)}`,
    );
  }

  const unsourceableCore = rows
    .filter(([g]) => g === 'archetype labels' || g === 'category labels' || g === 'build sections')
    .reduce((n, [, row]) => n + row.core, 0);
  console.log(
    `\n  Of the ${byTier.core.length} core keys, ${unsourceableCore} are archetype / category / section\n` +
      `  labels — fandom coinages with no published translation in any language.\n` +
      `  They are functional (a user navigates by them) but they cannot be looked\n` +
      `  up, only translated. That is the tier boundary worth deciding on.\n`,
  );
}

main();
