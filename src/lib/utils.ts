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

/** Abbreviate regional form suffixes for display: "yamask-galar" → "yamask-G" */
export function displayName(name: string): string {
  for (const [suffix, abbrev] of Object.entries(REGION_ABBREVS)) {
    if (name.endsWith(suffix)) {
      return name.slice(0, -suffix.length) + abbrev;
    }
  }
  return name;
}
