import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const isLeaf = (value: unknown): boolean => value === null || typeof value !== 'object';
const entriesOf = (value: object): [string, unknown][] => Object.entries(value).filter(([, item]) => item !== undefined);

export function formatJson(value: unknown, indent = ''): string {
  if (isLeaf(value)) return JSON.stringify(value);
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    if (value.every(isLeaf)) return `[${value.map((item) => JSON.stringify(item)).join(', ')}]`;
    return `[\n${value.map((item) => `${inner}${formatJson(item, inner)}`).join(',\n')}\n${indent}]`;
  }
  const entries = entriesOf(value as object);
  if (!entries.length) return '{}';
  if (entries.every(([, item]) => isLeaf(item))) return `{ ${entries.map(([key, item]) => `${JSON.stringify(key)}: ${JSON.stringify(item)}`).join(', ')} }`;
  return `{\n${entries.map(([key, item]) => `${inner}${JSON.stringify(key)}: ${formatJson(item, inner)}`).join(',\n')}\n${indent}}`;
}

export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${formatJson(value)}\n`);
}

export function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}
