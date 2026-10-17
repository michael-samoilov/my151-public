import { getLocale, localeUppercase, t } from '@/i18n';

export type SlotHeading = 'ace' | 'partner' | 'signature';

const KEY = {
  ace: 'league.head.ace',
  partner: 'league.head.partner',
  signature: 'league.head.signature',
} as const;

export function headingLines(heading: SlotHeading): string[] {
  return localeUppercase(t(KEY[heading])).split('\n');
}

export function headingInline(heading: SlotHeading): string {
  const space = /^(ja|zh)/.test(getLocale()) ? '' : ' ';
  return headingLines(heading).reduce((line, next) => (line.endsWith('-') ? line + next : line + space + next));
}

export function headingTracks(): boolean {
  return !/^(ja|ko|zh)/.test(getLocale());
}
