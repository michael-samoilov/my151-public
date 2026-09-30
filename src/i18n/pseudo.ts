import type { Messages } from './types';

/**
 * Pseudo-locales: machine-mangled English used to shake out layout and
 * extraction bugs *before* any real translation exists.
 *
 * They are generated from `en` at runtime, so they can never drift from the
 * source catalog the way a checked-in fixture would, and they cost nothing to
 * maintain when strings change.
 *
 * `en-XA` earns its keep three times over. Every character is accented, so any
 * text still rendering in plain ASCII is a **string that was never extracted** —
 * visible at a glance, with no tooling. The text is padded to 1.4× to
 * approximate German, the worst Latin expansion case. And it is wrapped in
 * brackets, so a missing `]` means the label was **clipped** rather than merely
 * wide.
 *
 * `en-XC` swaps Latin for full-width CJK filler, which catches the different
 * failure: double-advance glyphs, taller vertical metrics, and layouts that
 * assumed text can wrap at spaces.
 *
 * Neither is a supported `Locale` — they are reachable only via `?lang=en-XA`
 * under PREVIEW_FEATURES, and are never offered in the picker.
 */

export { PSEUDO_LOCALES, isPseudoLocale } from './pseudoLocale';
export type { PseudoLocale } from './pseudoLocale';
import type { PseudoLocale } from './pseudoLocale';

const ACCENTS: Record<string, string> = {
  a: 'á', b: 'ƀ', c: 'ç', d: 'đ', e: 'é', f: 'ƒ', g: 'ġ', h: 'ĥ', i: 'í',
  j: 'ĵ', k: 'ķ', l: 'ł', m: 'ɱ', n: 'ñ', o: 'ó', p: 'ƥ', q: 'ɋ', r: 'ř',
  s: 'ş', t: 'ţ', u: 'ú', v: 'ṽ', w: 'ŵ', x: 'ẋ', y: 'ý', z: 'ž',
  A: 'Á', B: 'Ɓ', C: 'Ç', D: 'Đ', E: 'É', F: 'Ƒ', G: 'Ġ', H: 'Ĥ', I: 'Í',
  J: 'Ĵ', K: 'Ķ', L: 'Ł', M: 'Ṁ', N: 'Ñ', O: 'Ó', P: 'Ƥ', Q: 'Ɋ', R: 'Ř',
  S: 'Ş', T: 'Ţ', U: 'Ú', V: 'Ṽ', W: 'Ŵ', X: 'Ẋ', Y: 'Ý', Z: 'Ž',
};

/** Expansion factor. German runs ~35% longer than English for short UI copy. */
const EXPANSION = 1.4;
const PAD = '·';

/** Full-width filler. Real CJK, so the font stack is exercised too. */
const CJK_FILLER = '測試字串本地化寬度檢查';
/** A CJK glyph is roughly twice a Latin advance, so use ~half as many. */
const CJK_RATIO = 0.55;

/**
 * Split a message into placeholder and literal parts. Placeholders must survive
 * both transforms untouched — mangling `{count}` would make the pseudo-locale
 * fail for a reason that has nothing to do with layout.
 */
function parts(template: string): { text: string; placeholder: boolean }[] {
  const out: { text: string; placeholder: boolean }[] = [];
  const re = /\{\w+\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template)) !== null) {
    if (m.index > last) out.push({ text: template.slice(last, m.index), placeholder: false });
    out.push({ text: m[0], placeholder: true });
    last = m.index + m[0].length;
  }
  if (last < template.length) out.push({ text: template.slice(last), placeholder: false });
  return out;
}

export function accentuate(template: string): string {
  const segments = parts(template);
  const body = segments
    .map((s) => (s.placeholder ? s.text : [...s.text].map((c) => ACCENTS[c] ?? c).join('')))
    .join('');

  // Pad by the literal length only — inflating around a placeholder would say
  // more about the placeholder name than about the copy.
  const literalLength = segments
    .filter((s) => !s.placeholder)
    .reduce((n, s) => n + s.text.length, 0);
  const padding = Math.max(0, Math.round(literalLength * (EXPANSION - 1)));

  return `[${body}${PAD.repeat(padding)}]`;
}

export function widen(template: string): string {
  return parts(template)
    .map((s) => {
      if (s.placeholder) return s.text;
      const count = Math.max(1, Math.round(s.text.trim().length * CJK_RATIO));
      return s.text.trim() ? CJK_FILLER.repeat(Math.ceil(count / CJK_FILLER.length)).slice(0, count) : s.text;
    })
    .join('');
}

export function buildPseudoCatalog(which: PseudoLocale, source: Messages): Messages {
  const transform = which === 'en-XA' ? accentuate : widen;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) out[key] = transform(value);
  return out as Messages;
}
