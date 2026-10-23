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

export function artistLinks(name: string): readonly string[] {
  return TERMS.artists[name]?.urls ?? [];
}

export function sourceTerms(id: string): readonly TermsQuote[] {
  return TERMS.sources[id]?.terms ?? [];
}

export function artistTerms(name: string): readonly TermsQuote[] {
  return TERMS.artists[name]?.terms ?? [];
}
