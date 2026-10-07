/** Local saved IDs are not upstream Pokémon IDs. Bind reviewed identities to names. */
import { readFileSync } from 'node:fs';
const reviewed = JSON.parse(readFileSync(new URL('./i18n/pokemon-id-map.json', import.meta.url), 'utf8'));
const identities = new Map(reviewed.entries.map(entry => [entry.appId, entry]));
export function sourceSpeciesId(pokemon) {
  const identity = identities.get(pokemon.id);
  if (!identity || identity.appName !== pokemon.name) {
    throw new Error(`Unreviewed upstream identity: ${pokemon.id} ${pokemon.name}. Refresh scripts/i18n/pokemon-id-map.json.`);
  }
  return identity.speciesId;
}
