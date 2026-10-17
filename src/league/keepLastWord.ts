export const keepLastWord = (text: string) =>
  (text.trim().match(/\s+/g) ?? []).length >= 2 ? text.replace(/ (\S+)$/u, ' $1') : text;
