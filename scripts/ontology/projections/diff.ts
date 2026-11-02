export function differingFields<T extends object>(row: T, base: T, skip: readonly string[]): Partial<T> {
  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (skip.includes(key)) continue;
    if (JSON.stringify(value) !== JSON.stringify((base as Record<string, unknown>)[key])) fields[key] = value;
  }
  return fields as Partial<T>;
}
