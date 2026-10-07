/** Keep each chart readable while retaining a centered reference and uniform zero-index extent. */
export function pickerIndexDomain(rows: readonly { deviation: number | null }[]): number {
  // Deviation uses percentage points. A zero index is -100%; clipping at that
  // bound keeps its bar at the same left edge in every category chart.
  return Math.min(100, Math.max(25, ...rows.map(row => Math.abs(row.deviation ?? 0))));
}
