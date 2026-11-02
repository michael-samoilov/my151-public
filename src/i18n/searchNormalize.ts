export function normalizeSearch(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    // platform: Unicode classes the kana voicing marks U+3099 and U+309A as diacritics, so the strip covers only U+0300–U+036F.
    .replace(/[\u0300-\u036f]/g, '')
    .normalize('NFC')
    // platform: An IME commits hiragana first; each hiragana in U+3041–U+3096 sits exactly 0x60 below its katakana, and the range leaves ゛ ゜ ゝ ゞ ー unchanged.
    .replace(/[ぁ-ゖ]/g, (ch) => String.fromCodePoint(ch.codePointAt(0)! + 0x60))
    .trim();
}
