import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual as same } from 'node:util';
import { gzipSync } from 'node:zlib';
import { allPickerMons, pickerDexId, type PickerMon } from '../../src/favorites/model/catalog';
import { pickerPokemonMetadata } from '../../src/favorites/model/metadata';
import type { Pokemon } from '../../src/types/pokemon';

const fields = ['types', 'stats', 'bst', 'shape', 'color', 'captureRate', 'growthRate', 'eggGroups'] as const;
type Field = typeof fields[number];
type Metadata = Pick<Pokemon, Field>;
type Overrides = Record<number, Partial<Metadata>>;
type Identity = Pick<PickerMon, 'id' | 'name'> & { dexId: number };
type Source = { sourcePokemonId: number; sourceSpeciesId: number; sourceForm: string };
type InventoryRow = Identity & Source & { metadata: Metadata };
type Resolved = { identity: Identity; source: Source; values: Partial<Metadata> };
type Explicit = { identity: Identity; source: Source; inherit: Field[]; overrides: Partial<Metadata> };
type ShapeReview = { documentedFormDifferences: { mismatches: {
  pickerId: number; currentName: string; sourceSpeciesId: number; sourceForm: string; listedShapeKey: Pokemon['shape'];
}[] } };

const auditPath = 'docs/favorite-picker-work/form-metadata-audit';
const pins = [
  [`${auditPath}/inventory.json`, 'a935a5585de65a8390cae721b4b7cabaea33077b3c875bc754202e4d6e98d7d0'],
  [`${auditPath}/sources.json`, '80bea079f0a0ef10633759f6913d66265577e9000531837bad7760beb1794e3e'],
  ['docs/favorite-picker-work/form-shape-review/review.json', '1c8cf620c43e79f03eccf0c2e083bdcd83e7af7f8fda1b45ff3320a5c3c200fd'],
] as const;
function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}
for (const [path, expected] of pins) {
  assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), expected, `Pinned oracle changed: ${path}`);
}
const inventory = readJson<InventoryRow[]>(pins[0][0]);
const review = readJson<ShapeReview>(pins[2][0]);
const oracle = new Map(inventory.map(row => [row.id, row]));
const reviewedShapes = new Map(review.documentedFormDifferences.mismatches.map(row => [row.pickerId, row]));
const shared = new Map(readJson<Pokemon[]>('src/data/pokemon.json').map(mon => [mon.id, mon]));
const sparse = readJson<Overrides>('src/favorites/data/formMetadata.json');
const shapes = readJson<Record<number, Pokemon['shape']>>('src/data/form-shapes.json');
const catalog = allPickerMons();
const known = catalog.filter(mon => oracle.has(mon.id));
const uncovered = catalog.filter(mon => !oracle.has(mon.id)).map(mon => ({ id: mon.id, name: mon.name }));
assert.equal(oracle.size, inventory.length, 'Duplicate inventory identities');
assert.equal(known.length, inventory.length, 'Catalog lost an audited identity');
assert.deepEqual(shapes, Object.fromEntries([...reviewedShapes].map(([id, row]) => [id, row.listedShapeKey])));
for (const row of reviewedShapes.values()) {
  const source = oracle.get(row.pickerId)!;
  assert.deepEqual([source.name, source.sourceSpeciesId, source.sourceForm], [row.currentName, row.sourceSpeciesId, row.sourceForm]);
}

