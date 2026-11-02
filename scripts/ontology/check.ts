import { TOOLS } from '../../src/ontology/model';
import type { ResolvedForm } from '../../src/ontology/model';
import type { AppIdLedger, Problem } from './authored';
import { INHERITED_UNSOURCED } from './authored';
import { AUDIT_REPORTS, disagreementsOf, linkedForms, rowKey, type AuditKind, type AuditReport } from './pokeapi/compare';
import { mechanicallyEqual, type Ontology } from './resolve';

export interface CheckEnvironment {
  readonly productionLedger: AppIdLedger | null;
  readonly productionDexNames: ReadonlyMap<number, string>;
  readonly auditReports: { readonly [K in AuditKind]: AuditReport | null };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const LEDGER = 'data/ontology/ids/app-ids.json';
const AUDIT = 'npm run ontology:audit';
const POKEAPI_FORM_FACTS = ['abilities', 'heightDm', 'weightHg'] as const;
const STAT_CHANGING_STEPS = new Set<ResolvedForm['states'][number]['kind']>(['mega', 'primal', 'ultra-burst', 'eternamax']);

export function checkOntology(ontology: Ontology, environment: CheckEnvironment): readonly Problem[] {
  const problems: Problem[] = [];
  const { forms, species, authored } = ontology;
  const report = (file: string, code: string, path: string, message: string) => problems.push({ code, file, path, message });
  const problem = (form: ResolvedForm | null, code: string, path: string, message: string) =>
    report(form ? ontology.fileOf.get(form.id)! : LEDGER, code, path, message);
  const pathOf = (form: ResolvedForm) => `forms[${species.get(form.species)!.forms.indexOf(form.id)}]`;
  const games = new Map(authored.games.map((game) => [game.id, game]));

  for (const entry of species.values()) {
    const members = entry.forms.map((id) => forms.get(id)!);
    const permanent = members.filter((form) => form.states.length === 0);
    for (const [index, form] of permanent.entries()) {
      const twin = permanent.slice(0, index).find((other) => same(other.coordinates, form.coordinates));
      if (twin) problem(form, 'duplicate-coordinates', pathOf(form), `"${form.id}" has the same coordinates as "${twin.id}": ${JSON.stringify(form.coordinates)}; two permanent forms of one species must differ on a facet`);
      if (form.coordinates.sex === 'female') {
        const male = permanent.find((other) => other.coordinates.sex === 'male' && same({ ...other.coordinates, sex: null }, { ...form.coordinates, sex: null }));
        if (!male) problem(form, 'sex-pair-incomplete', `${pathOf(form)}.sex`, `"${form.id}" is a female form with no male form at the same other coordinates; give the default form sex "male"`);
      }
    }
    for (const tool of TOOLS) {
      const shown = members.filter((form) => form.tools[tool] === 'in');
      for (const [index, form] of shown.entries()) {
        const twin = shown.slice(0, index).find((other) => other.sprite === form.sprite && same(other.states, form.states));
        if (twin) problem(form, 'twins-both-shown', `${pathOf(form)}.tools.${tool}`, `"${form.id}" and "${twin.id}" have one sprite and one state chain, and the ${tool} shows both; set ${tool} to { "out": { "mergedInto": "${twin.id}" } }`);
      }
    }
    const states = members.filter((form) => form.states.length > 0);
    for (const [index, form] of states.entries()) {
      const step = form.states[form.states.length - 1];
      const entryForm = forms.get(form.enteredFrom[0])!;
      for (const other of states.slice(0, index)) {
        const otherEntry = forms.get(other.enteredFrom[0])!;
        const twins = same(other.states, form.states) && !same(other.enteredFrom, form.enteredFrom) && mechanicallyEqual(entryForm.facts, otherEntry.facts);
        if (twins && !mechanicallyEqual(form.facts, other.facts)) {
          problem(form, 'state-twin-differs', pathOf(form), `"${form.id}" and "${other.id}" are the same ${step.kind} step entered from forms that differ only in looks, but their types, base stats, or egg groups differ`);
        }
      }
      if (STAT_CHANGING_STEPS.has(step.kind) && same(form.facts.baseStats, entryForm.facts.baseStats)) {
        problem(form, 'state-stats-missing', `${pathOf(form)}.baseStats`, `"${form.id}" is a ${step.kind} step but has "${entryForm.id}"'s base stats; a ${step.kind} step always changes stats, so state baseStats`);
      }
    }
  }

  for (const form of forms.values()) {
    for (const tool of TOOLS) {
      const verdict = form.tools[tool];
      if (verdict === 'in') continue;
      const path = `${pathOf(form)}.tools.${tool}`;
      const reason = verdict.out;
      if (reason === 'battle-state' && form.states.length === 0) problem(form, 'exclusion-reason-false', path, `"${form.id}" claims "battle-state" but has no state step`);
      if (reason === 'spinoff-only' && games.get(form.facts.debut)?.series === 'mainline') problem(form, 'exclusion-reason-false', path, `"${form.id}" claims "spinoff-only" but its debut game "${form.facts.debut}" is mainline`);
      if (reason === 'look-only' && !form.is.lookOnly) problem(form, 'exclusion-reason-false', path, `"${form.id}" claims "look-only" but its types, base stats, or egg groups differ from "${form.species}"`);
      if (typeof reason === 'object' && 'mergedInto' in reason) {
        const target = forms.get(reason.mergedInto)!;
        const claim = `"${form.id}" claims it is merged into "${target.id}"`;
        if (target.species !== form.species) problem(form, 'exclusion-reason-false', path, `${claim}, but the target is a form of another species, "${target.species}"`);
        if (target.sprite !== form.sprite) problem(form, 'exclusion-reason-false', path, `${claim}, but its sprite "${form.sprite}" is not the target's sprite "${target.sprite}"`);
        if (!same(target.states, form.states)) problem(form, 'exclusion-reason-false', path, `${claim}, but its state steps ${JSON.stringify(form.states)} are not the target's ${JSON.stringify(target.states)}`);
        if (target.tools[tool] !== 'in') problem(form, 'exclusion-reason-false', path, `${claim}, but the target is not in the ${tool}, so the ${tool} would show neither`);
      }
    }
    const step = form.states.at(-1);
    if (step?.kind === 'battle-mode' && step.trigger) {
      const without = form.enteredFrom.filter((id) => !Object.values(forms.get(id)!.facts.abilities).includes(step.trigger!.ability));
      if (without.length) problem(form, 'state-trigger-false', `${pathOf(form)}.state.trigger.ability`, `"${form.id}" is triggered by the ability "${step.trigger.ability}", which ${without.join(', ')} does not have`);
    }
    if (form.isDefault && form.appId !== form.nationalDex) problem(null, 'app-id-default', `rows`, `"${form.id}" is a default form, so its number must be its National Dex number ${form.nationalDex}, not ${form.appId}`);
  }

  const seen = new Map<number, string>();
  const retired = new Set(authored.appIds.retired.map((row) => row.id));
  authored.appIds.rows.forEach(([number, form], index) => {
    if (seen.has(number)) problem(null, 'app-id-duplicate', `rows[${index}]`, `${number} is assigned to both "${seen.get(number)}" and "${form}"`);
    seen.set(number, form);
    if (retired.has(number)) problem(null, 'app-id-retired-reused', `rows[${index}]`, `${number} is retired and cannot name "${form}"`);
    if (index > 0 && authored.appIds.rows[index - 1][0] > number) problem(null, 'app-id-order', `rows[${index}]`, `rows must be sorted by number; ${number} follows ${authored.appIds.rows[index - 1][0]}`);
  });
  const formsByNumber = new Map(authored.appIds.rows.map(([number, form]) => [number, form]));
  const numbersByForm = new Map<string, number[]>();
  for (const [number, form] of authored.appIds.rows) numbersByForm.set(form, [...(numbersByForm.get(form) ?? []), number]);
  for (const [form, numbers] of numbersByForm) if (numbers.length > 1) problem(null, 'app-id-duplicate', 'rows', `"${form}" has ${numbers.length} numbers: ${numbers.join(', ')}`);
  if (environment.productionLedger) {
    const production = environment.productionLedger;
    production.rows.forEach(([number, form]) => {
      const now = formsByNumber.get(number);
      if (now === undefined && !retired.has(number)) problem(null, 'app-id-changed-since-production', 'rows', `${number} named "${form}" on production and has no row now; retire it instead of deleting it`);
      else if (now !== undefined && now !== form) problem(null, 'app-id-changed-since-production', 'rows', `${number} named "${form}" on production and names "${now}" now; a number never changes meaning`);
    });
    for (const row of production.retired) if (!retired.has(row.id)) problem(null, 'app-id-changed-since-production', 'retired', `${row.id} was retired on production and is not retired now`);
  }
  for (const [number, name] of environment.productionDexNames) {
    const form = formsByNumber.get(number);
    if (form === undefined) problem(null, 'app-id-changed-since-production', 'rows', `Dex number ${number} ("${name}" in production's pokemon.json) has no ledger row`);
    else if (form !== name) problem(null, 'app-id-changed-since-production', 'rows', `Dex number ${number} names "${name}" in production's pokemon.json and "${form}" in the ledger`);
  }

  const chainOf = authored.legacy.evolutionChains;
  const familyOf = new Map<string, string>();
  const find = (id: string): string => {
    const parent = familyOf.get(id) ?? id;
    if (parent === id) return id;
    const root = find(parent);
    familyOf.set(id, root);
    return root;
  };
  const union = (a: string, b: string) => familyOf.set(find(a), find(b));
  for (const form of forms.values()) for (const edge of form.evolvesFrom) union(forms.get(edge.from)!.species, form.species);
  const rootChains = new Map<string, number>();
  for (const entry of species.values()) {
    const root = find(entry.id);
    const chain = chainOf[entry.id];
    const known = rootChains.get(root);
    if (known === undefined) rootChains.set(root, chain);
    else if (known !== chain) report('data/ontology/legacy/evolution-chains.json', 'legacy-chain-mismatch', entry.id, `"${entry.id}" evolves within the family of chain ${known} but legacy/evolution-chains.json gives it chain ${chain}`);
  }

  const dexForms = [...forms.values()].filter((form) => !form.isDefault && form.tools.dex === 'in').map((form) => form.id);
  const listed = authored.legacy.dex.formOrder.map((row) => row.form);
  if (!same([...dexForms].sort(), [...listed].sort())) {
    const missing = dexForms.filter((id) => !listed.includes(id));
    const extra = listed.filter((id) => !dexForms.includes(id as never));
    report('data/ontology/legacy/dex.json', 'legacy-dex-order', 'formOrder', `legacy/dex.json must list exactly the non-default forms that are in the Dex; missing: ${missing.join(', ') || 'none'}; extra: ${extra.join(', ') || 'none'}`);
  }

  const pokeapiSource = authored.sources.find((source) => source.kind === 'pokeapi-csv')!.id;
  const claimed = new Map<string, ResolvedForm>();
  for (const { form, entry, identity } of linkedForms(ontology)) {
    const path = pathOf(form);
    if (identity.kind === 'form') {
      const other = claimed.get(identity.form.identifier);
      if (other) problem(form, 'pokeapi-identity-duplicate', `${path}.externalIds`, `"${form.id}" and "${other.id}" both name PokeAPI form "${identity.form.identifier}"; one form, one identity`);
      claimed.set(identity.form.identifier, form);
    }
    for (const fact of POKEAPI_FORM_FACTS) {
      const marked = entry.sourceOf?.[fact] === INHERITED_UNSOURCED;
      const known = identity.kind !== 'none' && (fact !== 'abilities' || identity.pokemon.abilities.first !== undefined);
      if (marked && known) problem(form, 'unsourced-fact-known', `${path}.sourceOf.${fact}`, `"${form.id}" marks "${fact}" ${INHERITED_UNSOURCED}, but ${pokeapiSource} knows the form; state the fact with that source or drop the mark`);
      if (!marked && !known && !(fact in entry)) problem(form, 'unsourced-fact-silent', `${path}.sourceOf.${fact}`, `"${form.id}" inherits "${fact}" and ${pokeapiSource} does not know the form; mark sourceOf.${fact} ${INHERITED_UNSOURCED} or state the fact with its source`);
    }
  }

  const decisions = new Set<string>(authored.decisions.map((decision) => decision.id));
  for (const kind of Object.keys(AUDIT_REPORTS) as AuditKind[]) {
    const file = AUDIT_REPORTS[kind];
    const committed = environment.auditReports[kind];
    if (!committed) {
      report(file, 'audit-missing', '', `the report does not exist; run ${AUDIT}`);
      continue;
    }
    if (committed.source !== pokeapiSource) report(file, 'audit-stale', 'source', `the report audits ${committed.source}, the ontology cites ${pokeapiSource}; run ${AUDIT}`);
    const rows = new Map(committed.rows.map((row) => [rowKey(row), row]));
    const live = disagreementsOf[kind](ontology);
    for (const disagreement of live) {
      const form = forms.get(disagreement.form)!;
      const path = `${pathOf(form)}.${disagreement.fact}`;
      const row = rows.get(rowKey(disagreement));
      const describe = `"${form.id}" ${disagreement.fact} is ${JSON.stringify(disagreement.app)} here and ${JSON.stringify(disagreement.source)} in ${pokeapiSource}`;
      if (!row) problem(form, 'audit-unlisted', path, `${describe}; ${file} has no row for it. Run ${AUDIT}, then review the row`);
      else if (!same(row.app, disagreement.app) || !same(row.source, disagreement.source)) problem(form, 'audit-stale', path, `${describe}; the row in ${file} holds other values. Run ${AUDIT}, then review the row`);
      else if (row.review.status === 'unreviewed') problem(form, 'audit-unreviewed', path, `${describe}; the row in ${file} is unreviewed. Set its review to kept with a decision from decisions.json, or open with the evidence on each side`);
      else if (row.review.status === 'kept' && !decisions.has(row.review.decision)) problem(form, 'audit-decision-missing', path, `the row in ${file} cites decision "${row.review.decision}", which is not in decisions.json`);
    }
    const liveKeys = new Set(live.map(rowKey));
    for (const row of committed.rows) if (!liveKeys.has(rowKey(row))) report(file, 'audit-stale', rowKey(row), `"${row.form}" ${row.fact} no longer disagrees with ${pokeapiSource}; run ${AUDIT} to drop the row`);
  }
  return problems;
}
