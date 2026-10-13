/**
 * The terms each credited source and artist states, quoted verbatim from
 * the page each quote links to (`creditTerms.json`, from the credits
 * research of 2026-10-13). Every terms line the Acknowledgements panel
 * shows comes from here; nothing in the panel paraphrases a source's terms.
 *
 * The panel shows a bundle's terms, and an artist's only when the app took
 * the artist's sprites from them directly (docs/credits/README.md). The other
 * artist records stay in the file as evidence; the build does not ship them.
 */
import data from './creditTerms.json';

export interface TermsQuote {
  text: string;
  url: string;
}

interface TermsFile {
  sources: Record<string, { terms: TermsQuote[] }>;
  artists: Record<string, { urls?: string[]; terms?: TermsQuote[] }>;
}

const TERMS = data as unknown as TermsFile;

/**
 * An artist's links, primary first: only pages the credits audit proved are
 * theirs (2026-10-13), never a Smogon member page, which asks a guest to log
 * in.
 */
export function artistLinks(name: string): readonly string[] {
  return TERMS.artists[name]?.urls ?? [];
}

/** A source's quoted terms, by its panel entry id. */
export function sourceTerms(id: string): readonly TermsQuote[] {
  return TERMS.sources[id]?.terms ?? [];
}

/** An artist's own quoted terms. */
export function artistTerms(name: string): readonly TermsQuote[] {
  return TERMS.artists[name]?.terms ?? [];
}
