#!/usr/bin/env python3
"""
Script to add all regional form Pokemon to pokemon.json.
Regional forms covered:
  - Alolan Forms (Gen 7): 18 forms
  - Galarian Forms (Gen 8): 19 forms
  - Hisuian Forms (Gen 8 / Legends: Arceus): 16 forms
  - Paldean Forms (Gen 9): 4 forms (Wooper + 3 Tauros breeds)
"""

import json
import os

POKEMON_JSON_PATH = os.path.join(
    os.path.dirname(__file__), '..', 'src', 'data', 'pokemon.json'
)

def sprite(pokemon_id):
    return f"https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/{pokemon_id}.png"


# ---------------------------------------------------------------------------
# All regional forms data
# Evolution chain IDs match the base-form chains in the existing dataset so
# that regional forms and their base-game counterparts share a chain.
# Where a Gen 8/9 regional form has a *unique* evolution chain in PokeAPI
# (e.g. Hisuian Qwilfish → Overqwil), the existing chain ID of the Kanto/
# Johto base form is re-used because Overqwil / Sneasler are already in the
# data under those chain IDs.
# ---------------------------------------------------------------------------

REGIONAL_FORMS = [

    # =========================================================================
    # ALOLAN FORMS  (generation 7)
    # =========================================================================

    # Alolan Rattata  – Dark/Normal, chain 7, stage 1
    {
        "id": 10091,
        "name": "rattata-alola",
        "types": ["dark", "normal"],
        "stats": {"hp": 30, "atk": 56, "def": 35, "spa": 25, "spd": 35, "spe": 72},
        "bst": 253,
        "generation": 7,
        "evolutionChainId": 7,
        "evolvesFrom": None,
        "evolutionStage": 1,
        "evolutionLevel": None,
        "isLegendary": False,
        "isMythical": False,
        "captureRate": 255,
        "growthRate": "medium",
        "isBaby": False,
        "archetypes": [],
        "sprite": sprite(10091),
    },

    # Alolan Raticate – Dark/Normal, chain 7, stage 2
    {
        "id": 10092,
        "name": "raticate-alola",
        "types": ["dark", "normal"],
        "stats": {"hp": 75, "atk": 71, "def": 70, "spa": 40, "spd": 80, "spe": 77},
        "bst": 413,
        "generation": 7,
        "evolutionChainId": 7,
        "evolvesFrom": 10091,
        "evolutionStage": 2,
        "evolutionLevel": 20,
        "isLegendary": False,
        "isMythical": False,
        "captureRate": 127,
        "growthRate": "medium",
        "isBaby": False,
        "archetypes": [],
        "sprite": sprite(10092),
    },

    # Alolan Raichu – Electric/Psychic, chain 10, stage 3
    {
        "id": 10100,
        "name": "raichu-alola",
        "types": ["electric", "psychic"],
        "stats": {"hp": 60, "atk": 85, "def": 50, "spa": 95, "spd": 85, "spe": 110},
        "bst": 485,
        "generation": 7,
        "evolutionChainId": 10,
        "evolvesFrom": 25,
        "evolutionStage": 3,
        "evolutionLevel": None,
        "isLegendary": False,
        "isMythical": False,
        "captureRate": 75,
        "growthRate": "medium",
        "isBaby": False,
        "archetypes": [],
        "sprite": sprite(10100),
    },

    # Alolan Sandshrew – Ice/Steel, chain 11, stage 1
    {
        "id": 10101,
        "name": "sandshrew-alola",
        "types": ["ice", "steel"],
        "stats": {"hp": 50, "atk": 75, "def": 90, "spa": 10, "spd": 35, "spe": 40},
        "bst": 300,
        "generation": 7,
        "evolutionChainId": 11,
        "evolvesFrom": None,
        "evolutionStage": 1,
        "evolutionLevel": None,
        "isLegendary": False,
        "isMythical": False,
        "captureRate": 255,
        "growthRate": "medium",
        "isBaby": False,
        "archetypes": [],
        "sprite": sprite(10101),
    },

    # Alolan Sandslash – Ice/Steel, chain 11, stage 2
    {
        "id": 10102,
        "name": "sandslash-alola",
        "types": ["ice", "steel"],
        "stats": {"hp": 75, "atk": 100, "def": 120, "spa": 25, "spd": 65, "spe": 65},
        "bst": 450,
        "generation": 7,
        "evolutionChainId": 11,
        "evolvesFrom": 10101,
        "evolutionStage": 2,
        "evolutionLevel": None,
        "isLegendary": False,
        "isMythical": False,
        "captureRate": 90,
        "growthRate": "medium",
        "isBaby": False,
        "archetypes": [],
        "sprite": sprite(10102),
    },

    # Alolan Vulpix – Ice, chain 15, stage 1
    {
        "id": 10103,
        "name": "vulpix-alola",
        "types": ["ice"],
        "stats": {"hp": 38, "atk": 41, "def": 40, "spa": 50, "spd": 65, "spe": 65},
        "bst": 299,
        "generation": 7,
        "evolutionChainId": 15,
        "evolvesFrom": None,
        "evolutionStage": 1,
        "evolutionLevel": None,
        "isLegendary": False,
        "isMythical": False,
        "captureRate": 190,
        "growthRate": "medium-slow",
        "isBaby": False,
        "archetypes": [],
        "sprite": sprite(10103),
    },

    # Alolan Ninetales – Ice/Fairy, chain 15, stage 2
    {
        "id": 10104,
        "name": "ninetales-alola",
        "types": ["ice", "fairy"],
        "stats": {"hp": 73, "atk": 67, "def": 75, "spa": 81, "spd": 100, "spe": 109},
        "bst": 505,
        "generation": 7,
        "evolutionChainId": 15,
        "evolvesFrom": 10103,
        "evolutionStage": 2,
        "evolutionLevel": None,
        "isLegendary": False,
        "isMythical": False,
        "captureRate": 75,
        "growthRate": "medium-slow",
        "isBaby": False,
        "archetypes": [],
        "sprite": sprite(10104),
    },

    # Alolan Diglett – Ground/Steel, chain 21, stage 1
    {
        "id": 10105,
        "name": "diglett-alola",
        "types": ["ground", "steel"],
        "stats": {"hp": 10, "atk": 55, "def": 30, "spa": 35, "spd": 45, "spe": 90},
        "bst": 265,
        "generation": 7,
        "evolutionChainId": 21,
        "evolvesFrom": None,
        "evolutionStage": 1,
        "evolutionLevel": None,
        "isLegendary": False,
        "isMythical": False,
        "captureRate": 255,
        "growthRate": "medium",
        "isBaby": False,
        "archetypes": [],
        "sprite": sprite(10105),
    },

    # Alolan Dugtrio – Ground/Steel, chain 21, stage 2
    {
        "id": 10106,
        "name": "dugtrio-alola",
        "types": ["ground", "steel"],
        "stats": {"hp": 35, "atk": 100, "def": 60, "spa": 50, "spd": 70, "spe": 110},
        "bst": 425,
        "generation": 7,
        "evolutionChainId": 21,
        "evolvesFrom": 10105,
        "evolutionStage": 2,
        "evolutionLevel": 26,
        "isLegendary": False,
        "isMythical": False,
        "captureRate": 50,
        "growthRate": "medium",
        "isBaby": False,
        "archetypes": [],
        "sprite": sprite(10106),
    },

    # Alolan Meowth – Dark, chain 22, stage 1
    {
        "id": 10107,
        "name": "meowth-alola",
        "types": ["dark"],
        "stats": {"hp": 40, "atk": 35, "def": 35, "spa": 50, "spd": 40, "spe": 90},
        "bst": 290,
        "generation": 7,
        "evolutionChainId": 22,
        "evolvesFrom": None,
        "evolutionStage": 1,
        "evolutionLevel": None,
        "isLegendary": False,
        "isMythical": False,
        "captureRate": 255,
        "growthRate": "medium",
        "isBaby": False,
        "archetypes": [],
        "sprite": sprite(10107),
    },

    # Alolan Persian – Dark, chain 22, stage 2
    {
        "id": 10108,
        "name": "persian-alola",
        "types": ["dark"],
        "stats": {"hp": 65, "atk": 60, "def": 60, "spa": 75, "spd": 65, "spe": 115},
        "bst": 440,
        "generation": 7,
        "evolutionChainId": 22,
        "evolvesFrom": 10107,
        "evolutionStage": 2,
        "evolutionLevel": None,
        "isLegendary": False,
        "isMythical": False,
        "captureRate": 90,
        "growthRate": "medium",
        "isBaby": False,
        "archetypes": [],
        "sprite": sprite(10108),
    },

    # Alolan Geodude – Rock/Electric, chain 31, stage 1
    {
        "id": 10109,
        "name": "geodude-alola",
        "types": ["rock", "electric"],
        "stats": {"hp": 40, "atk": 80, "def": 100, "spa": 30, "spd": 30, "spe": 20},
        "bst": 300,
        "generation": 7,
        "evolutionChainId": 31,
        "evolvesFrom": None,
        "evolutionStage": 1,
        "evolutionLevel": None,
        "isLegendary": False,
        "isMythical": False,
        "captureRate": 255,
        "growthRate": "medium-slow",
        "isBaby": False,
        "archetypes": [],
        "sprite": sprite(10109),
    },

    # Alolan Graveler – Rock/Electric, chain 31, stage 2
    {
        "id": 10110,
        "name": "graveler-alola",
        "types": ["rock", "electric"],
        "stats": {"hp": 55, "atk": 95, "def": 115, "spa": 45, "spd": 45, "spe": 35},
        "bst": 390,
        "generation": 7,
        "evolutionChainId": 31,
        "evolvesFrom": 10109,
        "evolutionStage": 2,
        "evolutionLevel": 25,
        "isLegendary": False,
        "isMythical": False,
        "captureRate": 120,
        "growthRate": "medium-slow",
        "isBaby": False,
        "archetypes": [],
        "sprite": sprite(10110),
    },

    # Alolan Golem – Rock/Electric, chain 31, stage 3
    {
        "id": 10111,
        "name": "golem-alola",
        "types": ["rock", "electric"],
        "stats": {"hp": 80, "atk": 120, "def": 130, "spa": 55, "spd": 65, "spe": 45},
        "bst": 495,
        "generation": 7,
        "evolutionChainId": 31,
        "evolvesFrom": 10110,
        "evolutionStage": 3,
        "evolutionLevel": None,
        "isLegendary": False,
        "isMythical": False,
        "captureRate": 45,
        "growthRate": "medium-slow",
        "isBaby": False,
        "archetypes": [],
        "sprite": sprite(10111),
    },

    # Alolan Grimer – Poison/Dark, chain 38, stage 1
    {
        "id": 10112,
        "name": "grimer-alola",
        "types": ["poison", "dark"],
        "stats": {"hp": 80, "atk": 80, "def": 50, "spa": 40, "spd": 50, "spe": 25},
        "bst": 325,
        "generation": 7,
        "evolutionChainId": 38,
        "evolvesFrom": None,
        "evolutionStage": 1,
        "evolutionLevel": None,
        "isLegendary": False,
        "isMythical": False,
        "captureRate": 190,
        "growthRate": "medium",
        "isBaby": False,
        "archetypes": [],
        "sprite": sprite(10112),
    },

    # Alolan Muk – Poison/Dark, chain 38, stage 2
    {
        "id": 10113,
        "name": "muk-alola",
        "types": ["poison", "dark"],
        "stats": {"hp": 105, "atk": 105, "def": 75, "spa": 65, "spd": 100, "spe": 50},
        "bst": 500,
        "generation": 7,
        "evolutionChainId": 38,
        "evolvesFrom": 10112,
        "evolutionStage": 2,
        "evolutionLevel": 38,
        "isLegendary": False,
        "isMythical": False,
        "captureRate": 75,
        "growthRate": "medium",
        "isBaby": False,
        "archetypes": [],
        "sprite": sprite(10113),
    },

    # Alolan Exeggutor – Grass/Dragon, chain 45, stage 2
    {
        "id": 10114,
        "name": "exeggutor-alola",
        "types": ["grass", "dragon"],
        "stats": {"hp": 95, "atk": 105, "def": 85, "spa": 125, "spd": 75, "spe": 45},
        "bst": 530,
        "generation": 7,
        "evolutionChainId": 45,
        "evolvesFrom": 102,
        "evolutionStage": 2,
        "evolutionLevel": None,
        "isLegendary": False,
        "isMythical": False,
        "captureRate": 45,
        "growthRate": "slow",
        "isBaby": False,
        "archetypes": [],
        "sprite": sprite(10114),
    },

    # Alolan Marowak – Fire/Ghost, chain 46, stage 2
    {
        "id": 10115,
        "name": "marowak-alola",
        "types": ["fire", "ghost"],
        "stats": {"hp": 60, "atk": 80, "def": 110, "spa": 50, "spd": 80, "spe": 45},
        "bst": 425,
        "generation": 7,
        "evolutionChainId": 46,
        "evolvesFrom": 104,
        "evolutionStage": 2,
        "evolutionLevel": None,
        "isLegendary": False,
        "isMythical": False,
        "captureRate": 75,
        "growthRate": "medium",
        "isBaby": False,
        "archetypes": [],
        "sprite": sprite(10115),
    },

    # =========================================================================
    # GALARIAN FORMS  (generation 8)
    # =========================================================================

    # Galarian Meowth – Steel, chain 22, stage 1
    {
        "id": 10161,
        "name": "meowth-galar",
        "types": ["steel"],
        "stats": {"hp": 40, "atk": 65, "def": 40, "spa": 40, "spd": 40, "spe": 90},
        "bst": 315,
        "generation": 8,
        "evolutionChainId": 22,
        "evolvesFrom": None,
        "evolutionStage": 1,
        "evolutionLevel": None,
        "isLegendary": False,
        "isMythical": False,
        "captureRate": 255,
        "growthRate": "medium",
        "isBaby": False,
        "archetypes": [],
        "sprite": sprite(10161),
    },

    # Galarian Ponyta – Psychic, chain 32, stage 1
    {
        "id": 10162,
        "name": "ponyta-galar",
        "types": ["psychic"],
        "stats": {"hp": 50, "atk": 85, "def": 55, "spa": 65, "spd": 65, "spe": 90},
        "bst": 410,
        "generation": 8,
        "evolutionChainId": 32,
        "evolvesFrom": None,
        "evolutionStage": 1,
        "evolutionLevel": None,
        "isLegendary": False,
        "isMythical": False,
        "captureRate": 190,
        "growthRate": "medium",
        "isBaby": False,
        "archetypes": [],
        "sprite": sprite(10162),
    },

    # Galarian Rapidash – Psychic/Fairy, chain 32, stage 2
    {
        "id": 10163,
        "name": "rapidash-galar",
        "types": ["psychic", "fairy"],
        "stats": {"hp": 65, "atk": 100, "def": 70, "spa": 80, "spd": 80, "spe": 105},
        "bst": 500,
        "generation": 8,
        "evolutionChainId": 32,
        "evolvesFrom": 10162,
        "evolutionStage": 2,
        "evolutionLevel": 40,
        "isLegendary": False,
        "isMythical": False,
        "captureRate": 60,
        "growthRate": "medium",
        "isBaby": False,
        "archetypes": [],
        "sprite": sprite(10163),
    },

    # Galarian Slowpoke – Psychic, chain 33, stage 1
    {
        "id": 10164,
        "name": "slowpoke-galar",
        "types": ["psychic"],
        "stats": {"hp": 90, "atk": 65, "def": 65, "spa": 40, "spd": 40, "spe": 15},
        "bst": 315,
        "generation": 8,
        "evolutionChainId": 33,
        "evolvesFrom": None,
        "evolutionStage": 1,
        "evolutionLevel": None,
        "isLegendary": False,
        "isMythical": False,
        "captureRate": 190,
        "growthRate": "medium",
        "isBaby": False,
        "archetypes": [],
        "sprite": sprite(10164),
    },

    # Galarian Slowbro – Poison/Psychic, chain 33, stage 2
    {
        "id": 10165,
        "name": "slowbro-galar",
        "types": ["poison", "psychic"],
        "stats": {"hp": 95, "atk": 100, "def": 95, "spa": 100, "spd": 70, "spe": 30},
        "bst": 490,
        "generation": 8,
        "evolutionChainId": 33,
        "evolvesFrom": 10164,
        "evolutionStage": 2,
        "evolutionLevel": None,
        "isLegendary": False,
        "isMythical": False,
        "captureRate": 75,
        "growthRate": "medium",
        "isBaby": False,
        "archetypes": [],
        "sprite": sprite(10165),
    },

    # Galarian Farfetch'd – Fighting, chain 35, stage 1
    {
        "id": 10166,
        "name": "farfetchd-galar",
        "types": ["fighting"],
        "stats": {"hp": 52, "atk": 95, "def": 55, "spa": 58, "spd": 62, "spe": 55},
        "bst": 377,
        "generation": 8,
        "evolutionChainId": 35,
        "evolvesFrom": None,
        "evolutionStage": 1,
        "evolutionLevel": None,
        "isLegendary": False,
        "isMythical": False,
        "captureRate": 45,
        "growthRate": "medium",
        "isBaby": False,
        "archetypes": [],
        "sprite": sprite(10166),
    },

    # Galarian Weezing – Poison/Fairy, chain 49, stage 2
    {
        "id": 10167,
        "name": "weezing-galar",
        "types": ["poison", "fairy"],
        "stats": {"hp": 65, "atk": 90, "def": 120, "spa": 85, "spd": 70, "spe": 60},
        "bst": 490,
        "generation": 8,
        "evolutionChainId": 49,
        "evolvesFrom": 109,
        "evolutionStage": 2,
        "evolutionLevel": 35,
        "isLegendary": False,
        "isMythical": False,
        "captureRate": 60,
        "growthRate": "medium",
        "isBaby": False,
        "archetypes": [],
        "sprite": sprite(10167),
    },

    # Galarian Mr. Mime – Ice/Psychic, chain 57, stage 2
    {
        "id": 10168,
        "name": "mr-mime-galar",
        "types": ["ice", "psychic"],
        "stats": {"hp": 50, "atk": 65, "def": 65, "spa": 90, "spd": 90, "spe": 100},
        "bst": 460,
        "generation": 8,
        "evolutionChainId": 57,
        "evolvesFrom": 439,
        "evolutionStage": 2,
        "evolutionLevel": None,
        "isLegendary": False,
        "isMythical": False,
        "captureRate": 45,
        "growthRate": "medium",
        "isBaby": False,
        "archetypes": [],
        "sprite": sprite(10168),
    },

    # Galarian Articuno – Psychic/Flying, chain 73, stage 1 (legendary)
    {
        "id": 10169,
        "name": "articuno-galar",
        "types": ["psychic", "flying"],
        "stats": {"hp": 90, "atk": 85, "def": 85, "spa": 125, "spd": 100, "spe": 95},
        "bst": 580,
        "generation": 8,
        "evolutionChainId": 73,
        "evolvesFrom": None,
        "evolutionStage": 1,
        "evolutionLevel": None,
        "isLegendary": True,
        "isMythical": False,
        "captureRate": 3,
        "growthRate": "slow",
        "isBaby": False,
        "archetypes": [],
        "sprite": sprite(10169),
    },

    # Galarian Zapdos – Fighting/Flying, chain 74, stage 1 (legendary)
    {
        "id": 10170,
        "name": "zapdos-galar",
        "types": ["fighting", "flying"],
        "stats": {"hp": 90, "atk": 125, "def": 90, "spa": 85, "spd": 90, "spe": 100},
        "bst": 580,
        "generation": 8,
        "evolutionChainId": 74,
        "evolvesFrom": None,
        "evolutionStage": 1,
        "evolutionLevel": None,
        "isLegendary": True,
        "isMythical": False,
        "captureRate": 3,
        "growthRate": "slow",
        "isBaby": False,
        "archetypes": [],
        "sprite": sprite(10170),
    },

    # Galarian Moltres – Dark/Flying, chain 75, stage 1 (legendary)
    {
        "id": 10171,
        "name": "moltres-galar",
        "types": ["dark", "flying"],
        "stats": {"hp": 90, "atk": 85, "def": 90, "spa": 100, "spd": 125, "spe": 90},
        "bst": 580,
        "generation": 8,
        "evolutionChainId": 75,
        "evolvesFrom": None,
        "evolutionStage": 1,
        "evolutionLevel": None,
        "isLegendary": True,
        "isMythical": False,
        "captureRate": 3,
        "growthRate": "slow",
        "isBaby": False,
        "archetypes": [],
        "sprite": sprite(10171),
    },

    # Galarian Slowking – Poison/Psychic, chain 33, stage 2
    {
        "id": 10172,
        "name": "slowking-galar",
        "types": ["poison", "psychic"],
        "stats": {"hp": 95, "atk": 65, "def": 80, "spa": 110, "spd": 110, "spe": 30},
        "bst": 490,
        "generation": 8,
        "evolutionChainId": 33,
        "evolvesFrom": 10164,
        "evolutionStage": 2,
        "evolutionLevel": None,
        "isLegendary": False,
        "isMythical": False,
        "captureRate": 70,
        "growthRate": "medium",
        "isBaby": False,
        "archetypes": [],
        "sprite": sprite(10172),
    },

    # Galarian Corsola – Ghost, chain 113, stage 1
    {
        "id": 10173,
        "name": "corsola-galar",
        "types": ["ghost"],
        "stats": {"hp": 60, "atk": 55, "def": 100, "spa": 65, "spd": 100, "spe": 30},
        "bst": 410,
        "generation": 8,
        "evolutionChainId": 113,
        "evolvesFrom": None,
        "evolutionStage": 1,
        "evolutionLevel": None,
        "isLegendary": False,
        "isMythical": False,
        "captureRate": 60,
        "growthRate": "fast",
        "isBaby": False,
        "archetypes": [],
        "sprite": sprite(10173),
    },

    # Galarian Zigzagoon – Dark/Normal, chain 134, stage 1
    {
        "id": 10174,
        "name": "zigzagoon-galar",
        "types": ["dark", "normal"],
        "stats": {"hp": 38, "atk": 30, "def": 41, "spa": 30, "spd": 41, "spe": 60},
        "bst": 240,
        "generation": 8,
        "evolutionChainId": 134,
        "evolvesFrom": None,
        "evolutionStage": 1,
        "evolutionLevel": None,
        "isLegendary": False,
        "isMythical": False,
        "captureRate": 255,
        "growthRate": "medium",
        "isBaby": False,
        "archetypes": [],
        "sprite": sprite(10174),
    },

    # Galarian Linoone – Dark/Normal, chain 134, stage 2
    {
        "id": 10175,
        "name": "linoone-galar",
        "types": ["dark", "normal"],
        "stats": {"hp": 78, "atk": 70, "def": 61, "spa": 50, "spd": 61, "spe": 100},
        "bst": 420,
        "generation": 8,
        "evolutionChainId": 134,
        "evolvesFrom": 10174,
        "evolutionStage": 2,
        "evolutionLevel": 20,
        "isLegendary": False,
        "isMythical": False,
        "captureRate": 90,
        "growthRate": "medium",
        "isBaby": False,
        "archetypes": [],
        "sprite": sprite(10175),
    },

    # Galarian Darumaka – Ice, chain 277, stage 1
    {
        "id": 10176,
        "name": "darumaka-galar",
        "types": ["ice"],
        "stats": {"hp": 70, "atk": 90, "def": 45, "spa": 15, "spd": 45, "spe": 50},
        "bst": 315,
        "generation": 8,
        "evolutionChainId": 277,
        "evolvesFrom": None,
        "evolutionStage": 1,
        "evolutionLevel": None,
        "isLegendary": False,
        "isMythical": False,
        "captureRate": 120,
        "growthRate": "medium-slow",
        "isBaby": False,
        "archetypes": [],
        "sprite": sprite(10176),
    },

    # Galarian Darmanitan – Ice, chain 277, stage 2
    {
        "id": 10177,
        "name": "darmanitan-galar",
        "types": ["ice"],
        "stats": {"hp": 105, "atk": 140, "def": 55, "spa": 30, "spd": 55, "spe": 95},
        "bst": 480,
        "generation": 8,
        "evolutionChainId": 277,
        "evolvesFrom": 10176,
        "evolutionStage": 2,
        "evolutionLevel": None,
        "isLegendary": False,
        "isMythical": False,
        "captureRate": 60,
        "growthRate": "medium-slow",
        "isBaby": False,
        "archetypes": [],
        "sprite": sprite(10177),
    },

    # Galarian Yamask – Ghost/Ground, chain 282, stage 1
    # NOTE: chain 282 = Kanto Yamask -> Cofagrigus; Galarian branch -> Runerigus (chain 280 per existing data)
    # We follow the existing data: Runerigus has chain 280, so Galarian Yamask uses 280
    {
        "id": 10178,
        "name": "yamask-galar",
        "types": ["ground"],
        "stats": {"hp": 38, "atk": 55, "def": 85, "spa": 30, "spd": 65, "spe": 30},
        "bst": 303,
        "generation": 8,
        "evolutionChainId": 280,
        "evolvesFrom": None,
        "evolutionStage": 1,
        "evolutionLevel": None,
        "isLegendary": False,
        "isMythical": False,
        "captureRate": 190,
        "growthRate": "medium",
        "isBaby": False,
        "archetypes": [],
        "sprite": sprite(10178),
    },

    # Galarian Stunfisk – Ground/Steel, chain 308, stage 1
    {
        "id": 10179,
        "name": "stunfisk-galar",
        "types": ["ground", "steel"],
        "stats": {"hp": 109, "atk": 81, "def": 99, "spa": 66, "spd": 84, "spe": 32},
        "bst": 471,
        "generation": 8,
        "evolutionChainId": 308,
        "evolvesFrom": None,
        "evolutionStage": 1,
        "evolutionLevel": None,
        "isLegendary": False,
        "isMythical": False,
        "captureRate": 75,
        "growthRate": "medium",
        "isBaby": False,
        "archetypes": [],
        "sprite": sprite(10179),
    },

    # =========================================================================
    # HISUIAN FORMS  (generation 8 – Legends: Arceus)
    # =========================================================================

    # Hisuian Growlithe – Fire/Rock, chain 25, stage 1
    {
        "id": 10229,
        "name": "growlithe-hisui",
        "types": ["fire", "rock"],
        "stats": {"hp": 60, "atk": 75, "def": 45, "spa": 65, "spd": 45, "spe": 55},
        "bst": 345,
        "generation": 8,
        "evolutionChainId": 25,
        "evolvesFrom": None,
        "evolutionStage": 1,
        "evolutionLevel": None,
        "isLegendary": False,
        "isMythical": False,
        "captureRate": 190,
        "growthRate": "slow",
        "isBaby": False,
        "archetypes": [],
        "sprite": sprite(10229),
    },

    # Hisuian Arcanine – Fire/Rock, chain 25, stage 2
    {
        "id": 10230,
        "name": "arcanine-hisui",
        "types": ["fire", "rock"],
        "stats": {"hp": 95, "atk": 115, "def": 80, "spa": 95, "spd": 80, "spe": 90},
        "bst": 555,
        "generation": 8,
        "evolutionChainId": 25,
        "evolvesFrom": 10229,
        "evolutionStage": 2,
        "evolutionLevel": None,
        "isLegendary": False,
        "isMythical": False,
        "captureRate": 75,
        "growthRate": "slow",
        "isBaby": False,
        "archetypes": [],
        "sprite": sprite(10230),
    },

    # Hisuian Voltorb – Electric/Grass, chain 44, stage 1
    {
        "id": 10231,
        "name": "voltorb-hisui",
        "types": ["electric", "grass"],
        "stats": {"hp": 40, "atk": 30, "def": 50, "spa": 55, "spd": 55, "spe": 100},
        "bst": 330,
        "generation": 8,
        "evolutionChainId": 44,
        "evolvesFrom": None,
        "evolutionStage": 1,
        "evolutionLevel": None,
        "isLegendary": False,
        "isMythical": False,
        "captureRate": 190,
        "growthRate": "medium",
        "isBaby": False,
        "archetypes": [],
        "sprite": sprite(10231),
    },

    # Hisuian Electrode – Electric/Grass, chain 44, stage 2
    {
        "id": 10232,
        "name": "electrode-hisui",
        "types": ["electric", "grass"],
        "stats": {"hp": 60, "atk": 50, "def": 70, "spa": 80, "spd": 80, "spe": 150},
        "bst": 490,
        "generation": 8,
        "evolutionChainId": 44,
        "evolvesFrom": 10231,
        "evolutionStage": 2,
        "evolutionLevel": None,  # Leaf Stone; no level threshold.
        "isLegendary": False,
        "isMythical": False,
        "captureRate": 60,
        "growthRate": "medium",
        "isBaby": False,
        "archetypes": [],
        "sprite": sprite(10232),
    },

    # Hisuian Typhlosion – Fire/Ghost, chain 80, stage 3
    {
        "id": 10233,
        "name": "typhlosion-hisui",
        "types": ["fire", "ghost"],
        "stats": {"hp": 73, "atk": 84, "def": 78, "spa": 119, "spd": 85, "spe": 95},
        "bst": 534,
        "generation": 8,
        "evolutionChainId": 80,
        "evolvesFrom": 156,
        "evolutionStage": 3,
        "evolutionLevel": 36,
        "isLegendary": False,
        "isMythical": False,
        "captureRate": 45,
        "growthRate": "medium-slow",
        "isBaby": False,
        "archetypes": [],
        "sprite": sprite(10233),
    },

    # Hisuian Qwilfish – Dark/Poison, chain 106, stage 1
    {
        "id": 10234,
        "name": "qwilfish-hisui",
        "types": ["dark", "poison"],
        "stats": {"hp": 65, "atk": 95, "def": 85, "spa": 55, "spd": 55, "spe": 85},
        "bst": 440,
        "generation": 8,
        "evolutionChainId": 501,   # same chain as Overqwil in existing data
        "evolvesFrom": None,
        "evolutionStage": 1,
        "evolutionLevel": None,
        "isLegendary": False,
        "isMythical": False,
        "captureRate": 45,
        "growthRate": "medium",
        "isBaby": False,
        "archetypes": [],
        "sprite": sprite(10234),
    },

    # Hisuian Sneasel – Fighting/Poison, chain 109, stage 1
    {
        "id": 10235,
        "name": "sneasel-hisui",
        "types": ["fighting", "poison"],
        "stats": {"hp": 55, "atk": 95, "def": 55, "spa": 35, "spd": 75, "spe": 115},
        "bst": 430,
        "generation": 8,
        "evolutionChainId": 500,   # same chain as Sneasler in existing data
        "evolvesFrom": None,
        "evolutionStage": 1,
        "evolutionLevel": None,
        "isLegendary": False,
        "isMythical": False,
        "captureRate": 60,
        "growthRate": "medium-slow",
        "isBaby": False,
        "archetypes": [],
        "sprite": sprite(10235),
    },

    # Hisuian Samurott – Water/Dark, chain 253, stage 3
    {
        "id": 10236,
        "name": "samurott-hisui",
        "types": ["water", "dark"],
        "stats": {"hp": 90, "atk": 108, "def": 80, "spa": 100, "spd": 65, "spe": 85},
        "bst": 528,
        "generation": 8,
        "evolutionChainId": 253,
        "evolvesFrom": 502,
        "evolutionStage": 3,
        "evolutionLevel": 36,
        "isLegendary": False,
        "isMythical": False,
        "captureRate": 45,
        "growthRate": "medium-slow",
        "isBaby": False,
        "archetypes": [],
        "sprite": sprite(10236),
    },

    # Hisuian Lilligant – Grass/Fighting, chain 274, stage 2
    {
        "id": 10237,
        "name": "lilligant-hisui",
        "types": ["grass", "fighting"],
        "stats": {"hp": 70, "atk": 105, "def": 75, "spa": 50, "spd": 75, "spe": 105},
        "bst": 480,
        "generation": 8,
        "evolutionChainId": 274,
        "evolvesFrom": 548,
        "evolutionStage": 2,
        "evolutionLevel": None,
        "isLegendary": False,
        "isMythical": False,
        "captureRate": 75,
        "growthRate": "medium",
        "isBaby": False,
        "archetypes": [],
        "sprite": sprite(10237),
    },

    # Hisuian Zorua – Normal/Ghost, chain 286, stage 1
    {
        "id": 10238,
        "name": "zorua-hisui",
        "types": ["normal", "ghost"],
        "stats": {"hp": 35, "atk": 60, "def": 40, "spa": 85, "spd": 40, "spe": 65},
        "bst": 325,
        "generation": 8,
        "evolutionChainId": 286,
        "evolvesFrom": None,
        "evolutionStage": 1,
        "evolutionLevel": None,
        "isLegendary": False,
        "isMythical": False,
        "captureRate": 75,
        "growthRate": "medium-slow",
        "isBaby": False,
        "archetypes": [],
        "sprite": sprite(10238),
    },

    # Hisuian Zoroark – Normal/Ghost, chain 286, stage 2
    {
        "id": 10239,
        "name": "zoroark-hisui",
        "types": ["normal", "ghost"],
        "stats": {"hp": 55, "atk": 100, "def": 60, "spa": 125, "spd": 60, "spe": 110},
        "bst": 510,
        "generation": 8,
        "evolutionChainId": 286,
        "evolvesFrom": 10238,
        "evolutionStage": 2,
        "evolutionLevel": 30,
        "isLegendary": False,
        "isMythical": False,
        "captureRate": 45,
        "growthRate": "medium-slow",
        "isBaby": False,
        "archetypes": [],
        "sprite": sprite(10239),
    },

    # Hisuian Braviary – Psychic/Flying, chain 314, stage 2
    {
        "id": 10240,
        "name": "braviary-hisui",
        "types": ["psychic", "flying"],
        "stats": {"hp": 110, "atk": 83, "def": 70, "spa": 112, "spd": 70, "spe": 65},
        "bst": 510,
        "generation": 8,
        "evolutionChainId": 314,
        "evolvesFrom": 627,
        "evolutionStage": 2,
        "evolutionLevel": 54,
        "isLegendary": False,
        "isMythical": False,
        "captureRate": 60,
        "growthRate": "slow",
        "isBaby": False,
        "archetypes": [],
        "sprite": sprite(10240),
    },

    # Hisuian Sliggoo – Steel/Dragon, chain 375, stage 2
    {
        "id": 10241,
        "name": "sliggoo-hisui",
        "types": ["steel", "dragon"],
        "stats": {"hp": 58, "atk": 75, "def": 83, "spa": 83, "spd": 113, "spe": 40},
        "bst": 452,
        "generation": 8,
        "evolutionChainId": 375,
        "evolvesFrom": 704,
        "evolutionStage": 2,
        "evolutionLevel": 40,
        "isLegendary": False,
        "isMythical": False,
        "captureRate": 45,
        "growthRate": "slow",
        "isBaby": False,
        "archetypes": [],
        "sprite": sprite(10241),
    },

    # Hisuian Goodra – Steel/Dragon, chain 375, stage 3
    {
        "id": 10242,
        "name": "goodra-hisui",
        "types": ["steel", "dragon"],
        "stats": {"hp": 80, "atk": 100, "def": 100, "spa": 110, "spd": 150, "spe": 60},
        "bst": 600,
        "generation": 8,
        "evolutionChainId": 375,
        "evolvesFrom": 10241,
        "evolutionStage": 3,
        "evolutionLevel": 50,
        "isLegendary": False,
        "isMythical": False,
        "captureRate": 45,
        "growthRate": "slow",
        "isBaby": False,
        "archetypes": [],
        "sprite": sprite(10242),
    },

    # Hisuian Avalugg – Ice/Rock, chain 379, stage 2
    {
        "id": 10243,
        "name": "avalugg-hisui",
        "types": ["ice", "rock"],
        "stats": {"hp": 95, "atk": 127, "def": 184, "spa": 34, "spd": 36, "spe": 38},
        "bst": 514,
        "generation": 8,
        "evolutionChainId": 379,
        "evolvesFrom": 712,
        "evolutionStage": 2,
        "evolutionLevel": 37,
        "isLegendary": False,
        "isMythical": False,
        "captureRate": 46,
        "growthRate": "medium",
        "isBaby": False,
        "archetypes": [],
        "sprite": sprite(10243),
    },

    # Hisuian Decidueye – Grass/Fighting, chain 400, stage 3
    {
        "id": 10244,
        "name": "decidueye-hisui",
        "types": ["grass", "fighting"],
        "stats": {"hp": 88, "atk": 112, "def": 80, "spa": 95, "spd": 95, "spe": 60},
        "bst": 530,
        "generation": 8,
        "evolutionChainId": 400,
        "evolvesFrom": 723,
        "evolutionStage": 3,
        "evolutionLevel": 36,
        "isLegendary": False,
        "isMythical": False,
        "captureRate": 45,
        "growthRate": "medium-slow",
        "isBaby": False,
        "archetypes": [],
        "sprite": sprite(10244),
    },

    # =========================================================================
    # PALDEAN FORMS  (generation 9)
    # =========================================================================

    # Paldean Wooper – Poison/Ground, chain 537, stage 1
    # Clodsire (its evolution) already exists in the data under chain 537
    {
        "id": 10253,
        "name": "wooper-paldea",
        "types": ["poison", "ground"],
        "stats": {"hp": 55, "atk": 45, "def": 45, "spa": 25, "spd": 25, "spe": 15},
        "bst": 210,
        "generation": 9,
        "evolutionChainId": 537,
        "evolvesFrom": None,
        "evolutionStage": 1,
        "evolutionLevel": None,
        "isLegendary": False,
        "isMythical": False,
        "captureRate": 255,
        "growthRate": "medium",
        "isBaby": False,
        "archetypes": [],
        "sprite": sprite(10253),
    },

    # Paldean Tauros (Combat Breed) – Fighting, chain 63, stage 1
    {
        "id": 10250,
        "name": "tauros-paldea-combat",
        "types": ["fighting"],
        "stats": {"hp": 75, "atk": 110, "def": 105, "spa": 30, "spd": 70, "spe": 100},
        "bst": 490,
        "generation": 9,
        "evolutionChainId": 63,
        "evolvesFrom": None,
        "evolutionStage": 1,
        "evolutionLevel": None,
        "isLegendary": False,
        "isMythical": False,
        "captureRate": 45,
        "growthRate": "slow",
        "isBaby": False,
        "archetypes": [],
        "sprite": sprite(10250),
    },

    # Paldean Tauros (Blaze Breed) – Fighting/Fire, chain 63, stage 1
    {
        "id": 10251,
        "name": "tauros-paldea-blaze",
        "types": ["fighting", "fire"],
        "stats": {"hp": 75, "atk": 110, "def": 105, "spa": 30, "spd": 70, "spe": 100},
        "bst": 490,
        "generation": 9,
        "evolutionChainId": 63,
        "evolvesFrom": None,
        "evolutionStage": 1,
        "evolutionLevel": None,
        "isLegendary": False,
        "isMythical": False,
        "captureRate": 45,
        "growthRate": "slow",
        "isBaby": False,
        "archetypes": [],
        "sprite": sprite(10251),
    },

    # Paldean Tauros (Aqua Breed) – Fighting/Water, chain 63, stage 1
    {
        "id": 10252,
        "name": "tauros-paldea-aqua",
        "types": ["fighting", "water"],
        "stats": {"hp": 75, "atk": 110, "def": 105, "spa": 30, "spd": 70, "spe": 100},
        "bst": 490,
        "generation": 9,
        "evolutionChainId": 63,
        "evolvesFrom": None,
        "evolutionStage": 1,
        "evolutionLevel": None,
        "isLegendary": False,
        "isMythical": False,
        "captureRate": 45,
        "growthRate": "slow",
        "isBaby": False,
        "archetypes": [],
        "sprite": sprite(10252),
    },
]


