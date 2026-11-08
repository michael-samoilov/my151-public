import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export interface SpecTiming { ms: number; tests: number; unmapped: boolean }
export interface TestMap {
  version: 1;
  sourceCommit: string;
  recordedAt: string;
  specs: Record<string, SpecTiming>;
  sources: Record<string, string[]>;
}
export interface Recorded { file: string; project: string; title: string; sources: string[] }
export interface Attempt { title: string[]; durationMs: number }

export const TEST_MAP_PATH = 'scripts/ci/test-map.json';

export function buildTestMap(records: Recorded[], attempts: Attempt[], sourceCommit: string, recordedAt: string): TestMap {
  const specs: Record<string, SpecTiming> = {};
  const sources = new Map<string, Set<string>>();
  const mapped = new Set<string>();
  for (const record of records) {
    specs[record.file] ??= { ms: 0, tests: 0, unmapped: true };
    specs[record.file].tests++;
    if (record.sources.length) mapped.add(record.file);
    for (const source of record.sources) {
      if (!sources.has(source)) sources.set(source, new Set());
      sources.get(source)!.add(record.file);
    }
  }
  for (const attempt of attempts) {
    const spec = specs[`e2e/${attempt.title[2]}`];
    if (spec) spec.ms += attempt.durationMs;
  }
  for (const [file, spec] of Object.entries(specs)) spec.unmapped = !mapped.has(file);
  const sorted = <T>(entries: [string, T][]) => Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b)));
  return {
    version: 1,
    sourceCommit,
    recordedAt,
    specs: sorted(Object.entries(specs)),
    sources: sorted([...sources].map(([source, files]) => [source, [...files].sort()])),
  };
}

export function readRecords(directory: string): Recorded[] {
  return readdirSync(directory).filter(name => name.endsWith('.jsonl')).flatMap(name =>
    readFileSync(join(directory, name), 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line) as Recorded));
}

export function readAttempts(file: string): Attempt[] {
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line) as Attempt);
}

interface StoredTestMap extends Omit<TestMap, 'sources'> { sources: Record<string, number[]> }

export function serializeTestMap(map: TestMap): string {
  const files = Object.keys(map.specs);
  const index = new Map(files.map((file, position) => [file, position]));
  const lines = (entries: [string, unknown][]) => entries.map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)}`).join(',\n');
  return `{
 "version": ${map.version},
 "sourceCommit": ${JSON.stringify(map.sourceCommit)},
 "recordedAt": ${JSON.stringify(map.recordedAt)},
 "specs": {
${lines(Object.entries(map.specs))}
 },
 "sources": {
${lines(Object.entries(map.sources).map(([source, specs]) => [source, specs.map(file => index.get(file))]))}
 }
}
`;
}

export function parseTestMap(text: string): TestMap | undefined {
  const stored = JSON.parse(text) as StoredTestMap;
  if (stored.version !== 1) return undefined;
  const files = Object.keys(stored.specs);
  return { ...stored, sources: Object.fromEntries(Object.entries(stored.sources).map(([source, indexes]) => [source, indexes.map(position => files[position])])) };
}

export function loadTestMap(root: string): TestMap | undefined {
  try {
    return parseTestMap(readFileSync(join(root, TEST_MAP_PATH), 'utf8'));
  } catch {
    return undefined;
  }
}
