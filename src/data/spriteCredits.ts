/**
 * Who drew each sprite the app shows, for the sprite lists in the footer's
 * Acknowledgements panel.
 *
 * The app serves PokéAPI's front sprites, and PokéAPI's sprites come from
 * one artist per era, so the game a Pokémon or form debuted in names its
 * source:
 *
 * - Red and Blue to Black 2 and White 2: Game Freak's own sprites.
 * - X and Y to Legends: Arceus: the Smogon Sprite Project.
 * - Scarlet and Violet: KingOfThe-X-Roads.
 * - Legends: Z-A Megas: Kyle Dove.
 *
 * A swapped sprite overrides the rule. `spriteSources.json` maps the file
 * name a sprite is served under to its source, and
 * `scripts/check-sprite-revisions.mjs` fails when a sprite is added or
 * replaced without a row there.
 */
import overrides from './spriteSources.json';
import altFormSpecies from '@/i18n/alt-form-species.json';
import { allPickerMons, comparePickerOrder, pickerNameId, type PickerMon } from '@/favorites/model/catalog';
import { DEBUT_GAMES, debutGame } from '@/favorites/model/debut';
import { SPRITE_CREDIT_IDS } from './acknowledgements';

/**
 * Every source a sprite can have. Game Freak's own sprites and my151's own
 * drawings (the sprite lab's) have no entry in the panel; every other source
 * does.
 */
export const SPRITE_SOURCES = ['game-freak', 'my151', ...SPRITE_CREDIT_IDS] as const;
export type SpriteSourceId = (typeof SPRITE_SOURCES)[number];

const isSource = (id: string): id is SpriteSourceId => (SPRITE_SOURCES as readonly string[]).includes(id);

const OVERRIDES = new Map(Object.entries(overrides).map(([file, source]) => {
  if (!isSource(source)) throw new Error(`spriteSources.json: ${file} names an unknown source, "${source}".`);
  return [file, source] as const;
}));

const LAST_GAME_FREAK_GAME = DEBUT_GAMES.indexOf('B2W2');

function ruleSource(mon: PickerMon): SpriteSourceId {
  const game = debutGame(mon);
  if (game === 'PLZA') return 'kyle-dove';
  if (game === 'SV') return 'kingofthe-x-roads';
  return DEBUT_GAMES.indexOf(game) <= LAST_GAME_FREAK_GAME ? 'game-freak' : 'smogon-sprite-project';
}

/** The file name a sprite is served under, without `.png` and the `?v=` revision. */
const spriteFile = (sprite: string) => sprite.replace(/^.*\/|\.png(\?.*)?$/g, '');

export function spriteSourceOf(mon: PickerMon): SpriteSourceId {
  return OVERRIDES.get(spriteFile(mon.sprite)) ?? ruleSource(mon);
}

const ALT_FORM_SPECIES = altFormSpecies as Record<string, number>;
const speciesOf = (id: number): number => (id <= 1025 ? id : ALT_FORM_SPECIES[id] ?? 0);
const GENERATION_STARTS = [1, 152, 252, 387, 494, 650, 722, 810, 906];

export interface SpriteGeneration {
  /** The generation that introduced the Pokémon's species: 1 to 9. */
  generation: number;
  mons: PickerMon[];
}

let bySource: Map<SpriteSourceId, SpriteGeneration[]> | undefined;

function groupAll(): Map<SpriteSourceId, SpriteGeneration[]> {
  const credited = allPickerMons()
    .map((mon) => ({ mon, source: spriteSourceOf(mon), species: speciesOf(pickerNameId(mon)) || speciesOf(mon.ownerId) }))
    .sort((a, b) => a.species - b.species || comparePickerOrder(a.mon, b.mon));
  const groups = new Map<SpriteSourceId, SpriteGeneration[]>();
  for (const { mon, source, species } of credited) {
    const generation = GENERATION_STARTS.findLastIndex((start) => species >= start) + 1;
    const list = groups.get(source) ?? [];
    groups.set(source, list);
    const last = list.at(-1);
    if (last?.generation === generation) last.mons.push(mon);
    else list.push({ generation, mons: [mon] });
  }
  return groups;
}

/** The sprites from one source, grouped by their species' generation, in national dex order. */
export function spritesBySource(source: SpriteSourceId): readonly SpriteGeneration[] {
  bySource ??= groupAll();
  return bySource.get(source) ?? [];
}
