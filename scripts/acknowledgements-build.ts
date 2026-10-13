/**
 * Build steps for the footer's Acknowledgements panel.
 *
 * `npmPackageIndex` writes `licenses/npm-packages.json`: the name, version
 * and license of every npm package the panel credits, and which license file
 * holds each one's text. It reads the list Vite's `build.license` writes
 * (`licenses/npm-packages.txt`) and the hand-written
 * `public/licenses/npm-packages-extra.txt`, so the panel's list changes with
 * the dependencies. The build fails when the extra file names a version that
 * is not the installed one.
 *
 * `stripCreditNotes` keeps only the fields the panel reads from
 * `src/data/spriteAttribution.json` and `src/data/creditTerms.json` as the
 * app imports them. The research's evidence, read dates and maintainers'
 * notes (`todo`, `cleanup`) stay in the repository and never reach a browser.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';
import type { NpmPackage, NpmPackageIndex } from '../src/data/npmPackages';

const BUILD_LIST = 'licenses/npm-packages.txt';
const EXTRA_LIST = 'npm-packages-extra.txt';
const INDEX = 'licenses/npm-packages.json';

interface Heading {
  name: string;
  version?: string;
  license?: string;
  /** Text after the license, such as "NOTICE": the file holds a notice of a package listed elsewhere. */
  part?: string;
}

/** Reads `## name - version (license): part` headings, the format Vite writes and the extra file copies. */
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
  // Vite names a package by the nearest package.json, so a package with a
  // nested one shows up by its folder ("country-flag-icons/string/3x2"),
  // with no license. The extra file holds that package's notice.
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

/** The versions the extra file states that differ from the installed packages. */
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
    // After every generateBundle hook, so Vite's own license list exists.
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

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const mapValues = (record: Json, fn: (value: Json) => Json) =>
  Object.fromEntries(Object.entries(record).map(([key, value]) => [key, fn(value)]));
const quote = ({ text, url }: Json) => ({ text, url });

/** What the panel reads from each credits file; everything else is a maintainer's note. */
const PANEL_FIELDS: Record<string, (data: Json) => Json> = {
  '/src/data/spriteAttribution.json': (data) => ({
    sprites: mapValues(data.sprites, ({ artists, role, roles, artistNotes, via }) => ({
      artists, role, ...(roles ? { roles } : {}), ...(artistNotes ? { artistNotes } : {}), via,
    })),
    artists: mapValues(data.artists, ({ creditedAs }) => (creditedAs ? { creditedAs } : {})),
    projects: mapValues(data.projects, ({ artists }) => ({ artists })),
  }),
  '/src/data/creditTerms.json': (data) => ({
    sources: mapValues(data.sources, ({ terms }) => ({ terms: terms.map(quote) })),
    artists: mapValues(data.artists, ({ urls, terms, termsSource, note }) => {
      // The links the audit proved, primary first; their proofs stay here.
      const links = { urls: urls ?? [] };
      if (termsSource && !terms?.length) return { ...links, termsSource };
      if (termsSource) return { ...links, terms: terms.map(quote), termsSource };
      // An artist with no terms of their own may point, in the note, at
      // another record's quote: MyMarshlands at Kyle Dove's post.
      const quoteUrl = !terms.length ? /https?:\/\/\S+/.exec(note ?? '')?.[0] : undefined;
      return { ...links, terms: terms.map(quote), ...(quoteUrl ? { quoteUrl } : {}) };
    }),
  }),
};

export function stripCreditNotes(): Plugin {
  return {
    name: 'my151:strip-credit-notes',
    enforce: 'pre',
    load(id) {
      const pick = Object.entries(PANEL_FIELDS).find(([file]) => id.endsWith(file))?.[1];
      return pick ? JSON.stringify(pick(JSON.parse(fs.readFileSync(id, 'utf8')))) : null;
    },
  };
}
