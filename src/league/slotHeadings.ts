import { getLocale, localeUppercase, t } from '@/i18n';

/**
 * The signature pane's three headings, as the live card and the export both
 * draw them: ACE POKÉMON over the ace, PARTNER / SHOULDERMON beside the
 * partner, and SIGNATURE POKÉMON over one Pokémon that fills both slots.
 *
 * Each reads the active locale when it is called, as the species names do,
 * so a component that draws one subscribes to the locale itself.
 */
export type SlotHeading = 'ace' | 'partner' | 'signature';

const KEY = {
  ace: 'league.head.ace',
  partner: 'league.head.partner',
  signature: 'league.head.signature',
} as const;

/** A heading's lines as drawn, in the card's capitals. The catalog breaks them with a newline. */
export function headingLines(heading: SlotHeading): string[] {
  return localeUppercase(t(KEY[heading])).split('\n');
}

/**
 * A heading set on one line. A line that ends in a hyphen runs on into the
 * next, as ASS- and POKÉMON make ASS-POKÉMON. Japanese and Chinese set no
 * space between words; every other script takes one.
 */
export function headingInline(heading: SlotHeading): string {
  const space = /^(ja|zh)/.test(getLocale()) ? '' : ' ';
  return headingLines(heading).reduce((line, next) => (line.endsWith('-') ? line + next : line + space + next));
}

/**
 * Whether the heading takes the card's tracking. The app's `:lang()` rule
 * in `index.css` sets Japanese, Korean and Chinese untracked, so the export
 * draws them untracked too.
 */
export function headingTracks(): boolean {
  return !/^(ja|ko|zh)/.test(getLocale());
}
