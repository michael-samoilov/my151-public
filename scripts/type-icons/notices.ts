/**
 * Writes the type icon lines of THIRD_PARTY_NOTICES.md from the icon build's
 * own `selections.json`, so the notice names exactly the types each source
 * drew. The lines sit between `<!-- type-icons:<source> -->` markers.
 *
 * Run: npx tsx scripts/type-icons/notices.ts [--write]
 * Without --write it exits 1 when the file is stale.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../../', import.meta.url);
const NOTICES = new URL('THIRD_PARTY_NOTICES.md', ROOT);
const SELECTIONS = new URL('scripts/type-icons/selections.json', ROOT);

interface Selection { source: string; mirroredHalf: string | null }

const list = (names: string[]) => new Intl.ListFormat('en', { type: 'conjunction' }).format(names);
const title = (type: string) => type[0].toUpperCase() + type.slice(1);

/** Each marked line, by source, in the games' type order. */
export function typeIconLines(selections: Record<string, Selection>): Record<string, string> {
  const of = (source: string) => Object.entries(selections).filter(([, s]) => s.source === source);
  const party = of('partywhale');
  const mirrored = party.filter(([, s]) => s.mirroredHalf).map(([type]) => title(type));
  return {
    partywhale: `${list(party.map(([type]) => title(type)))} use SVG artwork from [Partywhale's Pokémon type icons](https://github.com/partywhale/pokemon-type-icons), commit \`fcbe6978c61c359680bc07636c3f9bdc0f346b43\`.${mirrored.length ? ` ${list(mirrored)} are modified to mirror the original right half.` : ''}`,
    elginive: `${list(of('elginive').map(([type]) => title(type)))} use artwork from [Elginive's Pokémon type icons](https://github.com/Elginive/pokemon-type-icons), commit \`b8562e080dd0b48742a9ba0c9b0bc7f1acdc5d88\`.`,
  };
}

/** The notices file with its marked lines rewritten. */
export function renderNotices(notices: string, selections: Record<string, Selection>): string {
  let out = notices;
  for (const [source, line] of Object.entries(typeIconLines(selections))) {
    const marker = new RegExp(`(<!-- type-icons:${source} -->\\n)[^\\n]*`);
    if (!marker.test(out)) throw new Error(`THIRD_PARTY_NOTICES.md has no <!-- type-icons:${source} --> marker.`);
    out = out.replace(marker, `$1${line}`);
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const notices = readFileSync(NOTICES, 'utf8');
  const next = renderNotices(notices, JSON.parse(readFileSync(SELECTIONS, 'utf8')));
  if (process.argv.includes('--write')) writeFileSync(NOTICES, next);
  else if (next !== notices) {
    console.error('THIRD_PARTY_NOTICES.md: the type icon lines are stale. Run: npx tsx scripts/type-icons/notices.ts --write');
    process.exit(1);
  }
}
