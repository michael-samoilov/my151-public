/**
 * The terms each credited source and artist states, quoted verbatim from
 * the page each quote links to (`creditTerms.json`, from the credits
 * research of 2026-10-13). Every terms line the Acknowledgements panel
 * shows comes from here; nothing in the panel paraphrases a source's terms.
 *
 * A Smogon spriter with no page of their own shares the project's terms,
 * so their record names the project (`termsSource`) instead of repeating them.
 */
import data from './creditTerms.json';

export interface TermsQuote {
  text: string;
  url: string;
}

interface TermsFile {
  sources: Record<string, { terms: TermsQuote[] }>;
  artists: Record<string, { terms?: TermsQuote[]; termsSource?: string }>;
}

const TERMS = data as unknown as TermsFile;

/** A source's quoted terms, by its panel entry id. */
export function sourceTerms(id: string): readonly TermsQuote[] {
  return TERMS.sources[id]?.terms ?? [];
}

/** An artist's own quoted terms, or the entry id of the project whose terms they share. */
export function artistTerms(name: string): { quotes: readonly TermsQuote[]; sharedWith?: string } {
  const record = TERMS.artists[name];
  return { quotes: record?.terms ?? [], sharedWith: record?.termsSource };
}
