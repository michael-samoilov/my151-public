/**
 * The last space does not break, so "Pick a / move" never strands the noun
 * and "Lame de / Roc" becomes "Lame / de Roc". A two-word phrase keeps its one
 * break: German "Attacke wählen" would otherwise run past the slot's edge as
 * one unbreakable word.
 */
export const keepLastWord = (text: string) =>
  (text.trim().match(/\s+/g) ?? []).length >= 2 ? text.replace(/ (\S+)$/u, ' $1') : text;
