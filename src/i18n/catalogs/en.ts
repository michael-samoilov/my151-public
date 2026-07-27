/**
 * The English catalog is the source of truth for every user-facing string, and
 * the type oracle for the whole i18n layer: `MessageKey` is `keyof typeof en`,
 * and each message's placeholder set is derived from its own text, so
 * `t('nav.analyticsLocked', { count })` fails to compile if the argument is
 * misspelled or missing. Every other locale is typed as `Messages`, which makes
 * `tsc -b` the key-parity gate — a missing or misspelled key fails the build.
 *
 * Conventions:
 *  - Keys are namespaced by surface and kept in sorted order (a unit test
 *    enforces both, so a merge conflict can't silently duplicate one).
 *  - Placeholders are `{name}`. Inline ICU is deliberately unsupported: nested
 *    braces make the template-literal type parser both slow and wrong.
 *  - Counted messages use sibling `_one` / `_other` keys resolved through
 *    `Intl.PluralRules`. Locales that need more categories (`_many` in fr,
 *    `_few` in some Slavic languages) may add them; locales that need fewer
 *    (ja, ko, zh supply only `_other`) may omit them.
 *
 * Not covered by design: `src/components/admin/AdminPage.tsx`. It sits behind
 * `?admin`, only the owner ever sees it, and translating it would add ~13% to
 * the corpus for no user-visible benefit.
 */
import { enData } from './en.data';

/** Hand-authored UI copy. Data-module strings live in the generated en.data.ts. */
export const enUi = {
  'browser.addingTo': 'Adding to: ',
  'browser.chip.archetypes': 'Archetypes',
  'browser.chip.classification': 'Classification',
  'browser.chip.color': 'Color',
  'browser.chip.eggGroup': 'Egg Group',
  'browser.chip.gen': 'Gen',
  'browser.chip.mechanics': 'Mechanics',
  'browser.chip.places': 'Places',
  'browser.chip.shape': 'Shape',
  'browser.chip.stages': 'Stages',
  'browser.chip.type': 'Type',
  'browser.clear': 'Clear',
  'browser.count.colors_one': '{count} Color',
  'browser.count.colors_other': '{count} Colors',
  'browser.count.eggGroups_one': '{count} Egg Group',
  'browser.count.eggGroups_other': '{count} Egg Groups',
  'browser.count.gens_one': '{count} Gen',
  'browser.count.gens_other': '{count} Gens',
  'browser.count.shapes_one': '{count} Shape',
  'browser.count.shapes_other': '{count} Shapes',
  'browser.empty.hint': 'Try adjusting your filters.',
  'browser.empty.title': 'No Pokémon found.',
  'browser.fab.add_one': 'Add {count} Pokemon',
  'browser.fab.add_other': 'Add {count} Pokemon',
  'browser.fab.andRemove': 'and remove {count}',
  'browser.fab.remove_one': 'Remove {count} Pokemon',
  'browser.fab.remove_other': 'Remove {count} Pokemon',
  'browser.genChip': 'Gen {gen}',
  'browser.mode.all': 'All (AND)',
  'browser.mode.any': 'Any (OR)',
  'browser.mode.label': 'Mode:',
  'browser.modeChip.and': 'AND',
  'browser.modeChip.or': 'OR',
  'browser.results_one': '{count} found',
  'browser.results_other': '{count} found',
  'browser.search.placeholder': 'Search by name or number...',
  'browser.sheet.archetypes': 'Archetypes',
  'browser.sheet.classification': 'Classification',
  'browser.sheet.color': 'Color',
  'browser.sheet.eggGroup': 'Egg Group',
  'browser.sheet.evoStage': 'Evo Stages',
  'browser.sheet.gameMechanics': 'Game Mechanics',
  'browser.sheet.generation': 'Generation',
  'browser.sheet.places': 'Places',
  'browser.sheet.shape': 'Body Shape',
  'browser.sheet.type': 'Type',
  'browser.showResults': 'Show {count} results',
  'browser.stage.1': '1 Stage',
  'browser.stage.2': '2 Stage',
  'browser.stage.3': '3+ Stage',
  'browser.stageChip': '{stages} stage',
  'browser.subgroupGeneration': 'Generation {gen}',
  'builder.addToSection': 'Add a Pokémon to {section}',
  'dex.national': 'National Dex',
  'drilldown.shapeTitle': '{shape} Shape',
  'nav.analytics': 'Analytics',
  'nav.analyticsLocked': 'Analytics locked. Reach {count} Pokémon to unlock',
  'nav.analyticsUnlockTip': 'Reach {count} Pokémon to unlock Analytics',
  'nav.build': 'Build',
  'nav.view': 'View',
  'term.color.black': 'Black',
  'term.color.blue': 'Blue',
  'term.color.brown': 'Brown',
  'term.color.gray': 'Gray',
  'term.color.green': 'Green',
  'term.color.pink': 'Pink',
  'term.color.purple': 'Purple',
  'term.color.red': 'Red',
  'term.color.white': 'White',
  'term.color.yellow': 'Yellow',
  'term.eggGroup.bug': 'Bug',
  'term.eggGroup.ditto': 'Ditto',
  'term.eggGroup.dragon': 'Dragon',
  'term.eggGroup.fairy': 'Fairy',
  'term.eggGroup.flying': 'Flying',
  'term.eggGroup.ground': 'Field',
  'term.eggGroup.humanshape': 'Human-Like',
  'term.eggGroup.indeterminate': 'Amorphous',
  'term.eggGroup.mineral': 'Mineral',
  'term.eggGroup.monster': 'Monster',
  'term.eggGroup.no-eggs': 'Undiscovered',
  'term.eggGroup.plant': 'Grass',
  'term.eggGroup.water1': 'Water 1',
  'term.eggGroup.water2': 'Water 2',
  'term.eggGroup.water3': 'Water 3',
  'term.shape.armor': 'Insectoid',
  'term.shape.arms': 'Head & Arms',
  'term.shape.ball': 'Head',
  'term.shape.blob': 'Head & Base',
  'term.shape.bug-wings': 'Insect Wings',
  'term.shape.fish': 'Fins',
  'term.shape.heads': 'Multi-Body',
  'term.shape.humanoid': 'Humanoid',
  'term.shape.legs': 'Head & Legs',
  'term.shape.quadruped': 'Quadruped',
  'term.shape.squiggle': 'Serpent',
  'term.shape.tentacles': 'Tentacles',
  'term.shape.upright': 'Biped, Tail',
  'term.shape.wings': 'Winged',
  'term.type.bug': 'Bug',
  'term.type.dark': 'Dark',
  'term.type.dragon': 'Dragon',
  'term.type.electric': 'Electric',
  'term.type.fairy': 'Fairy',
  'term.type.fighting': 'Fighting',
  'term.type.fire': 'Fire',
  'term.type.flying': 'Flying',
  'term.type.ghost': 'Ghost',
  'term.type.grass': 'Grass',
  'term.type.ground': 'Ground',
  'term.type.ice': 'Ice',
  'term.type.normal': 'Normal',
  'term.type.poison': 'Poison',
  'term.type.psychic': 'Psychic',
  'term.type.rock': 'Rock',
  'term.type.steel': 'Steel',
  'term.type.water': 'Water',
} as const;

/**
 * The full catalog: hand-authored UI copy plus the generated data-module
 * strings. Spreading two const-asserted objects keeps every value's literal
 * type, which is what makes `ArgsOf` able to read placeholders off the source.
 */
export const en = { ...enUi, ...enData } as const;

export type MessageKey = keyof typeof en;
