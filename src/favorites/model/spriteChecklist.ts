import { PRODUCTION_DEPLOY } from '@/lib/demoMode';

export const SPRITE_CHECK_ENABLED = !PRODUCTION_DEPLOY && typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('spritecheck') === '1';

export type SpriteCandidate = {
  label: string;
  sprite: string;
  source: string;
  note: string;
};

export type SpriteReview = {
  key: string;
  name: string;
  placement: string;
  status: 'needs-art' | 'needs-choice' | 'needs-identity' | 'candidate-found';
  note: string;
  search: string;
  currentId?: number;
  interpretations?: string[];
  candidates: SpriteCandidate[];
};

export const SPRITE_REVIEWS: SpriteReview[] = [
  {
    "key": "mega-sceptile",
    "name": "Mega Sceptile",
    "placement": "Existing picker sprite",
    "status": "candidate-found",
    "note": "Compare at picker size before replacing. Shared with the league builder.",
    "search": "Mega Sceptile Gen 5 sprite pixel art non-shiny",
    "currentId": 10065,
    "candidates": [
      {
        "label": "Source candidate",
        "sprite": "/sprites/favorite-review/src-sprites-gen5-ssceptile-omega-picker.png",
        "source": "https://github.com/smogon/sprites/blob/bad55c7b7e7292f459366505460d41dcab08d4cd/src/sprites/gen5/ssceptile-omega.png",
        "note": "Different pose; source cropped canvas is centered without resampling."
      }
    ]
  },
  {
    "key": "gmax-blastoise",
    "name": "Gigantamax Blastoise",
    "placement": "Existing picker sprite",
    "status": "candidate-found",
    "note": "Compare at picker size before replacing. Shared with the league builder.",
    "search": "Gigantamax Blastoise Gen 5 sprite pixel art non-shiny",
    "currentId": 10197,
    "candidates": [
      {
        "label": "Source candidate",
        "sprite": "/sprites/favorite-review/src-sprites-gen5-sblastoise-g-picker.png",
        "source": "https://github.com/smogon/sprites/blob/bad55c7b7e7292f459366505460d41dcab08d4cd/src/sprites/gen5/sblastoise-g.png",
        "note": "Different pose; source cropped canvas is centered without resampling."
      }
    ]
  },
  {
    "key": "terapagos-stellar",
    "name": "Terapagos Stellar Form",
    "placement": "Existing picker sprite",
    "status": "candidate-found",
    "note": "Compare at picker size before replacing. Picker form.",
    "search": "Terapagos Stellar Form Gen 5 sprite pixel art non-shiny",
    "currentId": 10277,
    "candidates": [
      {
        "label": "Source candidate",
        "sprite": "/sprites/favorite-review/src-sprites-gen5-sterapagos-ostellar-picker.png",
        "source": "https://github.com/smogon/sprites/blob/bad55c7b7e7292f459366505460d41dcab08d4cd/src/sprites/gen5/sterapagos-ostellar.png",
        "note": "Same visible art as current. This is not a distinct replacement."
      }
    ]
  },
  {
    "key": "reshiram-overdrive",
    "name": "Reshiram Overdrive",
    "placement": "Gen 5 legendary",
    "status": "needs-art",
    "note": "No separately named matching sprite verified. The regular Reshiram sprite is already present.",
    "search": "Reshiram Overdrive Gen 5 front sprite pixel art non-shiny",
    "candidates": []
  },
  {
    "key": "zekrom-overdrive",
    "name": "Zekrom Overdrive",
    "placement": "Gen 5 legendary",
    "status": "needs-art",
    "note": "No separately named matching sprite verified. The regular Zekrom sprite is already present.",
    "search": "Zekrom Overdrive Gen 5 front sprite pixel art non-shiny",
    "candidates": []
  },
  {
    "key": "primal-dialga",
    "name": "Primal Dialga",
    "placement": "Gen 4 legendary",
    "status": "needs-art",
    "note": "No matching sprite verified. Keep separate from Origin Dialga.",
    "search": "Primal Dialga Pokémon Mystery Dungeon Explorers Gen 5 front sprite pixel art non-shiny",
    "candidates": []
  },
  {
    "key": "shadow-lugia-xd001",
    "name": "Shadow Lugia (XD001)",
    "placement": "Gen 3 legendary",
    "status": "needs-art",
    "note": "No matching Gen 5-style front sprite verified.",
    "search": "Shadow Lugia (XD001) Gen 5 front sprite pixel art non-shiny",
    "candidates": []
  },
  {
    "key": "meta-groudon-jirachi-wish-maker",
    "name": "Meta Groudon (Jirachi: Wish Maker)",
    "placement": "Gen 3 legendary",
    "status": "needs-art",
    "note": "No matching sprite verified; do not confuse with Primal Groudon.",
    "search": "Meta Groudon (Jirachi: Wish Maker) Gen 5 front sprite pixel art non-shiny",
    "candidates": []
  },
  {
    "key": "shadow-mewtwo",
    "name": "Shadow Mewtwo",
    "placement": "Mewtwo's Gen 1 legendary family",
    "status": "needs-art",
    "note": "No matching sprite verified. Identify the specific Shadow Mewtwo design before adding.",
    "search": "Shadow Mewtwo Gen 5 front sprite pixel art non-shiny",
    "candidates": []
  },
  {
    "key": "armored-mewtwo",
    "name": "Armored Mewtwo",
    "placement": "Mewtwo's Gen 1 legendary family",
    "status": "needs-art",
    "note": "No matching sprite verified.",
    "search": "Armored Mewtwo Gen 5 front sprite pixel art non-shiny",
    "candidates": []
  },
  {
    "key": "zygarde-cell",
    "name": "Zygarde Cell",
    "placement": "Gen 6 Zygarde family",
    "status": "needs-art",
    "note": "No matching battle-style sprite verified.",
    "search": "Zygarde Cell Gen 5 front sprite pixel art non-shiny",
    "candidates": []
  },
  {
    "key": "zygarde-core",
    "name": "Zygarde Core",
    "placement": "Gen 6 Zygarde family",
    "status": "needs-art",
    "note": "No matching battle-style sprite verified.",
    "search": "Zygarde Core Gen 5 front sprite pixel art non-shiny",
    "candidates": []
  },
  {
    "key": "ogerpon-terastal-mask-variants",
    "name": "Ogerpon Terastal mask variants",
    "placement": "Gen 9 legendary / gimmick",
    "status": "candidate-found",
    "note": "Four front sprites found in the current Smogon Gen 5 source. Previously rejected art was not accepted; review these candidates separately.",
    "search": "Ogerpon Terastal mask variants Gen 5 front sprite pixel art non-shiny",
    "candidates": [
      {
        "label": "Cornerstone mask",
        "sprite": "/sprites/favorite-review/src-sprites-gen5-sogerpon-ocornerstone_tera-picker.png",
        "source": "https://github.com/smogon/sprites/blob/bad55c7b7e7292f459366505460d41dcab08d4cd/src/sprites/gen5/sogerpon-ocornerstone_tera.png",
        "note": "Gen 5 source. Review only."
      },
      {
        "label": "Hearthflame mask",
        "sprite": "/sprites/favorite-review/src-sprites-gen5-sogerpon-ohearthflame_tera-picker.png",
        "source": "https://github.com/smogon/sprites/blob/bad55c7b7e7292f459366505460d41dcab08d4cd/src/sprites/gen5/sogerpon-ohearthflame_tera.png",
        "note": "Gen 5 source. Review only."
      },
      {
        "label": "Teal mask",
        "sprite": "/sprites/favorite-review/src-sprites-gen5-sogerpon-oteal_tera-picker.png",
        "source": "https://github.com/smogon/sprites/blob/bad55c7b7e7292f459366505460d41dcab08d4cd/src/sprites/gen5/sogerpon-oteal_tera.png",
        "note": "Gen 5 source. Review only."
      },
      {
        "label": "Wellspring mask",
        "sprite": "/sprites/favorite-review/src-sprites-gen5-sogerpon-owellspring_tera-picker.png",
        "source": "https://github.com/smogon/sprites/blob/bad55c7b7e7292f459366505460d41dcab08d4cd/src/sprites/gen5/sogerpon-owellspring_tera.png",
        "note": "Gen 5 source. Review only."
      }
    ]
  },
  {
    "key": "koraidon-limited-build",
    "name": "Koraidon Limited Build",
    "placement": "Gen 9 Koraidon family",
    "status": "needs-art",
    "note": "No distinct matching sprite verified.",
    "search": "Koraidon Limited Build Gen 5 front sprite pixel art non-shiny",
    "candidates": []
  },
  {
    "key": "miraidon-low-power-mode",
    "name": "Miraidon Low-Power Mode",
    "placement": "Gen 9 Miraidon family",
    "status": "needs-art",
    "note": "No distinct matching sprite verified.",
    "search": "Miraidon Low-Power Mode Gen 5 front sprite pixel art non-shiny",
    "candidates": []
  },
  {
    "key": "purple-kecleon-mystery-dungeon",
    "name": "Purple Kecleon (Mystery Dungeon)",
    "placement": "Gen 3 Kecleon family",
    "status": "needs-art",
    "note": "No matching Gen 5-style front sprite verified.",
    "search": "Purple Kecleon (Mystery Dungeon) Gen 5 front sprite pixel art non-shiny",
    "candidates": []
  },
  {
    "key": "ukulele-pichu",
    "name": "Ukulele Pichu",
    "placement": "Gen 4 Pichu family",
    "status": "needs-art",
    "note": "Confirmed 2026-09-30. Pokémon Ranger: Guardian Signs Ukulele Pichu. No distinct Gen 5 front sprite found in the searched source.",
    "search": "Ukulele Pichu Pokémon Ranger Guardian Signs Gen 5 front sprite pixel art non-shiny",
    "candidates": []
  },
  {
    "key": "mega-darkrai-eye-form",
    "name": "Mega Darkrai eye form",
    "placement": "Gen 4 Darkrai gimmick family",
    "status": "needs-art",
    "note": "The existing Mega Darkrai sprite is present; no distinct matching eye-form sprite verified.",
    "search": "Mega Darkrai eye form Gen 5 front sprite pixel art non-shiny",
    "candidates": []
  },
  {
    "key": "kyurem-black-overdrive",
    "name": "Kyurem Black Overdrive",
    "placement": "Gen 5 Kyurem family",
    "status": "needs-art",
    "note": "No distinct matching sprite verified.",
    "search": "Kyurem Black Overdrive Gen 5 front sprite pixel art non-shiny",
    "candidates": []
  },
  {
    "key": "kyurem-white-overdrive",
    "name": "Kyurem White Overdrive",
    "placement": "Gen 5 Kyurem family",
    "status": "needs-art",
    "note": "No distinct matching sprite verified.",
    "search": "Kyurem White Overdrive Gen 5 front sprite pixel art non-shiny",
    "candidates": []
  },
  {
    "key": "furfrou-dandy",
    "name": "Furfrou Dandy Trim",
    "placement": "Gen 6 Furfrou family",
    "status": "needs-art",
    "note": "Available trim files were rejected after visual review: they do not consistently match the app's Gen 5-style pixel art. None are selectable.",
    "search": "Furfrou Dandy Trim Gen 5 front sprite pixel art non-shiny",
    "candidates": []
  },
  {
    "key": "furfrou-debutante",
    "name": "Furfrou Debutante Trim",
    "placement": "Gen 6 Furfrou family",
    "status": "needs-art",
    "note": "Available trim files were rejected after visual review: they do not consistently match the app's Gen 5-style pixel art. None are selectable.",
    "search": "Furfrou Debutante Trim Gen 5 front sprite pixel art non-shiny",
    "candidates": []
  },
  {
    "key": "furfrou-diamond",
    "name": "Furfrou Diamond Trim",
    "placement": "Gen 6 Furfrou family",
    "status": "needs-art",
    "note": "Available trim files were rejected after visual review: they do not consistently match the app's Gen 5-style pixel art. None are selectable.",
    "search": "Furfrou Diamond Trim Gen 5 front sprite pixel art non-shiny",
    "candidates": []
  },
  {
    "key": "furfrou-heart",
    "name": "Furfrou Heart Trim",
    "placement": "Gen 6 Furfrou family",
    "status": "needs-art",
    "note": "Available trim files were rejected after visual review: they do not consistently match the app's Gen 5-style pixel art. None are selectable.",
    "search": "Furfrou Heart Trim Gen 5 front sprite pixel art non-shiny",
    "candidates": []
  },
  {
    "key": "furfrou-kabuki",
    "name": "Furfrou Kabuki Trim",
    "placement": "Gen 6 Furfrou family",
    "status": "needs-art",
    "note": "Available trim files were rejected after visual review: they do not consistently match the app's Gen 5-style pixel art. None are selectable.",
    "search": "Furfrou Kabuki Trim Gen 5 front sprite pixel art non-shiny",
    "candidates": []
  },
  {
    "key": "furfrou-la-reine",
    "name": "Furfrou La Reine Trim",
    "placement": "Gen 6 Furfrou family",
    "status": "needs-art",
    "note": "Available trim files were rejected after visual review: they do not consistently match the app's Gen 5-style pixel art. None are selectable.",
    "search": "Furfrou La Reine Trim Gen 5 front sprite pixel art non-shiny",
    "candidates": []
  },
  {
    "key": "furfrou-matron",
    "name": "Furfrou Matron Trim",
    "placement": "Gen 6 Furfrou family",
    "status": "needs-art",
    "note": "Available trim files were rejected after visual review: they do not consistently match the app's Gen 5-style pixel art. None are selectable.",
    "search": "Furfrou Matron Trim Gen 5 front sprite pixel art non-shiny",
    "candidates": []
  },
  {
    "key": "furfrou-pharaoh",
    "name": "Furfrou Pharaoh Trim",
    "placement": "Gen 6 Furfrou family",
    "status": "needs-art",
    "note": "Available trim files were rejected after visual review: they do not consistently match the app's Gen 5-style pixel art. None are selectable.",
    "search": "Furfrou Pharaoh Trim Gen 5 front sprite pixel art non-shiny",
    "candidates": []
  },
  {
    "key": "furfrou-star",
    "name": "Furfrou Star Trim",
    "placement": "Gen 6 Furfrou family",
    "status": "needs-art",
    "note": "Available trim files were rejected after visual review: they do not consistently match the app's Gen 5-style pixel art. None are selectable.",
    "search": "Furfrou Star Trim Gen 5 front sprite pixel art non-shiny",
    "candidates": []
  },
  {
    "key": "marshadow-zenith",
    "name": "Marshadow Zenith",
    "placement": "Gen 7 Marshadow family",
    "status": "needs-art",
    "note": "No distinct matching sprite verified.",
    "search": "Marshadow Zenith Gen 5 front sprite pixel art non-shiny",
    "candidates": []
  },
  {
    "key": "pecharunt-shell",
    "name": "Pecharunt Shell",
    "placement": "Gen 9 Pecharunt family",
    "status": "needs-art",
    "note": "No distinct matching sprite verified.",
    "search": "Pecharunt Shell Gen 5 front sprite pixel art non-shiny",
    "candidates": []
  },
  {
    "key": "standing-gholdengo",
    "name": "Gholdengo without surfboard",
    "placement": "Gen 9 Gholdengo family",
    "status": "needs-art",
    "note": "Confirmed 2026-09-30. Ordinary Gholdengo standing without its board. Current Gen 5 art is surfing; do not register a new Pokémon form.",
    "search": "Gholdengo standing no surfboard Gen 5 front sprite pixel art non-shiny",
    "candidates": [
      {
        "label": "Pose reference",
        "sprite": "/sprites/favorite-review/src-gen9species-sgholdengo.png",
        "source": "https://github.com/smogon/sprites/blob/bad55c7b7e7292f459366505460d41dcab08d4cd/src/gen9species/sgholdengo.png",
        "note": "Standing pose found, but this smooth art fails the Gen 5 pixel-art requirement. Do not use as replacement."
      }
    ],
    "currentId": 1000
  },
  {
    "key": "solgaleo-radiant-sun-phase",
    "name": "Solgaleo Radiant Sun phase",
    "placement": "Gen 7 legendary",
    "status": "needs-art",
    "note": "Requested 2026-09-30. No distinct Gen 5 front sprite found in the searched Smogon source.",
    "search": "Solgaleo Radiant Sun phase Gen 5 front sprite pixel art non-shiny",
    "candidates": []
  },
  {
    "key": "lunala-full-moon-phase",
    "name": "Lunala Full Moon phase",
    "placement": "Gen 7 legendary",
    "status": "needs-art",
    "note": "Requested 2026-09-30. No distinct Gen 5 front sprite found in the searched Smogon source.",
    "search": "Lunala Full Moon phase Gen 5 front sprite pixel art non-shiny",
    "candidates": []
  },
  {
    "key": "koraidon-sprinting-build",
    "name": "Koraidon Sprinting Build",
    "placement": "Gen 9 Koraidon family",
    "status": "needs-art",
    "note": "Ride form requested 2026-09-30. No distinct Gen 5 front sprite found in the searched source.",
    "search": "Koraidon Sprinting Build ride bicycle Gen 5 front sprite pixel art non-shiny",
    "candidates": []
  },
  {
    "key": "koraidon-swimming-build",
    "name": "Koraidon Swimming Build",
    "placement": "Gen 9 Koraidon family",
    "status": "needs-art",
    "note": "Ride form requested 2026-09-30. No distinct Gen 5 front sprite found in the searched source.",
    "search": "Koraidon Swimming Build ride bicycle Gen 5 front sprite pixel art non-shiny",
    "candidates": []
  },
  {
    "key": "koraidon-gliding-build",
    "name": "Koraidon Gliding Build",
    "placement": "Gen 9 Koraidon family",
    "status": "needs-art",
    "note": "Ride form requested 2026-09-30. No distinct Gen 5 front sprite found in the searched source.",
    "search": "Koraidon Gliding Build ride bicycle Gen 5 front sprite pixel art non-shiny",
    "candidates": []
  },
  {
    "key": "miraidon-drive-mode",
    "name": "Miraidon Drive Mode",
    "placement": "Gen 9 Miraidon family",
    "status": "needs-art",
    "note": "Ride form requested 2026-09-30. No distinct Gen 5 front sprite found in the searched source.",
    "search": "Miraidon Drive Mode ride bicycle Gen 5 front sprite pixel art non-shiny",
    "candidates": []
  },
  {
    "key": "miraidon-aquatic-mode",
    "name": "Miraidon Aquatic Mode",
    "placement": "Gen 9 Miraidon family",
    "status": "needs-art",
    "note": "Ride form requested 2026-09-30. No distinct Gen 5 front sprite found in the searched source.",
    "search": "Miraidon Aquatic Mode ride bicycle Gen 5 front sprite pixel art non-shiny",
    "candidates": []
  },
  {
    "key": "miraidon-glide-mode",
    "name": "Miraidon Glide Mode",
    "placement": "Gen 9 Miraidon family",
    "status": "needs-art",
    "note": "Ride form requested 2026-09-30. No distinct Gen 5 front sprite found in the searched source.",
    "search": "Miraidon Glide Mode ride bicycle Gen 5 front sprite pixel art non-shiny",
    "candidates": []
  }
];
