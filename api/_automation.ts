/** A beacon from an automated browser (`src/lib/automation.ts`). Every endpoint
 *  answers it like any other beacon and stores nothing. */
export function parseAutoFlag(v: unknown): boolean {
  return v === true;
}
