/**
 * One-time importer: writes data/ontology/ from today's three catalogs.
 *
 *   node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.node.json scripts/ontology/import-legacy.ts
 *
 * Every identity the Favorite Picker knows (1,427) becomes a form. Where the legacy files disagree
 * on a fact, the value today's consumer shows wins and the disagreement goes to
 * data/ontology/reports/legacy-disagreements.json. A form the classification table does not cover
 * stops the import.
 */
import { readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pokemonData from '../../src/data/pokemon.json';
import altFormSpecies from '../../src/i18n/alt-form-species.json';
import formShapes from '../../src/data/form-shapes.json';
import formMetadata from '../../src/favorites/data/formMetadata.json';
import formBst from '../../src/favorites/data/formBst.json';
import leagueForms from '../../src/league/data/alternateForms.json';
import pickerNames from '../../src/i18n/picker-names/en.json';
import idMap from '../i18n/pokemon-id-map.json';
import powerupProvenance from '../../docs/favorite-picker-work/form-types/provenance.json';
import { ALTERNATE_PICKER_FORMS } from '../../src/favorites/model/alternateForms';
import { allPickerMons, comparePickerOrder, type PickerMon } from '../../src/favorites/model/catalog';
import { pickerPokemonMetadata } from '../../src/favorites/model/metadata';
import { ADDITIONAL_EVOLUTION_EDGES, FORM_PARENT_IDS, STANDALONE_FORM_IDS, isLeagueAlternateForm } from '../../src/league/data/formPolicy';
import { RESTRICTED_LEGENDARY_IDS, ULTRA_BEAST_IDS } from '../../src/data/categories';
import { COLOR_NAMES, EGG_GROUP_NAMES, SHAPE_NAMES, TYPE_NAMES, type Pokemon } from '../../src/types/pokemon';
import type { Obtain, Sex, ToolInclusion, ToolVerdict } from '../../src/ontology/model';
import type { DefaultFormEntry, EvolutionEntry, FormEntry, SpeciesFile, StateEntry } from './authored';
import { writeJson } from './json';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const out = join(root, 'data', 'ontology');

type Mon = PickerMon;
const dex = pokemonData as Pokemon[];
const dexById = new Map(dex.map((row) => [row.id, row]));
const mons = allPickerMons();
const monById = new Map(mons.map((mon) => [mon.id, mon]));
const altById = new Map(ALTERNATE_PICKER_FORMS.map((form) => [form.id, form]));
const metadata = formMetadata as Record<string, Partial<Pick<Pokemon, 'stats' | 'bst' | 'color' | 'eggGroups'>>>;
const shapes = formShapes as Record<string, string>;
const bstById = formBst as Record<string, number>;
const altSpecies = altFormSpecies as Record<string, number>;
const pickerSpecies = (pickerNames as { species: Record<string, number> }).species;
const idMapByAppId = new Map(idMap.entries.map((entry) => [entry.appId, entry]));
const provenanceById = new Map(powerupProvenance.forms.map((form) => [form.id, form]));
const leagueMetadata = new Map(leagueForms.map((form) => [form.id, form]));

/** The Picker's three hand remaps of Dex numbers, so a Picker number finds its Dex row. */
const dexIdByPickerId = new Map(dex.map((row) => [row.id === 10178 ? 10179 : row.id === 10179 ? 10180 : row.id === 10227 ? 10191 : row.id, row.id]));
const dexRowOf = (mon: Mon): Pokemon | undefined => dexById.get(dexIdByPickerId.get(mon.id) ?? -1);

// ── Sources ──────────────────────────────────────────────────────────────────────────────────

const SOURCE = {
  dex: 'legacy:src/data/pokemon.json',
  altForms: 'legacy:src/favorites/model/alternateForms.ts',
  powerups: 'legacy:src/league/data/powerupForms.json',
  metadata: 'legacy:src/favorites/data/formMetadata.json',
  powerupTypes: 'legacy:src/favorites/data/powerupTypes.json',
  shapes: 'legacy:src/data/form-shapes.json',
  sourceGame: 'legacy:src/favorites/model/sourceGame.ts',
  debut: 'legacy:src/favorites/model/debut.ts',
  formPolicy: 'legacy:src/league/data/formPolicy.ts',
  leagueCatalog: 'legacy:src/league/data/catalog.ts',
  pickerCatalog: 'legacy:src/favorites/model/catalog.ts',
  categories: 'legacy:src/data/categories.ts',
  spec: 'docs/data-model/pokemon-ontology.md',
} as const;

const DECISIONS = [
  {
    id: 'spec-v2-keeps-todays-verdicts',
    by: 'Michael',
    date: '2026-11-02',
    quote: 'Version 2 keeps today’s verdicts until Michael decides otherwise.',
    where: 'docs/data-model/pokemon-ontology.md, "Open questions", item 2',
  },
  {
    id: 'league-spinoff-forms-2026-10-20',
    by: 'Michael',
    date: '2026-10-20',
    quote: 'for now, we can keep off all of these spinoff-game etc. pokemon forms from the league builder.',
    where: 'src/league/data/formPolicy.ts, PICKER_ONLY_FORM_IDS',
  },
];

// ── Games ────────────────────────────────────────────────────────────────────────────────────

interface Game { id: string; series: 'mainline' | 'spinoff' | 'mobile'; generation: number | null; region: string | null }
const GAMES: Game[] = [
  { id: 'red-blue', series: 'mainline', generation: 1, region: 'kanto' },
  { id: 'gold-silver', series: 'mainline', generation: 2, region: 'johto' },
  { id: 'ruby-sapphire', series: 'mainline', generation: 3, region: 'hoenn' },
  { id: 'firered-leafgreen', series: 'mainline', generation: 3, region: 'kanto' },
  { id: 'emerald', series: 'mainline', generation: 3, region: 'hoenn' },
  { id: 'xd', series: 'spinoff', generation: 3, region: 'orre' },
  { id: 'mystery-dungeon-rescue-team', series: 'spinoff', generation: 3, region: null },
  { id: 'diamond-pearl', series: 'mainline', generation: 4, region: 'sinnoh' },
  { id: 'mystery-dungeon-explorers', series: 'spinoff', generation: 4, region: null },
  { id: 'platinum', series: 'mainline', generation: 4, region: 'sinnoh' },
  { id: 'heartgold-soulsilver', series: 'mainline', generation: 4, region: 'johto' },
  { id: 'ranger-guardian-signs', series: 'spinoff', generation: 4, region: 'oblivia' },
  { id: 'black-white', series: 'mainline', generation: 5, region: 'unova' },
  { id: 'black-2-white-2', series: 'mainline', generation: 5, region: 'unova' },
  { id: 'x-y', series: 'mainline', generation: 6, region: 'kalos' },
  { id: 'omega-ruby-alpha-sapphire', series: 'mainline', generation: 6, region: 'hoenn' },
  { id: 'pokken-tournament', series: 'spinoff', generation: 6, region: 'ferrum' },
  { id: 'sun-moon', series: 'mainline', generation: 7, region: 'alola' },
  { id: 'ultra-sun-ultra-moon', series: 'mainline', generation: 7, region: 'alola' },
  { id: 'lets-go-pikachu-eevee', series: 'mainline', generation: 7, region: 'kanto' },
  { id: 'sword-shield', series: 'mainline', generation: 8, region: 'galar' },
  { id: 'legends-arceus', series: 'mainline', generation: 8, region: 'hisui' },
  { id: 'scarlet-violet', series: 'mainline', generation: 9, region: 'paldea' },
  { id: 'legends-za', series: 'mainline', generation: 9, region: 'kalos' },
  { id: 'pokopia', series: 'spinoff', generation: 9, region: null },
  { id: 'go', series: 'mobile', generation: null, region: null },
  { id: 'home', series: 'mobile', generation: null, region: null },
];
const gameById = new Map(GAMES.map((game) => [game.id, game]));
const DEBUT_CODE: Record<string, string> = {
  RB: 'red-blue', GS: 'gold-silver', RS: 'ruby-sapphire', FRLG: 'firered-leafgreen', E: 'emerald', XD: 'xd',
  PMD: 'mystery-dungeon-rescue-team', DP: 'diamond-pearl', PMDTD: 'mystery-dungeon-explorers', Pt: 'platinum',
  HGSS: 'heartgold-soulsilver', RangerGS: 'ranger-guardian-signs', BW: 'black-white', B2W2: 'black-2-white-2', XY: 'x-y',
  ORAS: 'omega-ruby-alpha-sapphire', Pokken: 'pokken-tournament', SM: 'sun-moon', USUM: 'ultra-sun-ultra-moon',
  LGPE: 'lets-go-pikachu-eevee', SwSh: 'sword-shield', PLA: 'legends-arceus', SV: 'scarlet-violet', PLZA: 'legends-za', Pokopia: 'pokopia',
};
const SOURCE_CODE: Record<string, string> = {
  pokopia: 'pokopia', xd: 'xd', 'ranger-gs': 'ranger-guardian-signs', pokken: 'pokken-tournament', go: 'go', home: 'home',
  dp: 'diamond-pearl', bw: 'black-white', hgss: 'heartgold-soulsilver', b2w2: 'black-2-white-2', xy: 'x-y', sm: 'sun-moon',
  usum: 'ultra-sun-ultra-moon', swsh: 'sword-shield', sv: 'scarlet-violet',
};
const GENERATION_GAME: Record<number, string> = { 1: 'RB', 2: 'GS', 3: 'RS', 4: 'DP', 5: 'BW', 6: 'XY', 7: 'SM', 8: 'SwSh', 9: 'SV' };
const REGION_GAME: Record<string, string> = { alola: 'SM', galar: 'SwSh', hisui: 'PLA', paldea: 'SV' };
const OBTAIN: Record<string, Obtain | null> = { 'spin-off': 'spinoff-only', event: 'event-only', story: 'story-only', state: null };

/** The two tables in src/favorites/model that no module exports, read from the source text. */
function readTables() {
  const debutText = readFileSync(join(root, 'src/favorites/model/debut.ts'), 'utf8');
  const laterDebuts = [...debutText.matchAll(/\[(\d+), (\d+), '(\w+)'\]/g)].map((m) => [Number(m[1]), Number(m[2]), m[3]] as const);
  if (laterDebuts.length !== 24) throw new Error(`expected 24 LATER_DEBUTS rows, found ${laterDebuts.length}`);
  const sourceText = readFileSync(join(root, 'src/favorites/model/sourceGame.ts'), 'utf8');
  const sources = new Map([...sourceText.matchAll(/^\s+(\d+): \['([\w-]+)', '([\w-]+)'\]/gm)].map((m) => [Number(m[1]), { game: m[2], group: m[3] }]));
  if (sources.size !== 38) throw new Error(`expected 38 FORM_SOURCES rows, found ${sources.size}`);
  return { laterDebuts, sources };
}
const tables = readTables();

function debutByDebutTs(mon: Mon): string {
  const listed = tables.laterDebuts.find(([first, last]) => mon.id >= first && mon.id <= last);
  if (listed) return DEBUT_CODE[listed[2]];
  if (mon.name.startsWith('Gigantamax ')) return DEBUT_CODE.SwSh;
  if (mon.source === 'powerup') return DEBUT_CODE.XY;
  const region = /-(alola|galar|hisui|paldea)(?:-|$)/.exec(mon.name)?.[1];
  if (region) return DEBUT_CODE[REGION_GAME[region]];
  return DEBUT_CODE[GENERATION_GAME[mon.generation]];
}

function sourceOfMon(mon: Mon): { game: string; group: string } | undefined {
  const row = tables.sources.get(mon.id);
  if (!row) return undefined;
  const game = row.game === 'mystery-dungeon'
    ? (mon.id === 11124 ? 'mystery-dungeon-explorers' : 'mystery-dungeon-rescue-team')
    : SOURCE_CODE[row.game];
  if (!game) throw new Error(`no game for source code ${row.game}`);
  return { game, group: row.group };
}

// ── Classification ───────────────────────────────────────────────────────────────────────────

interface Coordinates { region?: string; variety?: Record<string, string>; sex?: Sex; fusion?: string }
interface StateSpec { kind: StateEntry['kind']; from?: readonly string[] | 'any'; letter?: 'x' | 'y' | 'z'; teraType?: string }
type Classification = { kind: 'permanent'; coordinates: Coordinates } | { kind: 'state'; state: StateSpec };

const REGIONS = ['alola', 'galar', 'hisui', 'paldea'];
const FORME = (value: string): Coordinates => ({ variety: { forme: value } });
const LOOK = (value: string): Coordinates => ({ variety: { look: value } });

/** Permanent forms whose slug does not follow a pattern rule. */
const COORDINATES: Record<string, Coordinates> = {
  'deoxys-attack': FORME('attack'), 'deoxys-defense': FORME('defense'), 'deoxys-speed': FORME('speed'),
  'wormadam-sandy': { variety: { cloak: 'sandy' } }, 'wormadam-trash': { variety: { cloak: 'trash' } },
  'shaymin-sky': FORME('sky'), 'giratina-origin': FORME('origin'), 'dialga-origin': FORME('origin'), 'palkia-origin': FORME('origin'),
  'tornadus-therian': FORME('therian'), 'thundurus-therian': FORME('therian'), 'landorus-therian': FORME('therian'), 'enamorus-therian': FORME('therian'),
  'keldeo-resolute': FORME('resolute'), 'hoopa-unbound': FORME('unbound'),
  'lycanroc-midnight': FORME('midnight'), 'lycanroc-dusk': FORME('dusk'),
  'toxtricity-low-key': FORME('low-key'), 'zacian-crowned': FORME('crowned'), 'zamazenta-crowned': FORME('crowned'),
  'zarude-dada': FORME('dada'), 'gimmighoul-roaming': FORME('roaming'), 'ursaluna-bloodmoon': FORME('bloodmoon'),
  'xerneas-neutral': FORME('neutral'), 'dudunsparce-three-segment': FORME('three-segment'), 'maushold-family-of-three': FORME('family-of-three'),
  'tatsugiri-droopy': FORME('droopy'), 'tatsugiri-stretchy': FORME('stretchy'), 'pichu-spiky-eared': FORME('spiky-eared'),
  'urshifu-rapid-strike': { variety: { style: 'rapid-strike' } },
  'zygarde-10': { variety: { cells: '10' } },
  'magearna-original': { variety: { paint: 'original' } },
  'floette-eternal': { variety: { flower: 'eternal' } },
  'rotom-dj': { variety: { appliance: 'stereo' } },
  'kyurem-black': { fusion: 'zekrom' }, 'kyurem-white': { fusion: 'reshiram' },
  'necrozma-dusk': { fusion: 'solgaleo' }, 'necrozma-dawn': { fusion: 'lunala' },
  'calyrex-ice': { fusion: 'glastrier' }, 'calyrex-shadow': { fusion: 'spectrier' },
  'smeargle-smearguru': LOOK('smearguru'), 'snorlax-mosslax': LOOK('mosslax'), 'pikachu-peakychu': LOOK('peakychu'),
  'tinkaton-tinkmaster': LOOK('tinkmaster'), 'tangrowth-professor': LOOK('professor'), 'greedent-chef-dente': LOOK('chef-dente'),
  'lugia-shadow': LOOK('shadow'), 'mewtwo-shadow': LOOK('shadow'), 'dialga-primal': LOOK('primal'), 'pichu-ukulele': LOOK('ukulele'),
  'kecleon-purple': { variety: { color: 'purple' } },
};
/** Where the default form sits on an axis its other forms use, or is the male of a sex pair. */
const DEFAULT_COORDINATES: Record<string, Coordinates> = {
  unown: { variety: { letter: 'a' } }, urshifu: { variety: { style: 'single-strike' } },
  alcremie: { variety: { cream: 'vanilla', sweet: 'strawberry' } }, deoxys: FORME('normal'), wormadam: { variety: { cloak: 'plant' } },
  giratina: FORME('altered'), shaymin: FORME('land'), tornadus: FORME('incarnate'), thundurus: FORME('incarnate'), landorus: FORME('incarnate'),
  enamorus: FORME('incarnate'), keldeo: FORME('ordinary'), basculin: { variety: { stripe: 'red' } }, shellos: { variety: { side: 'west' } },
  gastrodon: { variety: { side: 'west' } }, deerling: { variety: { season: 'spring' } }, sawsbuck: { variety: { season: 'spring' } },
  vivillon: { variety: { pattern: 'meadow' } }, flabebe: { variety: { flower: 'red' } }, floette: { variety: { flower: 'red' } },
  florges: { variety: { flower: 'red' } }, furfrou: { variety: { trim: 'natural' } }, zygarde: { variety: { cells: '50' } },
  oricorio: { variety: { style: 'baile' } }, lycanroc: FORME('midday'), toxtricity: FORME('amped'), squawkabilly: { variety: { plumage: 'green' } },
  tatsugiri: FORME('curly'), dudunsparce: FORME('two-segment'), maushold: FORME('family-of-four'), gimmighoul: FORME('chest'),
  ogerpon: { variety: { mask: 'teal' } }, hoopa: FORME('confined'), xerneas: FORME('active'), zacian: FORME('hero'), zamazenta: FORME('hero'),
  ...Object.fromEntries(['meowstic', 'indeedee', 'basculegion', 'oinkologne', 'hippopotas', 'hippowdon', 'frillish', 'jellicent', 'pyroar', 'combee', 'unfezant'].map((id) => [id, { sex: 'male' as const }])),
};
const BATTLE: StateSpec = { kind: 'battle-mode' };
const MOVE_LOOK: StateSpec = { kind: 'move-look' };
/** Temporary forms. `from` defaults to the species' default form. */
const STATES: Record<string, StateSpec> = {
  'castform-sunny': BATTLE, 'castform-rainy': BATTLE, 'castform-snowy': BATTLE,
  'darmanitan-zen': BATTLE, 'darmanitan-galar-zen': { ...BATTLE, from: ['darmanitan-galar'] },
  'meloetta-pirouette': BATTLE, 'aegislash-blade': BATTLE, 'greninja-ash': BATTLE,
  'zygarde-complete': { ...BATTLE, from: ['zygarde', 'zygarde-10'] },
  'wishiwashi-school': BATTLE, 'mimikyu-busted': BATTLE, 'cramorant-gulping': BATTLE, 'cramorant-gorging': BATTLE,
  'eiscue-noice': BATTLE, 'morpeko-hangry': BATTLE, 'palafin-hero': BATTLE, 'cherrim-sunshine': BATTLE,
  'minior-red': BATTLE, 'minior-orange': BATTLE, 'minior-yellow': BATTLE, 'minior-green': BATTLE, 'minior-blue': BATTLE, 'minior-indigo': BATTLE, 'minior-violet': BATTLE,
  'necrozma-ultra': { kind: 'ultra-burst', from: ['necrozma-dusk', 'necrozma-dawn'] },
  'eternatus-eternamax': { kind: 'eternamax' },
  'terapagos-terastal': BATTLE, 'terapagos-stellar': { kind: 'terastal', teraType: 'stellar', from: ['terapagos-terastal'] },
  'ogerpon-teal-tera': { kind: 'terastal', teraType: 'grass' },
  'ogerpon-wellspring-tera': { kind: 'terastal', teraType: 'water', from: ['ogerpon-wellspring-mask'] },
  'ogerpon-hearthflame-tera': { kind: 'terastal', teraType: 'fire', from: ['ogerpon-hearthflame-mask'] },
  'ogerpon-cornerstone-tera': { kind: 'terastal', teraType: 'rock', from: ['ogerpon-cornerstone-mask'] },
  'reshiram-overdrive': MOVE_LOOK, 'zekrom-overdrive': MOVE_LOOK,
  'kyurem-black-overdrive': { ...MOVE_LOOK, from: ['kyurem-black'] }, 'kyurem-white-overdrive': { ...MOVE_LOOK, from: ['kyurem-white'] },
  'solgaleo-radiant-sun': MOVE_LOOK, 'lunala-full-moon': MOVE_LOOK, 'marshadow-zenith': MOVE_LOOK,
  'koraidon-limited-build': { kind: 'ride' }, 'miraidon-low-power-mode': { kind: 'ride' },
};
/** Power-up entry forms that are not the species' default form. */
const POWERUP_FROM: Record<string, readonly string[] | 'any'> = {
  'floette-mega': ['floette-eternal'],
  'magearna-original-mega': ['magearna-original'],
  'tatsugiri-droopy-mega': ['tatsugiri-droopy'], 'tatsugiri-stretchy-mega': ['tatsugiri-stretchy'],
  'urshifu-rapid-strike-gmax': ['urshifu-rapid-strike'],
  'alcremie-gmax': 'any',
  'toxtricity-gmax': ['toxtricity', 'toxtricity-low-key'],
};

function classify(formId: string, species: string, mon: Mon): Classification {
  if (mon.source === 'powerup') {
    const suffix = /-(mega(?:-[xyz])?|primal|gmax)$/.exec(formId);
    if (!suffix) throw new Error(`power-up ${mon.id} "${formId}" has no known kind`);
    const kind = suffix[1] === 'primal' ? 'primal' : suffix[1] === 'gmax' ? 'gigantamax' : 'mega';
    const letter = /-(x|y|z)$/.exec(formId)?.[1] as 'x' | 'y' | 'z' | undefined;
    return { kind: 'state', state: { kind, from: POWERUP_FROM[formId], ...(letter ? { letter } : {}) } };
  }
  if (STATES[formId]) return { kind: 'state', state: STATES[formId] };
  if (COORDINATES[formId]) return { kind: 'permanent', coordinates: COORDINATES[formId] };
  if (formId === species) return { kind: 'permanent', coordinates: DEFAULT_COORDINATES[species] ?? {} };
  const rest = formId.startsWith(`${species}-`) ? formId.slice(species.length + 1) : null;
  if (rest === null) throw new Error(`"${formId}" is not named after its species "${species}" and no rule covers it`);
  const rules: [RegExp, (m: RegExpExecArray) => Coordinates | null][] = [
    [/^paldea-(combat|blaze|aqua)$/, (m) => ({ region: 'paldea', variety: { breed: m[1] } })],
    [new RegExp(`^(${REGIONS.join('|')})$`), (m) => ({ region: m[1] })],
    [/^female$/, () => ({ sex: 'female' })],
    [/^(berry|love|star|clover|flower|ribbon)$/, (m) => species === 'alcremie' ? { variety: { cream: 'vanilla', sweet: m[1] } } : null],
    [/^(heat|wash|frost|fan|mow)$/, (m) => species === 'rotom' ? { variety: { appliance: m[1] } } : null],
    [/^(blue|white)-striped$/, (m) => species === 'basculin' ? { variety: { stripe: m[1] } } : null],
    [/^(blue|yellow|white)-plumage$/, (m) => species === 'squawkabilly' ? { variety: { plumage: m[1] } } : null],
    [/^(wellspring|hearthflame|cornerstone)-mask$/, (m) => species === 'ogerpon' ? { variety: { mask: m[1] } } : null],
    [/^(pom-pom|pau|sensu)$/, (m) => species === 'oricorio' ? { variety: { style: m[1] } } : null],
    [/^east$/, () => ['shellos', 'gastrodon'].includes(species) ? { variety: { side: 'east' } } : null],
    [/^(summer|autumn|winter)$/, (m) => ['deerling', 'sawsbuck'].includes(species) ? { variety: { season: m[1] } } : null],
    [/^(blue|orange|white|yellow)$/, (m) => ['flabebe', 'floette', 'florges'].includes(species) ? { variety: { flower: m[1] } } : null],
    [/^([a-z]|exclamation|question)$/, (m) => species === 'unown' ? { variety: { letter: m[1] } } : null],
    [/^(rock-star|belle|pop-star|phd|libre|cosplay)$/, (m) => species === 'pikachu' ? { variety: { outfit: m[1] } } : null],
    [/^([a-z]+)-cap$/, (m) => species === 'pikachu' ? { variety: { outfit: `${m[1]}-cap` } } : null],
    [/^.+$/, (m): Coordinates | null => species === 'vivillon' ? { variety: { pattern: m[0] } } : species === 'furfrou' ? { variety: { trim: m[0] } } : null],
  ];
  for (const [pattern, build] of rules) {
    const match = pattern.exec(rest);
    const coordinates = match && build(match);
    if (coordinates) return { kind: 'permanent', coordinates };
  }
  throw new Error(`no classification rule covers "${formId}"`);
}

// ── Identities ───────────────────────────────────────────────────────────────────────────────

interface Identity {
  mon: Mon;
  formId: string;
  species: string;
  speciesDex: number;
  dexRow?: Pokemon;
  shown: Pokemon;
  classification: Classification;
  appId: number;
  inLeague: boolean;
}

const speciesSlug = new Map(dex.filter((row) => row.id <= 1025).map((row) => [row.id, row.name]));
const speciesDexOfDexId = (id: number): number => altSpecies[id] ?? id;
function speciesDexOfMon(mon: Mon): number {
  const own = dexIdByPickerId.get(mon.id);
  if (own !== undefined) return speciesDexOfDexId(own);
  const owner = monById.get(mon.ownerId);
  if (!owner) throw new Error(`${mon.id} has no owner`);
  return speciesDexOfMon(owner);
}

function formIdOf(mon: Mon, dexRow: Pokemon | undefined): string {
  if (dexRow) return dexRow.name;
  if (mon.source === 'powerup' && !altById.has(mon.id)) {
    const identifier = provenanceById.get(mon.id)?.identifier;
    const suffix = identifier && /-(mega(?:-[xyz])?|primal|gmax)$/.exec(identifier)?.[1];
    if (!suffix) throw new Error(`power-up ${mon.id} has no identifier with a known suffix in form-types/provenance.json`);
    // PokeAPI names a power-up after the pokemon it enters from, which can be a default variety such as
    // "urshifu-single-strike". The ontology names it after the species, like the default form itself.
    // Gigantamax Rapid Strike Urshifu enters from a non-default form, so it keeps the form's name.
    return mon.id === 10227 ? identifier : `${speciesSlug.get(speciesDexOfMon(mon))}-${suffix}`;
  }
  return mon.name;
}

const identities: Identity[] = mons.map((mon) => {
  const dexRow = dexRowOf(mon);
  const speciesDex = speciesDexOfMon(mon);
  const species = speciesSlug.get(speciesDex);
  if (!species) throw new Error(`${mon.id} maps to species ${speciesDex}, which is not a species row`);
  const shown = pickerPokemonMetadata(mon);
  if (!shown) throw new Error(`${mon.id} has no picker metadata`);
  const formId = formIdOf(mon, dexRow);
  const alt = altById.get(mon.id);
  const inLeague = Boolean(dexRow) || mon.source === 'powerup' || (alt !== undefined && isLeagueAlternateForm(alt));
  return {
    mon, formId, species, speciesDex, dexRow, shown, classification: classify(formId, species, mon),
    appId: dexRow ? dexRow.id : formId === 'urshifu-rapid-strike-gmax' ? 20001 : mon.id,
    inLeague,
  };
});
const identityByForm = new Map(identities.map((identity) => [identity.formId, identity]));
const identityByDexId = new Map(identities.filter((identity) => identity.dexRow).map((identity) => [identity.dexRow!.id, identity]));
const identityByPickerId = new Map(identities.map((identity) => [identity.mon.id, identity]));
if (identities.length !== new Set(identities.map((identity) => identity.formId)).size) {
  const seen = new Set<string>();
  for (const identity of identities) {
    if (seen.has(identity.formId)) throw new Error(`form id "${identity.formId}" is minted twice`);
    seen.add(identity.formId);
  }
}

// ── Disagreements ────────────────────────────────────────────────────────────────────────────

interface Disagreement { fact: string; form: string; values: Record<string, unknown>; chosen: unknown; reason: string }
const disagreements: Disagreement[] = [];
const disagree = (fact: string, form: string, values: Record<string, unknown>, chosen: unknown, reason: string) => disagreements.push({ fact, form, values, chosen, reason });
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const sum = (stats: Pokemon['stats']) => Object.values(stats).reduce((total, value) => total + value, 0);

for (const identity of identities) {
  const { mon, formId, shown, dexRow } = identity;
  const bst = bstById[mon.id];
  const shownBst = sum(shown.stats);
  if (bst !== undefined && bst !== shownBst) disagree('bst', formId, { 'formBst.json': bst, 'formMetadata.json + pokemon.json stats': shownBst }, shownBst, 'The Picker metadata and its stat chart show the stat line; the sort key file is regenerated in phase 2.');
  const meta = metadata[mon.id];
  if (meta?.bst !== undefined && meta.bst !== shownBst) disagree('bst', formId, { 'formMetadata.json bst': meta.bst, 'sum of stats': shownBst }, shownBst, 'The stat line is the fact; bst is derived.');
  const league = leagueMetadata.get(mon.id);
  if (league) {
    if (!same(league.types, mon.types)) disagree('types', formId, { 'league alternateForms.json': league.types, 'alternateForms.ts': mon.types }, mon.types, 'The Picker list is the source the League file is generated from.');
    if (league.metadata?.stats && !same(league.metadata.stats, shown.stats)) disagree('baseStats', formId, { 'league alternateForms.json': league.metadata.stats, 'formMetadata.json': shown.stats }, shown.stats, 'The Picker metadata is the source the League file is generated from.');
  }
  if (dexRow) {
    const override = shapes[dexRow.id];
    if (override && override !== dexRow.shape) disagree('shape', formId, { 'form-shapes.json': override, 'pokemon.json': dexRow.shape }, override, 'The runtime applies form-shapes.json over pokemon.json, so the override is what every tool shows.');
    const mapped = idMapByAppId.get(dexRow.id);
    if (mapped && mapped.speciesId !== identity.speciesDex) disagree('species', formId, { 'pokemon-id-map.json': mapped.speciesId, 'alt-form-species.json': identity.speciesDex }, identity.speciesDex, 'The Dex and Picker group forms by alt-form-species.json.');
  }
  const namedSpecies = pickerSpecies[mon.id];
  if (namedSpecies !== undefined && namedSpecies !== identity.speciesDex) disagree('species', formId, { 'picker-names/en.json species': namedSpecies, 'catalog ownerId chain': identity.speciesDex }, identity.speciesDex, 'The Picker groups forms by ownerId.');
  const source = sourceOfMon(mon);
  const byDebut = debutByDebutTs(mon);
  if (source && source.game !== byDebut) disagree('debut', formId, { 'sourceGame.ts': source.game, 'debut.ts': byDebut }, source.game, 'The tooltip names the source game; the debut sort only needs its generation.');
  if (formId === 'rotom-dj') disagree('persistence', formId, { 'formPolicy.ts TEMPORARY_FORM_IDS': 'temporary', 'sourceGame.ts': 'spin-off' }, 'permanent, spinoff-only', 'Stereo Rotom is a Pokopia form, not a battle state; the League keeps it out as a spin-off form.');
  if (formId === 'floette-mega') disagree('state.from', formId, { 'powerupForms.json': 'floette', 'spec risk 5': 'floette-eternal' }, ['floette-eternal'], 'In Legends: Z-A only Eternal Floette Mega Evolves; the League and Picker keep offering it on plain Floette until phase 2.');
}
const leagueParentOverrides: Record<number, number | null> = FORM_PARENT_IDS;
for (const [dexId, parentPickerId] of Object.entries(leagueParentOverrides)) {
  const row = dexById.get(Number(dexId));
  if (!row || parentPickerId === null) continue;
  const dexParent = row.evolvesFrom;
  const leagueParent = identityByPickerId.get(parentPickerId);
  if (dexParent !== null && leagueParent && leagueParent.speciesDex === speciesDexOfDexId(dexParent)) {
    disagree('evolvesFrom', row.name, { 'pokemon.json': dexById.get(dexParent)!.name, 'formPolicy.ts FORM_PARENT_IDS': leagueParent.formId }, leagueParent.formId, 'The League names the exact form; the Dex shows that form’s species because it does not list the form.');
  }
}
for (const [dexId, pickerId] of [[10178, 10179], [10179, 10180], [10227, 10191], [20001, 10227]] as const) {
  const identity = identities.find((entry) => entry.appId === dexId)!;
  disagree('appId', identity.formId, { 'pokemon.json': dexId <= 20000 ? dexId : null, 'favorites/model/catalog.ts': pickerId }, dexId, 'Dex numbers win collisions; a new number starts at 20001.');
}
disagree('name', 'urshifu', { 'pokemon.json': 'urshifu', 'favorites/model/catalog.ts': 'urshifu-single-strike' }, 'urshifu', 'The form id is the species slug; the Picker string is kept in legacy/picker.json.');
for (const [speciesId, standIn] of [[746, 10127], [964, 10256], [1024, 10276]] as const) {
  const row = dexById.get(speciesId)!;
  disagree('sprite', row.name, { 'pokemon.json': row.sprite, 'favorites/model/catalog.ts': `/sprites/pokemon/${speciesId}.png` }, `${speciesId}, with species.standIn.dex = ${identityByPickerId.get(standIn)!.formId}`, 'The Dex shows a stand-in form; the Picker shows the default form’s own sprite.');
}

// ── Species files ────────────────────────────────────────────────────────────────────────────

const stem = (sprite: string): string => {
  const match = /^\/sprites\/pokemon\/([^?]+)\.png/.exec(sprite);
  if (!match) throw new Error(`unexpected sprite path ${sprite}`);
  return match[1];
};

interface Facts { types: string[]; baseStats: Pokemon['stats']; color: string; shape: string; eggGroups: string[]; debut: string; obtain: Obtain }
function factsOf(identity: Identity): Facts {
  const { mon, shown } = identity;
  const source = sourceOfMon(mon);
  return {
    types: shown.types,
    baseStats: shown.stats,
    color: shown.color,
    shape: shown.shape,
    eggGroups: shown.eggGroups,
    debut: source?.game ?? debutByDebutTs(mon),
    obtain: (source && OBTAIN[source.group]) || 'standard',
  };
}

function baseOf(identity: Identity, defaultIdentity: Identity): Identity {
  if (identity.classification.kind === 'permanent') return defaultIdentity;
  const from = identity.classification.state.from;
  if (!from || from === 'any') return defaultIdentity;
  const base = identityByForm.get(from[0]);
  if (!base) throw new Error(`${identity.formId} enters from unknown form ${from[0]}`);
  return base;
}

function verdicts(identity: Identity, defaultIdentity: Identity, facts: Facts): ToolInclusion {
  const isState = identity.classification.kind === 'state';
  const game = gameById.get(facts.debut)!;
  const defaultFacts = factsOf(defaultIdentity);
  const lookOnly = same(facts.types, defaultFacts.types) && same(facts.baseStats, defaultFacts.baseStats) && same(facts.eggGroups, defaultFacts.eggGroups);
  const out = (): ToolVerdict => ({
    out: isState ? 'battle-state' : game.series !== 'mainline' ? 'spinoff-only' : lookOnly ? 'look-only' : { decision: 'spec-v2-keeps-todays-verdicts' as never },
  });
  return {
    picker: 'in',
    dex: identity.dexRow ? 'in' : out(),
    league: identity.inLeague ? 'in' : out(),
  };
}

/** The League's parent for a row, as src/league/data/catalog.ts computes it. */
function leagueParentPickerId(identity: Identity): number | null | undefined {
  const { mon, dexRow } = identity;
  if (dexRow) {
    if (Object.hasOwn(FORM_PARENT_IDS, dexRow.id)) return FORM_PARENT_IDS[dexRow.id];
    return dexRow.evolvesFrom === null ? null : identityByDexId.get(dexRow.evolvesFrom)!.mon.id;
  }
  if (!identity.inLeague || mon.source === 'powerup') return undefined;
  if (STANDALONE_FORM_IDS.has(mon.id)) return null;
  if (Object.hasOwn(FORM_PARENT_IDS, mon.id)) return FORM_PARENT_IDS[mon.id];
  const owner = identityByPickerId.get(mon.ownerId)!;
  const ownerParent = owner.dexRow!.evolvesFrom;
  return ownerParent === null ? null : identityByDexId.get(ownerParent)!.mon.id;
}

function sparse<T extends object>(own: T, base: T, keys: readonly (keyof T & string)[]): Partial<T> {
  return Object.fromEntries(keys.filter((key) => !same(own[key], base[key])).map((key) => [key, own[key]])) as Partial<T>;
}

const FACT_SOURCES = (identity: Identity, stated: Partial<Facts>): Record<string, string> => {
  const { mon } = identity;
  const sources: Record<string, string> = {};
  const meta = metadata[mon.id];
  if (!identity.dexRow) {
    if (stated.types) sources.types = mon.source === 'powerup' && !altById.has(mon.id) ? SOURCE.powerupTypes : SOURCE.altForms;
    if (stated.baseStats && meta?.stats) sources.baseStats = SOURCE.metadata;
    if (stated.color && meta?.color) sources.color = SOURCE.metadata;
    if (stated.eggGroups && meta?.eggGroups) sources.eggGroups = SOURCE.metadata;
    if (stated.shape && shapes[mon.id]) sources.shape = SOURCE.shapes;
  } else if (stated.shape && shapes[mon.id]) sources.shape = SOURCE.shapes;
  if (stated.debut) sources.debut = sourceOfMon(mon) ? SOURCE.sourceGame : SOURCE.debut;
  if (stated.obtain) sources.obtain = SOURCE.sourceGame;
  return sources;
};

const bySpecies = new Map<string, Identity[]>();
for (const identity of identities) bySpecies.set(identity.species, [...(bySpecies.get(identity.species) ?? []), identity]);

const evolutionsInto = new Map<string, EvolutionEntry[]>();
function addEdge(from: Identity, to: Identity, level: number | null, source: string): void {
  const edges = evolutionsInto.get(to.formId) ?? [];
  if (edges.some((edge) => edge.from === from.formId)) return;
  edges.push({
    from: from.formId as EvolutionEntry['from'],
    to: to.formId as EvolutionEntry['to'],
    methods: level === null ? [] : [{ games: 'all', trigger: 'level-up', conditions: [{ kind: 'level', level }] }],
    ...(source === SOURCE.dex ? {} : { source: source as EvolutionEntry['source'] }),
  });
  evolutionsInto.set(to.formId, edges);
}
for (const identity of identities) {
  const parentPickerId = leagueParentPickerId(identity);
  const { dexRow } = identity;
  if (dexRow && dexRow.evolvesFrom !== null) {
    const dexParent = identityByDexId.get(dexRow.evolvesFrom)!;
    const leagueParent = parentPickerId === null || parentPickerId === undefined ? undefined : identityByPickerId.get(parentPickerId)!;
    const narrower = leagueParent && leagueParent !== dexParent && leagueParent.speciesDex === dexParent.speciesDex;
    addEdge(narrower ? leagueParent : dexParent, identity, dexRow.evolutionLevel, narrower ? SOURCE.formPolicy : SOURCE.dex);
  } else if (!dexRow && parentPickerId !== null && parentPickerId !== undefined) {
    const parent = identityByPickerId.get(parentPickerId)!;
    const owner = identityByPickerId.get(identity.mon.ownerId)!;
    addEdge(parent, identity, owner.dexRow!.evolutionLevel, SOURCE.leagueCatalog);
  }
}
for (const [parentId, childId] of ADDITIONAL_EVOLUTION_EDGES) {
  const parent = identityByPickerId.get(parentId)!;
  const child = identityByPickerId.get(childId)!;
  addEdge(parent, child, child.dexRow?.evolutionLevel ?? null, SOURCE.formPolicy);
}

const speciesFiles: { file: string; data: SpeciesFile }[] = [];
const legacyNames: Record<string, string> = {};
const legacyOwners: Record<string, string> = {};
const legacyIds: Record<string, number> = {};
const chains: Record<string, number> = {};
/** The Dex shows these species as another form: the stand-in form, and the file the Dex uses when it is not the form's own file. */
const standInOf = new Map<string, string>([[746, 10127], [964, 11004], [1024, 10276]].map(([species, form]) => [speciesSlug.get(species)!, identityByPickerId.get(form)!.formId]));
const standInSprites: Record<string, string> = {};
for (const [species, formId] of standInOf) {
  const dexStem = stem(dexById.get(identityByForm.get(species)!.speciesDex)!.sprite);
  const formStem = stem(identityByForm.get(formId)!.mon.sprite);
  if (dexStem !== formStem) standInSprites[species] = dexStem;
}

for (const [species, members] of bySpecies) {
  const sorted = [...members].sort((a, b) => comparePickerOrder(a.mon, b.mon));
  const defaultIdentity = sorted.find((identity) => identity.formId === species);
  if (!defaultIdentity || sorted[0] !== defaultIdentity) throw new Error(`${species}: the default form is not first (${sorted[0]?.formId})`);
  const row = defaultIdentity.dexRow!;
  const axes = new Map<string, string[]>();
  const noteAxis = (variety: Record<string, string> | undefined) => {
    for (const [axis, value] of Object.entries(variety ?? {})) {
      const values = axes.get(axis) ?? [];
      if (!values.includes(value)) values.push(value);
      axes.set(axis, values);
    }
  };
  const forms = sorted.map((identity, index): FormEntry | DefaultFormEntry => {
    const facts = factsOf(identity);
    const base = index === 0 ? null : baseOf(identity, defaultIdentity);
    const stated = base ? sparse(facts, factsOf(base), ['types', 'baseStats', 'color', 'shape', 'eggGroups', 'debut', 'obtain']) : { ...facts, ...(facts.obtain === 'standard' ? { obtain: undefined } : {}) };
    const classification = identity.classification;
    if (classification.kind === 'permanent') noteAxis(classification.coordinates.variety);
    const pokeapiForm = identity.dexRow ? idMapByAppId.get(identity.dexRow.id)?.formIdentifier : provenanceById.get(identity.mon.id)?.identifier;
    const sourceOf = FACT_SOURCES(identity, stated);
    const source = identity.dexRow ? undefined : identity.mon.source === 'powerup' && !altById.has(identity.mon.id) ? SOURCE.powerups : SOURCE.altForms;
    if (index > 0 && !identity.dexRow && identity.mon.source !== 'powerup') sourceOf.tools = SOURCE.formPolicy;
    const entry = {
      id: identity.formId,
      ...(classification.kind === 'permanent' ? classification.coordinates : {}),
      ...(classification.kind === 'state' ? { state: { kind: classification.state.kind, ...(classification.state.letter ? { letter: classification.state.letter } : {}), ...(classification.state.teraType ? { teraType: classification.state.teraType } : {}), from: classification.state.from ?? [species] } } : {}),
      ...stated,
      sprite: stem(identity.mon.sprite),
      ...(pokeapiForm && pokeapiForm !== identity.formId ? { externalIds: { pokeapiForm } } : {}),
      ...(index > 0 ? { tools: verdicts(identity, defaultIdentity, facts) } : {}),
      ...(source ? { source } : {}),
      ...(Object.keys(sourceOf).length ? { sourceOf } : {}),
    };
    if (identity.mon.name !== identity.formId) legacyNames[identity.formId] = identity.mon.name;
    if (identity.mon.id !== identity.appId) legacyIds[identity.formId] = identity.mon.id;
    const expectedOwner = expectedOwnerPickerId(identity, sorted);
    if (identity.mon.ownerId !== expectedOwner) legacyOwners[identity.formId] = identityByPickerId.get(identity.mon.ownerId)!.formId;
    return entry as unknown as FormEntry;
  });
  const defaultCoordinates = DEFAULT_COORDINATES[species];
  if (defaultCoordinates?.variety) {
    for (const [axis, value] of Object.entries(defaultCoordinates.variety)) {
      const values = axes.get(axis) ?? [];
      axes.set(axis, [value, ...values.filter((item) => item !== value)]);
    }
  }
  chains[species] = row.evolutionChainId;
  const data: SpeciesFile = {
    source: SOURCE.dex as SpeciesFile['source'],
    species: {
      id: species as SpeciesFile['species']['id'],
      nationalDex: row.id,
      captureRate: row.captureRate,
      growthRate: row.growthRate,
      legendaryClass: row.isMythical ? 'mythical' : RESTRICTED_LEGENDARY_IDS.has(row.id) ? 'restricted' : row.isLegendary ? 'sub-legendary' : ULTRA_BEAST_IDS.has(row.id) ? 'ultra-beast' : 'none',
      tags: row.isBaby ? ['baby'] : [],
      varietyAxes: [...axes].map(([axis, values]) => ({ axis: axis as never, values: values as never })),
      standIn: standInOf.has(species) ? { dex: standInOf.get(species) as never } : {},
    },
    forms: forms as unknown as SpeciesFile['forms'],
    evolutions: sorted.flatMap((identity) => evolutionsInto.get(identity.formId) ?? []),
  };
  speciesFiles.push({ file: `${String(row.id).padStart(4, '0')}-${species}.json`, data });
}

/** The Picker's ownerId as a rule: a Dex row owns itself; a form of a regional Dex row belongs to it; everything else to the species. */
function expectedOwnerPickerId(identity: Identity, members: Identity[]): number {
  if (identity.dexRow) return identity.mon.id;
  const region = regionOf(identity);
  if (region) {
    const regional = members.find((other) => other.dexRow && other.classification.kind === 'permanent' && other.classification.coordinates.region === region && !other.classification.coordinates.variety && !other.classification.coordinates.sex);
    if (regional) return regional.mon.id;
  }
  return members[0].mon.id;
}
function regionOf(identity: Identity): string | undefined {
  if (identity.classification.kind === 'permanent') return identity.classification.coordinates.region;
  const from = identity.classification.state.from;
  if (!from || from === 'any') return undefined;
  return regionOf(identityByForm.get(from[0])!);
}

// ── Write ────────────────────────────────────────────────────────────────────────────────────

// Only the species folder is emptied, so a renamed species leaves no stale file. reports/tool-verdicts.json belongs to ontology:build.
rmSync(join(out, 'species'), { recursive: true, force: true });
for (const { file, data } of speciesFiles) writeJson(join(out, 'species', file), data);
writeJson(join(out, 'ids', 'app-ids.json'), {
  rows: identities.map((identity) => [identity.appId, identity.formId]).sort((a, b) => Number(a[0]) - Number(b[0])),
  retired: [
    { id: 10180, meant: 'stunfisk-galar in the Favorite Picker', why: 'Dex number 10179 wins; the Picker migrates in phase 2.' },
    { id: 10191, meant: 'urshifu-rapid-strike in the Favorite Picker', why: 'Dex number 10227 wins; the Picker migrates in phase 2.' },
  ],
});
writeJson(join(out, 'vocab', 'games.json'), GAMES);
writeJson(join(out, 'vocab', 'regions.json'), [...new Set([...REGIONS, ...GAMES.map((game) => game.region).filter((region): region is string => region !== null)])].map((id) => ({ id })));
const AXIS_NOTES: Record<string, string> = {
  forme: 'An official Forme or Form name with no finer axis: Attack Forme, Origin Forme, Therian Forme, Crowned, Bloodmoon.',
  look: 'A look from a spin-off game or an event: Shadow Lugia, Pokopia outfits.',
  letter: 'Unown letters and punctuation.', pattern: 'Vivillon wing patterns.', trim: 'Furfrou trims.', flower: 'Flabébé line flower colors.',
  season: 'Deerling and Sawsbuck seasons.', side: 'Shellos and Gastrodon seas.', stripe: 'Basculin stripes.', appliance: 'Rotom appliances.',
  cloak: 'Burmy and Wormadam cloaks.', style: 'Urshifu styles and Oricorio dance styles.', cells: 'Zygarde cell share.', paint: 'Magearna colors.',
  cream: 'Alcremie creams.', sweet: 'Alcremie sweets.', breed: 'Paldean Tauros breeds.', plumage: 'Squawkabilly plumages.', mask: 'Ogerpon masks.',
  outfit: 'Pikachu caps and Cosplay outfits.', color: 'A spin-off recolor: Purple Kecleon.',
};
const axesUsed = [...new Set(speciesFiles.flatMap(({ data }) => data.species.varietyAxes.map((axis) => axis.axis)))].sort();
for (const axis of axesUsed) if (!AXIS_NOTES[axis]) throw new Error(`axis "${axis}" has no note`);
writeJson(join(out, 'vocab', 'variety-axes.json'), axesUsed.map((id) => ({ id, note: AXIS_NOTES[id] })));
writeJson(join(out, 'vocab', 'types.json'), TYPE_NAMES.map((id) => ({ id })));
writeJson(join(out, 'vocab', 'colors.json'), COLOR_NAMES.map((id) => ({ id })));
writeJson(join(out, 'vocab', 'shapes.json'), SHAPE_NAMES.map((id) => ({ id })));
writeJson(join(out, 'vocab', 'egg-groups.json'), EGG_GROUP_NAMES.map((id) => ({ id })));
writeJson(join(out, 'vocab', 'growth-rates.json'), [...new Set(dex.map((row) => row.growthRate))].sort().map((id) => ({ id })));
writeJson(join(out, 'vocab', 'species-tags.json'), [{ id: 'baby', note: 'isBaby in pokemon.json' }]);
writeJson(join(out, 'decisions.json'), DECISIONS);
writeJson(join(out, 'sources.json'), Object.values(SOURCE).filter((id) => id.startsWith('legacy:')).map((id) => ({ id, kind: 'legacy-file', ref: id.slice('legacy:'.length) })));
writeJson(join(out, 'legacy', 'picker.json'), { ids: legacyIds, names: legacyNames, owners: legacyOwners });
writeJson(join(out, 'legacy', 'dex.json'), {
  formOrder: dex.flatMap((row, index) => row.id > 1025 ? [{ form: identityByDexId.get(row.id)!.formId, after: identityByDexId.get(dex[index - 1].id)!.formId }] : []),
  standInSprites,
});
writeJson(join(out, 'legacy', 'evolution-chains.json'), chains);
disagreements.sort((a, b) => a.fact.localeCompare(b.fact) || a.form.localeCompare(b.form));
writeJson(join(out, 'reports', 'legacy-disagreements.json'), disagreements);

const stateCount = identities.filter((identity) => identity.classification.kind === 'state').length;
console.log(`${speciesFiles.length} species, ${identities.length} forms (${identities.length - stateCount} permanent, ${stateCount} state), ${disagreements.length} disagreements, ${Object.keys(legacyNames).length} legacy names, ${Object.keys(legacyOwners).length} legacy owners, ${Object.keys(legacyIds).length} legacy ids.`);
