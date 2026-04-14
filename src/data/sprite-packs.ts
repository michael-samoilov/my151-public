export type SpritePack = 'pixel' | 'home' | 'official-art' | 'modern';

export const SPRITE_PACK_OPTIONS: { value: SpritePack; label: string; description: string }[] = [
  { value: 'pixel', label: 'Pixel Art', description: 'Classic pixel sprites' },
  { value: 'home', label: 'Home (3D)', description: 'Pokémon HOME renders' },
  { value: 'official-art', label: 'Official Art', description: 'Sugimori watercolors' },
  { value: 'modern', label: 'Modern', description: 'Latest game sprites' },
];

const CDN = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';

// "Modern" cascade: SV → BDSP → Home
// 140 Pokemon IDs available in BDSP but not SV
const MODERN_BDSP_IDS = new Set([
  10,11,12,13,14,15,16,17,18,19,20,21,22,29,30,
  31,32,33,34,41,42,46,47,63,64,65,66,67,68,77,
  78,83,95,98,99,104,105,108,114,115,118,119,120,121,122,
  124,127,138,139,140,141,142,165,166,169,175,176,177,178,201,
  202,208,213,222,223,224,226,238,241,251,263,264,265,266,267,
  268,269,276,277,290,291,292,293,294,295,300,301,303,304,305,
  306,309,310,315,318,319,320,321,327,337,338,343,344,345,346,
  347,348,351,352,359,360,363,364,365,366,367,368,369,399,400,
  406,407,412,413,414,420,421,427,428,431,432,439,441,451,452,
  455,458,463,465,468,
]);

// 166 Pokemon IDs not in SV or BDSP — fallback to Home
const MODERN_HOME_IDS = new Set([
  494,504,505,506,507,508,509,510,511,512,513,514,515,516,517,
  518,519,520,521,524,525,526,527,528,531,535,536,537,538,539,
  543,544,545,554,555,556,557,558,561,562,563,564,565,566,567,
  568,569,582,583,584,587,588,589,592,593,597,598,599,600,601,
  605,606,616,617,618,621,626,631,632,649,659,660,674,675,676,
  679,680,681,682,683,684,685,688,689,694,695,696,697,698,699,
  710,711,716,717,718,746,755,756,759,760,767,768,771,772,773,
  776,777,780,781,785,786,787,788,793,794,795,796,797,798,799,
  802,803,804,805,806,807,808,809,824,825,826,827,828,829,830,
  831,832,835,836,850,851,852,853,862,864,865,866,867,880,881,
  882,883,10091,10092,10115,10162,10163,10166,10168,10173,10174,10175,10176,10177,10178,
  10179,
]);

export function getSpriteUrl(id: number, pack: SpritePack, shiny = false): string {
  if (shiny) {
    switch (pack) {
      case 'pixel':
        return `/sprites/pokemon/shiny/${id}.png`;
      case 'home':
        return `${CDN}/other/home/shiny/${id}.png`;
      case 'official-art':
        return `${CDN}/other/official-artwork/shiny/${id}.png`;
      case 'modern':
        // Shiny modern: use Home shiny (complete coverage, consistent quality)
        return `${CDN}/other/home/shiny/${id}.png`;
    }
  }
  switch (pack) {
    case 'pixel':
      return `/sprites/pokemon/${id}.png`;
    case 'home':
      return `${CDN}/other/home/${id}.png`;
    case 'official-art':
      return `${CDN}/other/official-artwork/${id}.png`;
    case 'modern':
      if (MODERN_BDSP_IDS.has(id))
        return `${CDN}/versions/generation-viii/brilliant-diamond-shining-pearl/${id}.png`;
      if (MODERN_HOME_IDS.has(id))
        return `${CDN}/other/home/${id}.png`;
      // Default: SV sprite
      return `${CDN}/versions/generation-ix/scarlet-violet/${id}.png`;
  }
}

/** Whether a sprite pack uses pixel art (needs imageRendering: pixelated) */
export function isPixelPack(pack: SpritePack): boolean {
  return pack === 'pixel';
}
