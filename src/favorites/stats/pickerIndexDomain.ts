export function pickerIndexDomain(rows: readonly { deviation: number | null }[]): number {
  return Math.min(100, Math.max(25, ...rows.map(row => Math.abs(row.deviation ?? 0))));
}
