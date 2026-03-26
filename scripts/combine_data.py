#!/usr/bin/env python3
"""Combine all generation data files into src/data/pokemon.json"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from pokemon_gen1 import GEN1

try:
    from pokemon_gen2to5 import GEN2, GEN3, GEN4, GEN5
except ImportError:
    print("Warning: pokemon_gen2to5.py not found, using Gen1 only")
    GEN2 = GEN3 = GEN4 = GEN5 = []

try:
    from pokemon_gen6to9 import GEN6, GEN7, GEN8, GEN9
except ImportError:
    print("Warning: pokemon_gen6to9.py not found, using Gen1-5 only")
    GEN6 = GEN7 = GEN8 = GEN9 = []

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
for gen_data in [GEN1, GEN2, GEN3, GEN4, GEN5, GEN6, GEN7, GEN8, GEN9]:
    all_data.extend(convert(gen_data))

all_data.sort(key=lambda x: x["id"])

# Verify no duplicates
ids = [p["id"] for p in all_data]
if len(ids) != len(set(ids)):
    dupes = [id_ for id_ in ids if ids.count(id_) > 1]
    print(f"WARNING: Duplicate IDs found: {set(dupes)}")

out_path = os.path.join(os.path.dirname(__file__), "..", "src", "data", "pokemon.json")
with open(out_path, "w") as f:
    json.dump(all_data, f, separators=(",", ":"))

print(f"Wrote {len(all_data)} Pokemon to {out_path}")
print(f"File size: {os.path.getsize(out_path) / 1024:.1f} KB")

# Show gen breakdown
from collections import Counter
gen_counts = Counter(p["generation"] for p in all_data)
for gen in sorted(gen_counts):
    print(f"  Gen {gen}: {gen_counts[gen]} Pokemon")