function pick(value: Pokemon): Metadata {
  return Object.fromEntries(fields.map(field => [field, value[field]])) as Metadata;
}
function identity(mon: PickerMon): Identity {
  return { id: mon.id, name: mon.name, dexId: pickerDexId(mon) };
}
function sourceOf(id: number): Source {
  const row = oracle.get(id)!;
  return { sourcePokemonId: row.sourcePokemonId, sourceSpeciesId: row.sourceSpeciesId, sourceForm: row.sourceForm };
}
function expectedValues(id: number): Metadata {
  const row = oracle.get(id)!;
  return { ...row.metadata, shape: reviewedShapes.get(id)?.listedShapeKey ?? row.metadata.shape };
}
function snapshot(mon: PickerMon, overrides = sparse, formShapes = shapes): Metadata {
  const base = shared.get(pickerDexId(mon))!;
  return { ...pick(base), ...overrides[mon.id], types: mon.types,
    shape: formShapes[mon.id] ?? overrides[mon.id]?.shape ?? base.shape };
}
function resolved(mon: PickerMon, values = snapshot(mon)): Resolved {
  return { identity: identity(mon), source: sourceOf(mon.id), values };
}
function explicit(mon: PickerMon, values = snapshot(mon)): Explicit {
  const base = shared.get(pickerDexId(mon))!;
  const inherited = fields.filter(field => same(values[field], base[field]));
  return { identity: identity(mon), source: sourceOf(mon.id), inherit: inherited,
    overrides: Object.fromEntries(fields.filter(field => !inherited.includes(field)).map(field => [field, values[field]])) };
}
function validate(row: Resolved | Explicit): string[] {
  const expected = oracle.get(row.identity.id);
  if (!expected) return [`${row.identity.id}: independent metadata source is unavailable`];
  const errors: string[] = [];
  const prefix = `${row.identity.id} ${expected.name}`;
  if (!same(row.identity, { id: expected.id, name: expected.name, dexId: expected.dexId })) errors.push(`${prefix}: catalog identity differs`);
  if (!same(row.source, sourceOf(expected.id))) errors.push(`${prefix}: source identity differs`);
  let values = 'values' in row ? row.values : row.overrides;
  if ('inherit' in row) {
    const base = shared.get(row.identity.dexId);
    assert(base, `Missing biological identity ${row.identity.dexId}`);
    for (const field of fields) {
      const declarations = row.inherit.filter(value => value === field).length + Number(Object.hasOwn(row.overrides, field));
      if (declarations !== 1) errors.push(`${prefix}.${field}: expected exactly one inheritance or override declaration`);
    }
    values = { ...Object.fromEntries(row.inherit.map(field => [field, base[field]])), ...row.overrides };
  }
  const expectedMetadata = expectedValues(expected.id);
  for (const field of fields) {
    if (!same(values[field], expectedMetadata[field])) {
      errors.push(`${prefix}.${field}: expected ${JSON.stringify(expectedMetadata[field])}, received ${JSON.stringify(values[field])}`);
    }
  }
  return errors;
}

for (const mon of catalog) {
  const actual = pickerPokemonMetadata(mon);
  assert(actual, `Missing runtime metadata ${mon.id}`);
  assert.deepEqual(snapshot(mon), pick(actual), `Prototype snapshot differs from the real adapter for ${mon.id}`);
}
const resolvedRows = known.map(mon => resolved(mon));
const explicitRows = known.map(mon => explicit(mon));
assert.deepEqual(resolvedRows.flatMap(validate), [], 'Resolved records differ from the independent oracle');
assert.deepEqual(explicitRows.flatMap(validate), [], 'Explicit records differ from the independent oracle');