def main():
    json_path = os.path.abspath(POKEMON_JSON_PATH)
    print(f"Reading {json_path}")

    with open(json_path, 'r', encoding='utf-8') as f:
        pokemon_list = json.load(f)

    original_count = len(pokemon_list)
    print(f"Original count: {original_count}")

    # Check for duplicates (forms already present by ID or name)
    existing_ids   = {p['id']   for p in pokemon_list}
    existing_names = {p['name'] for p in pokemon_list}

    added = []
    skipped = []
    for form in REGIONAL_FORMS:
        if form['id'] in existing_ids:
            skipped.append(f"ID {form['id']} ({form['name']}) – already exists by ID")
            continue
        if form['name'] in existing_names:
            skipped.append(f"{form['name']} (ID {form['id']}) – already exists by name")
            continue
        pokemon_list.append(form)
        existing_ids.add(form['id'])
        existing_names.add(form['name'])
        added.append(form['name'])

    if skipped:
        print("\nSkipped (already present):")
        for s in skipped:
            print(f"  {s}")

    print(f"\nAdding {len(added)} new regional forms:")
    for name in added:
        print(f"  {name}")

    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(pokemon_list, f, separators=(',', ':'), ensure_ascii=False)

    new_count = len(pokemon_list)
    print(f"\nDone. Total Pokemon: {original_count} → {new_count} (+{new_count - original_count})")


if __name__ == '__main__':
    main()
