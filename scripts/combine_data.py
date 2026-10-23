#!/usr/bin/env python3
"""Combine all generation data files into src/data/pokemon.json"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from pokemon_gen1 import GEN1

GEN2 = GEN3 = GEN4 = GEN5 = GEN6 = GEN7 = GEN8 = GEN9 = []

try:
    from pokemon_gen2 import GEN2
except ImportError:
    pass
try:
    from pokemon_gen3 import GEN3
except ImportError:
    pass
try:
    from pokemon_gen4 import GEN4
except ImportError:
    pass
try:
    from pokemon_gen5 import GEN5
except ImportError:
    pass
try:
    from pokemon_gen6 import GEN6
except ImportError:
    pass
try:
    from pokemon_gen7 import GEN7
except ImportError:
    pass
try:
    from pokemon_gen8 import GEN8
except ImportError:
    pass
try:
    from pokemon_gen9 import GEN9
except ImportError:
    pass

try:
    from pokemon_gen2to5 import GEN2 as G2, GEN3 as G3, GEN4 as G4, GEN5 as G5
    if not GEN2: GEN2 = G2
    if not GEN3: GEN3 = G3
    if not GEN4: GEN4 = G4
    if not GEN5: GEN5 = G5
except ImportError:
    pass
try:
    from pokemon_gen6to9 import GEN6 as G6, GEN7 as G7, GEN8 as G8, GEN9 as G9
    if not GEN6: GEN6 = G6
    if not GEN7: GEN7 = G7
    if not GEN8: GEN8 = G8
    if not GEN9: GEN9 = G9
except ImportError:
    pass

GROWTH_MAP = {"s": "slow", "m": "medium", "f": "fast", "ms": "medium-slow", "e": "erratic", "fl": "fluctuating"}

def convert(tuples):
    results = []
    for t in tuples:
        (id_, name, t1, t2, hp, atk, def_, spa, spd, spe, gen, chain, evo_from,
         stage, evo_lvl, is_leg, is_myth, cap_rate, grow, is_baby) = t

        types = [t1] if t2 is None else [t1, t2]
        stats = {"hp": hp, "atk": atk, "def": def_, "spa": spa, "spd": spd, "spe": spe}
        bst = hp + atk + def_ + spa + spd + spe

        results.append({
            "id": id_,
            "name": name,
            "types": types,
            "stats": stats,
            "bst": bst,
            "generation": gen,
            "evolutionChainId": chain,
            "evolvesFrom": evo_from,
            "evolutionStage": stage,
            "evolutionLevel": evo_lvl,
            "isLegendary": bool(is_leg),
            "isMythical": bool(is_myth),
            "captureRate": cap_rate,
            "growthRate": GROWTH_MAP.get(grow, grow),
            "isBaby": bool(is_baby),
            "sprite": f"https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/{id_}.png",
            "archetypes": []
        })
    return results

all_data = []
gen_lists = {"Gen 1": GEN1, "Gen 2": GEN2, "Gen 3": GEN3, "Gen 4": GEN4,
             "Gen 5": GEN5, "Gen 6": GEN6, "Gen 7": GEN7, "Gen 8": GEN8, "Gen 9": GEN9}

for name, gen_data in gen_lists.items():
    count = len(gen_data)
    if count > 0:
        all_data.extend(convert(gen_data))
        print(f"  {name}: {count} Pokemon")
    else:
        print(f"  {name}: MISSING")

all_data.sort(key=lambda x: x["id"])

ids = [p["id"] for p in all_data]
if len(ids) != len(set(ids)):
    dupes = set(id_ for id_ in ids if ids.count(id_) > 1)
    print(f"WARNING: Duplicate IDs found: {dupes}")

out_path = os.path.join(os.path.dirname(__file__), "..", "src", "data", "pokemon.json")
with open(out_path, "w") as f:
    json.dump(all_data, f, separators=(",", ":"))

print(f"\nTotal: {len(all_data)} Pokemon")
print(f"File size: {os.path.getsize(out_path) / 1024:.1f} KB")
