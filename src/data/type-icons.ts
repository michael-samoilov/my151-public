import type { TypeName } from '@/types/pokemon';

export const TYPE_ICONS = {
  "normal": {
    "source": "elginive",
    "mirroredHalf": null,
    "glyph": "/sprites/types/vector/normal-glyph.1239116d3beb.svg",
    "icon": "/sprites/types/vector/normal-icon.8947fbdae2d3.svg"
  },
  "fighting": {
    "source": "partywhale",
    "mirroredHalf": null,
    "glyph": "/sprites/types/vector/fighting-glyph.13c9a9a6ccb0.svg",
    "icon": "/sprites/types/vector/fighting-icon.18f4e19bfbd0.svg"
  },
  "flying": {
    "source": "elginive",
    "mirroredHalf": null,
    "glyph": "/sprites/types/vector/flying-glyph.e233576cb3ea.svg",
    "icon": "/sprites/types/vector/flying-icon.ef2dfbd8f14d.svg"
  },
  "poison": {
    "source": "elginive",
    "mirroredHalf": null,
    "glyph": "/sprites/types/vector/poison-glyph.e7bef0ce42bc.svg",
    "icon": "/sprites/types/vector/poison-icon.8dbd655776fd.svg"
  },
  "ground": {
    "source": "elginive",
    "mirroredHalf": null,
    "glyph": "/sprites/types/vector/ground-glyph.bcbb0babd141.svg",
    "icon": "/sprites/types/vector/ground-icon.989d2089367f.svg"
  },
  "rock": {
    "source": "partywhale",
    "mirroredHalf": null,
    "glyph": "/sprites/types/vector/rock-glyph.16dd8222f2b4.svg",
    "icon": "/sprites/types/vector/rock-icon.08bcfcfc0d72.svg"
  },
  "bug": {
    "source": "partywhale",
    "mirroredHalf": "right",
    "glyph": "/sprites/types/vector/bug-glyph.a179c22ce849.svg",
    "icon": "/sprites/types/vector/bug-icon.4d915961f3ae.svg"
  },
  "ghost": {
    "source": "elginive",
    "mirroredHalf": null,
    "glyph": "/sprites/types/vector/ghost-glyph.17a0a56c7ab5.svg",
    "icon": "/sprites/types/vector/ghost-icon.e90b3bfbee0a.svg"
  },
  "steel": {
    "source": "elginive",
    "mirroredHalf": null,
    "glyph": "/sprites/types/vector/steel-glyph.64c21dfdcb0c.svg",
    "icon": "/sprites/types/vector/steel-icon.46a5bec0fe39.svg"
  },
  "fire": {
    "source": "elginive",
    "mirroredHalf": null,
    "glyph": "/sprites/types/vector/fire-glyph.b1673fe662bf.svg",
    "icon": "/sprites/types/vector/fire-icon.cc27bf7e7868.svg"
  },
  "water": {
    "source": "partywhale",
    "mirroredHalf": "right",
    "glyph": "/sprites/types/vector/water-glyph.ffcc2126587f.svg",
    "icon": "/sprites/types/vector/water-icon.72039d8d19a1.svg"
  },
  "grass": {
    "source": "elginive",
    "mirroredHalf": null,
    "glyph": "/sprites/types/vector/grass-glyph.1519c795dd10.svg",
    "icon": "/sprites/types/vector/grass-icon.4f3d7b2f2b1d.svg"
  },
  "electric": {
    "source": "elginive",
    "mirroredHalf": null,
    "glyph": "/sprites/types/vector/electric-glyph.7c6d03dc4f11.svg",
    "icon": "/sprites/types/vector/electric-icon.37a55f17dfe1.svg"
  },
  "psychic": {
    "source": "partywhale",
    "mirroredHalf": "right",
    "glyph": "/sprites/types/vector/psychic-glyph.a80e2c5c8110.svg",
    "icon": "/sprites/types/vector/psychic-icon.e0a7f1421130.svg"
  },
  "ice": {
    "source": "elginive",
    "mirroredHalf": null,
    "glyph": "/sprites/types/vector/ice-glyph.d157849d7b73.svg",
    "icon": "/sprites/types/vector/ice-icon.23cc0cb7a607.svg"
  },
  "dragon": {
    "source": "elginive",
    "mirroredHalf": null,
    "glyph": "/sprites/types/vector/dragon-glyph.a92d799f30d4.svg",
    "icon": "/sprites/types/vector/dragon-icon.c2efaa843dde.svg"
  },
  "dark": {
    "source": "elginive",
    "mirroredHalf": null,
    "glyph": "/sprites/types/vector/dark-glyph.04207c247e36.svg",
    "icon": "/sprites/types/vector/dark-icon.67622dd9ef3d.svg"
  },
  "fairy": {
    "source": "elginive",
    "mirroredHalf": null,
    "glyph": "/sprites/types/vector/fairy-glyph.f58906c9ac38.svg",
    "icon": "/sprites/types/vector/fairy-icon.bfaaaafb2a23.svg"
  }
} as const satisfies Record<TypeName, {
  source: 'partywhale' | 'elginive';
  mirroredHalf: 'right' | null;
  icon: string;
  glyph: string;
}>;
