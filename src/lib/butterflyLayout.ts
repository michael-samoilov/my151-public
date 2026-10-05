/** A shared identifier rail keeps all count and index axes aligned at the same chart width. */
export function butterflyColumns(width: number, scale = 1, hideDeviation = false, signedCount = false) {
  const identifierWidth = Math.min(96 * scale, width * .3);
  const countStart = identifierWidth + 6;
  const gutter = 8;
  const available = Math.max(0, width - countStart - (hideDeviation ? 0 : gutter));
  const countWidth = hideDeviation ? available : Math.floor(available * (signedCount ? .5 : 1 / 3));
  const indexWidth = hideDeviation ? 0 : available - countWidth;
  const indexStart = countStart + countWidth + gutter;
  return { identifierWidth, countStart, countWidth, indexWidth, indexStart };
}
