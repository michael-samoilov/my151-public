/**
 * The one normalizer both sides of the search index use.
 *
 * `scripts/i18n/build-name-catalogs.ts` runs every localized name through this
 * before writing it into the catalog, and the browser runs the query through
 * the same function before matching. If the two ever disagreed, a French user
 * typing `flabebe` would silently fail to find Flabébé — so they are one
 * function, imported by both, rather than two that look alike.
 *
 * NFKC first, so full-width Latin (`ＰＩＫＡ`, which a Japanese IME produces
 * without asking) folds to the half-width forms the catalog holds.
 *
 * Then Latin diacritics, and *only* Latin: the strip is scoped to
 * U+0300–U+036F rather than `\p{Diacritic}`, because the kana voicing marks
 * (U+3099/U+309A) are diacritics too. Removing those turns ピカチュウ into
 * ヒカチュウ and フシギダネ into フシキタネ — names no Japanese user would
 * ever type, silently unfindable. This function was written with the wrong
 * class first and the generated catalogs showed it immediately.
 */
export function normalizeSearch(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    // ß is a letter, not an accent, so no amount of decomposition touches it —
    // but `ss` is its accepted substitute and plenty of people type Furnifrass.
    // Applied to the query and the index alike, so both spellings match.
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .normalize('NFC')
    .trim();
}
