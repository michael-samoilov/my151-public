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
  artists: Record<string, { urls?: string[]; terms?: TermsQuote[]; termsSource?: string; quoteUrl?: string; note?: string }>;
}

const TERMS = data as unknown as TermsFile;

/**
 * An artist's links, primary first: only pages the credits audit proved are
 * theirs (2026-10-13), never a Smogon member page, which asks a guest to log
 * in. An artist with no proven page has none.
 */
export function artistLinks(name: string): readonly string[] {
  return TERMS.artists[name]?.urls ?? [];
}

/** A source's quoted terms, by its panel entry id. */
export function sourceTerms(id: string): readonly TermsQuote[] {
  return TERMS.sources[id]?.terms ?? [];
}

const QUOTES = [...Object.values(TERMS.sources), ...Object.values(TERMS.artists)].flatMap((record) => record.terms ?? []);

/**
 * An artist's own quoted terms, or the entry id of the project whose terms
 * they share. An artist with no terms of their own whose record points at
 * another record's quote gets that quote: MyMarshlands has no terms, and Kyle
 * Dove's post asks to credit MyMarshlands for Victreebel.
 */
export function artistTerms(name: string): { quotes: readonly TermsQuote[]; sharedWith?: string } {
  const record = TERMS.artists[name];
  // The build reduces the note to `quoteUrl`; a script that reads the JSON as
  // it is finds the link in the note itself.
  const url = record?.quoteUrl ?? /https?:\/\/\S+/.exec(record?.note ?? '')?.[0];
  const pointed = url ? QUOTES.filter((quote) => quote.url === url).slice(0, 1) : [];
  return { quotes: record?.terms?.length ? record.terms : pointed, sharedWith: record?.termsSource };
}
