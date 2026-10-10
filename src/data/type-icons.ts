import type { TypeName } from '@/types/pokemon';

export const TYPE_ICONS = {
  "normal": {
    "source": "elginive",
    "mirroredHalf": null,
    "glyph": "/sprites/types/vector/normal-glyph.d2cbc8537229.svg",
    "icon": "/sprites/types/vector/normal-icon.9dd993c4867c.svg"
  },
  "fighting": {
    "source": "partywhale",
    "mirroredHalf": null,
    "glyph": "/sprites/types/vector/fighting-glyph.95a73350ecb4.svg",
    "icon": "/sprites/types/vector/fighting-icon.1829e05371e6.svg"
  },
  "flying": {
    "source": "elginive",
    "mirroredHalf": null,
    "glyph": "/sprites/types/vector/flying-glyph.fc55d9787c1a.svg",
    "icon": "/sprites/types/vector/flying-icon.0b158e8821c2.svg"
  },
  "poison": {
    "source": "elginive",
    "mirroredHalf": null,
    "glyph": "/sprites/types/vector/poison-glyph.210787c77aa1.svg",
    "icon": "/sprites/types/vector/poison-icon.a05236cc5be2.svg"
  },
  "ground": {
    "source": "elginive",
    "mirroredHalf": null,
    "glyph": "/sprites/types/vector/ground-glyph.c8702ff03496.svg",
    "icon": "/sprites/types/vector/ground-icon.ad57b84a8e48.svg"
  },
  "rock": {
    "source": "partywhale",
    "mirroredHalf": null,
    "glyph": "/sprites/types/vector/rock-glyph.06a3d652ef61.svg",
    "icon": "/sprites/types/vector/rock-icon.7d4495ccf41e.svg"
  },
  "bug": {
    "source": "partywhale",
    "mirroredHalf": "right",
    "glyph": "/sprites/types/vector/bug-glyph.254bdfcde4b1.svg",
    "icon": "/sprites/types/vector/bug-icon.523c17b32dee.svg"
  },
  "ghost": {
    "source": "elginive",
    "mirroredHalf": null,
    "glyph": "/sprites/types/vector/ghost-glyph.029151c94023.svg",
    "icon": "/sprites/types/vector/ghost-icon.d019fdc796f3.svg"
  },
  "steel": {
    "source": "elginive",
    "mirroredHalf": null,
    "glyph": "/sprites/types/vector/steel-glyph.102c85a078ec.svg",
    "icon": "/sprites/types/vector/steel-icon.c4b935cba30e.svg"
  },
  "fire": {
    "source": "elginive",
    "mirroredHalf": null,
    "glyph": "/sprites/types/vector/fire-glyph.7d97e29e501c.svg",
    "icon": "/sprites/types/vector/fire-icon.d2fbd27c39c4.svg"
  },
  "water": {
    "source": "partywhale",
    "mirroredHalf": "right",
    "glyph": "/sprites/types/vector/water-glyph.1e6ead0d5a74.svg",
    "icon": "/sprites/types/vector/water-icon.91c4544a1a5b.svg"
  },
  "grass": {
    "source": "elginive",
    "mirroredHalf": null,
    "glyph": "/sprites/types/vector/grass-glyph.81255c9e966a.svg",
    "icon": "/sprites/types/vector/grass-icon.0b97e305319b.svg"
  },
  "electric": {
    "source": "elginive",
    "mirroredHalf": null,
    "glyph": "/sprites/types/vector/electric-glyph.8df025787e6e.svg",
    "icon": "/sprites/types/vector/electric-icon.45b5b15e6170.svg"
  },
  "psychic": {
    "source": "partywhale",
    "mirroredHalf": "right",
    "glyph": "/sprites/types/vector/psychic-glyph.c6bdf486f719.svg",
    "icon": "/sprites/types/vector/psychic-icon.69c08e5f7f98.svg"
  },
  "ice": {
    "source": "elginive",
    "mirroredHalf": null,
    "glyph": "/sprites/types/vector/ice-glyph.6db594efdb1c.svg",
    "icon": "/sprites/types/vector/ice-icon.6f26626de382.svg"
  },
  "dragon": {
    "source": "elginive",
    "mirroredHalf": null,
    "glyph": "/sprites/types/vector/dragon-glyph.f69c8fa82d85.svg",
    "icon": "/sprites/types/vector/dragon-icon.ac8327cdf0db.svg"
  },
  "dark": {
    "source": "elginive",
    "mirroredHalf": null,
    "glyph": "/sprites/types/vector/dark-glyph.6e804d32f533.svg",
    "icon": "/sprites/types/vector/dark-icon.e8b4a8b5c2f7.svg"
  },
  "fairy": {
    "source": "elginive",
    "mirroredHalf": null,
    "glyph": "/sprites/types/vector/fairy-glyph.0987a7fc9a5a.svg",
    "icon": "/sprites/types/vector/fairy-icon.df06b601cede.svg"
  }
} as const satisfies Record<TypeName, {
  source: 'partywhale' | 'elginive';
  mirroredHalf: 'right' | null;
  icon: string;
  glyph: string;
}>;
