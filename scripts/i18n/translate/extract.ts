import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { en } from '../../../src/i18n/catalogs/en';
import { tierOf, LAUNCH_TIERS } from '../../../src/i18n/tiers';
import type { MessageKey } from '../../../src/i18n/types';

const OUT = 'docs/i18n/source.json';
const SRC_DIRS = ['src'];
const EXCLUDE = [/\/components\/admin\//, /\.test\.tsx?$/, /\/i18n\/catalogs\//];

interface Site {
  file: string;
  line: number;
  slot: string;
  code: string;
}

interface Entry {
  key: string;
  source: string;
  tier: string;
  placeholders: string[];
  plural: boolean;
  sites: Site[];
  enHash: string;
  contextHash: string;
  unreferenced?: true;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name).replaceAll('\\', '/');
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx)$/.test(path) && !EXCLUDE.some((re) => re.test(path))) out.push(path);
  }
  return out;
}

function slotOf(lines: string[], index: number): string {
  const line = lines[index];
  const attr = /(\w[\w-]*)=\{[^}]*$/.exec(line.slice(0, line.indexOf('t(')));
  if (attr) return attr[1];
  for (let i = index; i >= 0 && i > index - 12; i--) {
    const tag = /<([A-Za-z][\w.]*)[\s/>]/.exec(lines[i]);
    if (tag) return tag[1];
  }
  return 'unknown';
}

const CALL = /\b(?:t|tn|translate|translatePlural|rawMessage)\(\s*'([^']+)'/g;
const LITERAL = /'([^']+)'/g;

function collectSites(keys: Set<string>): { calls: Map<string, Site[]>; literals: Map<string, Site[]> } {
  const calls = new Map<string, Site[]>();
  const literals = new Map<string, Site[]>();
  const push = (map: Map<string, Site[]>, key: string, site: Site) => {
    const list = map.get(key) ?? [];
    list.push(site);
    map.set(key, list);
  };

  for (const dir of SRC_DIRS) {
    for (const file of walk(dir)) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        const site = () => ({ file, line: i + 1, slot: slotOf(lines, i), code: line.trim().slice(0, 160) });
        for (const m of line.matchAll(CALL)) push(calls, m[1], site());
        for (const m of line.matchAll(LITERAL)) {
          if (keys.has(m[1])) push(literals, m[1], site());
        }
      });
    }
  }
  return { calls, literals };
}

const DERIVED: { prefix: string; via: string }[] = [
  { prefix: 'term.', via: 'src/i18n/terms.ts — in-game terminology, sourced from PokeAPI, never translated' },
  { prefix: 'section.', via: 'src/i18n/dataLabels.ts — a build-section heading in the builder' },
  { prefix: 'category.', via: 'src/i18n/dataLabels.ts — a browse category name or its subgroup labels' },
  { prefix: 'archetype.', via: 'src/i18n/dataLabels.ts — an archetype name, description or subgroup label' },
  { prefix: 'region.', via: 'src/i18n/dataLabels.ts — a region name, sourced from PokeAPI' },
  { prefix: 'dex.', via: 'src/i18n/dataLabels.ts — a regional dex name' },
  {
    prefix: 'sectionShort.',
    via:
      'src/lib/sectionOutlines.ts — a shorter form of the section heading, drawn ' +
      'inside a narrow outline on the View poster. Must be materially shorter than ' +
      'section.<same id> or it buys nothing; a locale that has no good short form ' +
      'should omit the key rather than invent one, and the full name is used.',
  },
  {
    prefix: 'sectionTiny.',
    via:
      'src/lib/sectionOutlines.ts — the shortest form of the section heading, for the ' +
      'narrowest outlines. Same rules as sectionShort, one rung shorter again.',
  },
];

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

function placeholdersOf(source: string): string[] {
  return [...source.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
}

function main(): void {
  const keys = new Set(Object.keys(en));
  const { calls, literals } = collectSites(keys);
  const entries: Entry[] = [];
  const orphans: string[] = [];

  for (const [key, source] of Object.entries(en) as [MessageKey, string][]) {
    const tier = tierOf(key);

    if (tier === 'official') continue;

    const plural = /_(one|other)$/.test(key);
    const lookupKey = key.replace(/_(one|other)$/, '');
    const found =
      calls.get(key) ?? calls.get(lookupKey) ?? literals.get(key) ?? literals.get(lookupKey) ?? [];
    const derived = DERIVED.find((d) => key.startsWith(d.prefix));

    const context = found.length
      ? found.map((s) => `${s.file}:${s.line} <${s.slot}> ${s.code}`).join('\n')
      : (derived?.via ?? '');

    if (!context) orphans.push(key);

    entries.push({
      key,
      source,
      tier,
      placeholders: placeholdersOf(source),
      plural,
      sites: found,
      enHash: hash(source),
      contextHash: hash(context),
      ...(context ? {} : { unreferenced: true as const }),
    });
  }

  mkdirSync('docs/i18n', { recursive: true });

  writeFileSync(
    OUT,
    [
      '{',
      '  "generated": "npm run i18n:extract",',
      '  "note": "Source of record for translation. One line per key. Regenerate rather than editing.",',
      `  "launchTiers": ${JSON.stringify(LAUNCH_TIERS)},`,
      '  "entries": [',
      entries.map((e) => `    ${JSON.stringify(e)}`).join(',\n'),
      '  ]',
      '}',
      '',
    ].join('\n'),
  );

  const byTier = entries.reduce<Record<string, number>>((acc, e) => {
    acc[e.tier] = (acc[e.tier] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`${OUT}: ${entries.length} keys`);
  for (const [tier, n] of Object.entries(byTier)) console.log(`  ${tier.padEnd(10)} ${n}`);
  console.log(`  with call sites  ${entries.filter((e) => e.sites.length > 0).length}`);
  if (orphans.length) {
    console.log(`\n  ${orphans.length} key(s) with no context at all — dead, or reached some way`);
    console.log('  the scanner cannot see. Worth resolving before translating them nine times:');
    for (const key of orphans.slice(0, 40)) console.log(`    ${key}`);
    if (orphans.length > 40) console.log(`    …and ${orphans.length - 40} more`);
  }
}

main();
