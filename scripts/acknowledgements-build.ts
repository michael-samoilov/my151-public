

import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';
import type { NpmPackage, NpmPackageIndex } from '../src/data/npmPackages';
import type spriteAttribution from '../src/data/spriteAttribution.json';
import type creditTerms from '../src/data/creditTerms.json';

const BUILD_LIST = 'licenses/npm-packages.txt';
const EXTRA_LIST = 'npm-packages-extra.txt';
const INDEX = 'licenses/npm-packages.json';

interface Heading {
  name: string;
  version?: string;
  license?: string;
  part?: string;
}

// platform: Vite writes license headings as `## name - version (license): part`, and the extra file copies that format.
export function readHeadings(markdown: string): Heading[] {
  return [...markdown.matchAll(/^## (.+?)(?: - (\S+))?(?: \(([^)]+)\))?(?:: (.+))?$/gm)].map(([, name, version, license, part]) => ({
    name,
    version: version?.replace(/^v/, ''),
    license,
    part,
  }));
}

export function buildIndex(buildList: string, extraList: string): NpmPackageIndex {
  const built = readHeadings(buildList);
  const extra = readHeadings(extraList);
  const extraNames = new Set(extra.map((heading) => heading.name));
  // platform: Vite names a package by its nearest package.json, so a nested one shows as a folder path with no license.
  const supersededBy = (name: string) => [...extraNames].some((root) => name.startsWith(`${root}/`));
  const kept = built.filter((heading) => heading.license || !supersededBy(heading.name));
  const packages = new Map<string, NpmPackage>();
  for (const heading of [...kept, ...extra.filter((heading) => !heading.part)]) {
    packages.set(`${heading.name}@${heading.version ?? ''}`, {
      name: heading.name,
      ...(heading.version ? { version: heading.version } : {}),
      license: heading.license ?? 'UNKNOWN',
    });
  }
  return {
    packages: [...packages.values()].sort((a, b) => a.name.localeCompare(b.name, 'en')),
    files: [
      { file: 'npm-packages.txt', holds: kept.map((heading) => heading.name) },
      { file: EXTRA_LIST, holds: extra.map((heading) => (heading.part ? `${heading.name} ${heading.part}` : heading.name)) },
    ],
  };
}

function staleVersions(extraList: string, root: string): string[] {
  return readHeadings(extraList).flatMap((heading) => {
    if (!heading.version) return [];
    const manifest = path.join(root, 'node_modules', heading.name, 'package.json');
    if (!fs.existsSync(manifest)) return [`${heading.name} is not installed`];
    const installed = JSON.parse(fs.readFileSync(manifest, 'utf8')).version as string;
    return installed === heading.version ? [] : [`${heading.name} is ${installed}, not ${heading.version}`];
  });
}

export function npmPackageIndex(): Plugin {
  let root = process.cwd();
  return {
    name: 'my151:npm-package-index',
    apply: 'build',
    configResolved(config) {
      root = config.root;
    },
    // platform: Vite's own license list exists only after every generateBundle hook, so this runs in writeBundle.
    writeBundle(options, bundle) {
      const asset = bundle[BUILD_LIST];
      if (!asset || asset.type !== 'asset' || !options.dir) return;
      const extraList = fs.readFileSync(path.join(root, 'public/licenses', EXTRA_LIST), 'utf8');
      const stale = staleVersions(extraList, root);
      if (stale.length) {
        throw new Error(`public/licenses/${EXTRA_LIST} names the wrong version: ${stale.join('; ')}. Update its heading and notice.`);
      }
      const index = buildIndex(String(asset.source), extraList);
      fs.writeFileSync(path.join(options.dir, INDEX), `${JSON.stringify(index)}\n`);
    },
  };
}

interface QuoteInput {
  text: string;
  url: string;
}

type CheckedInput<Input, Source extends Input> = Source extends Input ? Input : never;

type AttributionInput = CheckedInput<{
  sprites: Record<string, { via: string; artists?: string[] | null }>;
}, typeof spriteAttribution>;

type TermsInput = CheckedInput<{
  sources: Record<string, { terms: QuoteInput[] }>;
  artists: Record<string, { urls?: string[] | null; terms?: QuoteInput[] | null; [field: string]: unknown }>;
}, typeof creditTerms>;

interface PanelTerms {
  sources: Record<string, { terms: QuoteInput[] }>;
  artists: Record<string, { urls: string[]; terms: QuoteInput[] }>;
}

const quote = ({ text, url }: QuoteInput): QuoteInput => ({ text, url });