const controls: { name: string; result: string; errors: string[] }[] = [];
function observe(name: string, row: Resolved | Explicit, expectedError?: string) {
  const errors = validate(row);
  if (expectedError) assert(errors.some(error => error.includes(expectedError)), `${name}: expected ${expectedError}; received ${JSON.stringify(errors)}`);
  else assert.deepEqual(errors, [], name);
  controls.push({ name, result: expectedError ? 'rejected' : 'accepted', errors });
}
const mega = known.find(mon => mon.id === 10034)!;
const gmax = known.find(mon => mon.id === 10196)!;
const alcremie = known.find(mon => mon.id === 10254)!;
const pinsir = known.find(mon => mon.id === 10040)!;
const removedColor = structuredClone(sparse);
assert.equal(removedColor[mega.id].color, 'black');
delete removedColor[mega.id].color;
const lostColor = snapshot(mega, removedColor);
assert.equal(lostColor.color, 'red');
for (const build of [resolved, explicit]) {
  const variant = build === resolved ? 'resolved' : 'explicit';
  observe(`${variant}: delete required Mega Charizard X color override`, build(mega, lostColor), '.color: expected "black", received "red"');
  observe(`${variant}: restore historical Mega Charizard X type inheritance`, build(mega, { ...snapshot(mega), types: shared.get(6)!.types }), '.types: expected ["fire","dragon"], received ["fire","flying"]');
  const collision = build(alcremie);
  assert.equal(collision.source.sourcePokemonId, 869);
  collision.source.sourcePokemonId = alcremie.id;
  observe(`${variant}: confuse Alcremie local 10254 with source 869`, collision, 'source identity differs');
  const removedShape = { ...shapes };
  delete removedShape[pinsir.id];
  observe(`${variant}: remove approved Mega Pinsir shape`, build(pinsir, snapshot(pinsir, sparse, removedShape)), '.shape: expected "bug-wings", received "humanoid"');
  observe(`${variant}: preserve Gigantamax Charizard species inheritance`, build(gmax));
}
const validInheritance = explicit(gmax);
assert(['shape', 'color', 'growthRate', 'eggGroups'].every(field => validInheritance.inherit.includes(field as Field)));
const missingDeclaration = structuredClone(validInheritance);
missingDeclaration.inherit = missingDeclaration.inherit.filter(field => field !== 'color');
observe('explicit: delete a valid inheritance declaration', missingDeclaration, 'expected exactly one inheritance or override declaration');
const invalidInheritance = explicit(mega);
delete invalidInheritance.overrides.color;
invalidInheritance.inherit.push('color');
observe('explicit: declare inheritance for a differing color', invalidInheritance, '.color: expected "black", received "red"');

function bytes(value: unknown) {
  const json = JSON.stringify(value);
  return { compactJson: Buffer.byteLength(json), gzip9: gzipSync(json, { level: 9 }).length };
}
const comparableSparse = Object.fromEntries(explicitRows.filter(row => Object.keys(row.overrides).length).map(row => [row.identity.id, row.overrides]));
const inheritedFieldCount = explicitRows.reduce((sum, row) => sum + row.inherit.length, 0);
const result = {
  coverage: { verdict: uncovered.length ? 'INCONCLUSIVE' : 'COMPLETE', catalogRecords: catalog.length,
    adapterParityRecords: catalog.length, independentMetadataRecords: known.length, fieldsPerRecord: fields.length,
    validatedFieldValuesPerDesign: known.length * fields.length, approvedShapeExceptions: reviewedShapes.size, uncovered },
  provenance: { pins: pins.map(([path, sha256]) => ({ path, sha256 })),
    rawSourcesReextracted: false, sourceManifestEntries: readJson<unknown[]>(pins[1][0]).length },
  controls,
  inheritance: { inheritedFieldCount, overriddenFieldCount: known.length * fields.length - inheritedFieldCount },
  serializedBytes: {
    measurement: 'JSON data only; not bundle output or performance. Draft provenance stays outside runtime bundles.',
    currentFormMetadata: { records: Object.keys(sparse).length, checkedInBytes: readFileSync('src/favorites/data/formMetadata.json').length, ...bytes(sparse) },
    comparableAuditedSparseValues: bytes(comparableSparse),
    auditedResolvedValues: bytes(Object.fromEntries(resolvedRows.map(row => [row.identity.id, row.values]))),
    allCatalogResolvedValues: bytes(Object.fromEntries(catalog.map(mon => [mon.id, snapshot(mon)]))),
    auditedResolvedWithIdentityAndProvenance: bytes(resolvedRows),
    auditedExplicitWithIdentityAndProvenance: bytes(explicitRows),
  },
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (process.argv.includes('--require-complete') && uncovered.length) process.exitCode = 1;
