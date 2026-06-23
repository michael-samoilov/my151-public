import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const REGION_ABBREVS: Record<string, string> = {
  '-alola': '-A',
  '-galar': '-G',
  '-hisui': '-H',
  '-paldea': '-P',
};

const FORM_DISPLAY_NAMES: Record<string, string> = {
  'urshifu-rapid-strike': 'urshifu-water',
  'alcremie-berry': 'alcremie-berry',
  'alcremie-love': 'alcremie-love',
  'alcremie-star': 'alcremie-star',
  'alcremie-clover': 'alcremie-clovr',
  'alcremie-flower': 'alcremie-flowr',
  'alcremie-ribbon': 'alcremie-ribbn',
};

/** Abbreviate regional form suffixes for display: "yamask-galar" → "yamask-G", "tauros-paldea-combat" → "tauros-P-combat" */
export function displayName(name: string): string {
  if (FORM_DISPLAY_NAMES[name]) return FORM_DISPLAY_NAMES[name];
  for (const [suffix, abbrev] of Object.entries(REGION_ABBREVS)) {
    if (name.endsWith(suffix)) {
      return name.slice(0, -suffix.length) + abbrev;
    }
    // Handle infix forms like "tauros-paldea-combat" → "tauros-P-combat"
    const infix = suffix + '-';
    const idx = name.indexOf(infix);
    if (idx >= 0) {
      return name.slice(0, idx) + abbrev + '-' + name.slice(idx + infix.length);
    }
  }
  return name;
}