const OWN_UPLOAD = 'own upload';
const PANEL_ROWS = new Set([OWN_UPLOAD, 'gen9-resource-pack']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) throw new TypeError(`${field} must be an object`);
  return value;
}

function readString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new TypeError(`${field} must be a string`);
  return value;
}

function readStrings(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) throw new TypeError(`${field} must be an array`);
  return value.map((item: unknown, index) => readString(item, `${field}[${index}]`));
}

function readQuotes(value: unknown, field: string): QuoteInput[] {
  if (!Array.isArray(value)) throw new TypeError(`${field} must be an array`);
  return value.map((item: unknown, index) => {
    const row = readRecord(item, `${field}[${index}]`);
    return {
      text: readString(row.text, `${field}[${index}].text`),
      url: readString(row.url, `${field}[${index}].url`),
    };
  });
}

function readAttribution(file: string): AttributionInput {
  const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
  const data = readRecord(parsed, file);
  const rows = readRecord(data.sprites, `${file}.sprites`);
  return {
    sprites: Object.fromEntries(Object.entries(rows).map(([name, value]): [string, AttributionInput['sprites'][string]] => {
      const row = readRecord(value, `${file}.sprites.${name}`);
      const via = readString(row.via, `${file}.sprites.${name}.via`);
      if (via !== OWN_UPLOAD) return [name, { via }];
      const artists = row.artists;
      return [name, {
        via,
        artists: artists === undefined || artists === null ? artists : readStrings(artists, `${file}.sprites.${name}.artists`),
      }];
    })),
  };
}

function readTerms(file: string): TermsInput {
  const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
  const data = readRecord(parsed, file);
  return {
    sources: Object.fromEntries(Object.entries(readRecord(data.sources, `${file}.sources`))
      .map(([id, value]): [string, TermsInput['sources'][string]] => {
        const row = readRecord(value, `${file}.sources.${id}`);
        return [id, { terms: readQuotes(row.terms, `${file}.sources.${id}.terms`) }];
      })),
    artists: Object.fromEntries(Object.entries(readRecord(data.artists, `${file}.artists`))
      .map(([name, value]): [string, TermsInput['artists'][string]] => {
        const row = readRecord(value, `${file}.artists.${name}`);
        const { urls, terms } = row;
        return [name, {
          urls: urls === undefined || urls === null ? urls : readStrings(urls, `${file}.artists.${name}.urls`),
          terms: terms === undefined || terms === null ? terms : readQuotes(terms, `${file}.artists.${name}.terms`),
        }];
      })),
  };
}

function projectAttribution(data: AttributionInput): AttributionInput {
  return {
    sprites: Object.fromEntries(Object.entries(data.sprites)
      .filter(([, row]) => PANEL_ROWS.has(row.via))
      .map(([file, row]) => [file, row.via === OWN_UPLOAD ? { via: row.via, artists: row.artists } : { via: row.via }])),
  };
}

function projectTerms(data: TermsInput, attribution: AttributionInput, acknowledgementSource: string): PanelTerms {
  const direct = new Set(Object.values(attribution.sprites).filter((row) => row.via === OWN_UPLOAD).flatMap((row) => row.artists ?? []));
  const entries = new Set([...acknowledgementSource.matchAll(/\bid: '([^']+)'/g)].map((match) => match[1]));
  return {
    sources: Object.fromEntries(Object.entries(data.sources)
      .filter(([id]) => entries.has(id))
      .map(([id, { terms }]) => [id, { terms: terms.map(quote) }])),
    artists: Object.fromEntries(Object.entries(data.artists)
      .filter(([name]) => direct.has(name))
      .map(([name, { urls, terms }]) => [name, { urls: urls ?? [], terms: (terms ?? []).map(quote) }])),
  };
}

export function stripCreditNotes(): Plugin {
  return {
    name: 'my151:strip-credit-notes',
    enforce: 'pre',
    load(id) {
      if (id.endsWith('/src/data/spriteAttribution.json')) {
        return JSON.stringify(projectAttribution(readAttribution(id)));
      }
      if (id.endsWith('/src/data/creditTerms.json')) {
        const root = id.slice(0, id.indexOf('/src/data/'));
        return JSON.stringify(projectTerms(
          readTerms(id),
          readAttribution(path.join(root, 'src/data/spriteAttribution.json')),
          fs.readFileSync(path.join(root, 'src/data/acknowledgements.ts'), 'utf8'),
        ));
      }
      return null;
    },
  };
}
