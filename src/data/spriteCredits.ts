/**
 * The sprites my151 chose one by one, for the sprite lists in the footer's
 * Acknowledgements panel.
 *
 * Most sprites come in bulk: PokéAPI's front sprites, drawn by Game Freak,
 * the Smogon Sprite Project, KingOfThe-X-Roads and Kyle Dove. Their entries
 * say so in one line and list nothing (Michael, 2026-10-12). A sprite is
 * listed only when it ties to an artist: a gap filled from another source,
 * a targeted replacement, or an artist's own credit request.
 *
 * Each such sprite is a row in `spriteSources.json`, keyed by the file name
 * it is served under. `source` is the entry that credits it; `by` names the
 * spriter, `with` names someone the source asks to credit beside it, and
 * `base` names the artist of the base sprite an animation is drawn on. A row
 * with `cleanup` records a sprite my151 only repaired, saying what changed; the
 * panel does not list it, because nobody chose it.
 * `scripts/check-sprite-revisions.mjs` fails when a sprite is added or
 * replaced without a row, or when a row names a missing file.
 */
import rows from './spriteSources.json';
import altFormSpecies from '@/i18n/alt-form-species.json';
import { allPickerMons, comparePickerOrder, pickerNameId, type PickerMon } from '@/favorites/model/catalog';
import { SPRITE_CREDIT_IDS } from './acknowledgements';

/**
 * Every source a row can name. Game Freak's own sprites and my151's own
 * drawings (the sprite lab's) have no entry in the panel; every other
 * source does.
 */
export const SPRITE_SOURCES = ['game-freak', 'my151', ...SPRITE_CREDIT_IDS] as const;
export type SpriteSourceId = (typeof SPRITE_SOURCES)[number];

interface SpriteRow {
  source: SpriteSourceId;
  by?: string;
  with?: string;
  base?: string;
  cleanup?: string;
}

const isSource = (id: unknown): id is SpriteSourceId => (SPRITE_SOURCES as readonly unknown[]).includes(id);

const ROWS = new Map(Object.entries(rows as Record<string, Partial<SpriteRow>>).map(([file, row]) => {
  if (!isSource(row.source)) throw new Error(`spriteSources.json: ${file} names an unknown source, "${row.source}".`);
  return [file, row as SpriteRow] as const;
}));

/** A listed sprite, with the people its row credits. */
export interface ChosenSprite {
  mon: PickerMon;
  by?: string;
  with?: string;
  base?: string;
}

/** The file name a sprite is served under, without `.png` and the `?v=` revision. */
const spriteFile = (sprite: string) => sprite.replace(/^.*\/|\.png(\?.*)?$/g, '');

const ALT_FORM_SPECIES = altFormSpecies as Record<string, number>;
const speciesOf = (id: number): number => (id <= 1025 ? id : ALT_FORM_SPECIES[id] ?? 0);

let bySource: Map<SpriteSourceId, ChosenSprite[]> | undefined;

function groupRows(): Map<SpriteSourceId, ChosenSprite[]> {
  const listed = allPickerMons()
    .flatMap((mon) => {
      const row = ROWS.get(spriteFile(mon.sprite));
      return row && !row.cleanup ? [{ mon, row, species: speciesOf(pickerNameId(mon)) || speciesOf(mon.ownerId) }] : [];
    })
    .sort((a, b) => a.species - b.species || comparePickerOrder(a.mon, b.mon));
  const groups = new Map<SpriteSourceId, ChosenSprite[]>();
  for (const { mon, row } of listed) {
    const list = groups.get(row.source) ?? [];
    groups.set(row.source, list);
    list.push({ mon, by: row.by, with: row.with, base: row.base });
  }
  return groups;
}

/** The sprites one source's rows credit, in national dex order. */
export function chosenSprites(source: SpriteSourceId): readonly ChosenSprite[] {
  bySource ??= groupRows();
  return bySource.get(source) ?? [];
}
