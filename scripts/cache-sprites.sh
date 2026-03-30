#!/usr/bin/env bash
# Downloads all PokeAPI sprites used by the app into public/sprites/
# Run: bash scripts/cache-sprites.sh

set -e
cd "$(dirname "$0")/.."

BASE="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites"
DEST="public/sprites"

mkdir -p "$DEST/pokemon/shiny" "$DEST/types"

# 1. Extract all sprite IDs from pokemon.json
echo "Extracting sprite IDs from pokemon.json..."
IDS=$(grep -oP '"sprite":\s*"[^"]+/pokemon/\K\d+' src/data/pokemon.json | sort -un)
TOTAL=$(echo "$IDS" | wc -l)
echo "Found $TOTAL pokemon sprites"

# 2. Download base sprites (skip existing)
COUNT=0
for id in $IDS; do
  if [ ! -f "$DEST/pokemon/${id}.png" ]; then
    curl -sL -o "$DEST/pokemon/${id}.png" "$BASE/pokemon/${id}.png" &
  fi
  COUNT=$((COUNT + 1))
  # Limit concurrency to 20
  if (( COUNT % 20 == 0 )); then
    wait
    echo "  Pokemon sprites: $COUNT/$TOTAL"
  fi
done
wait
echo "  Pokemon sprites: $COUNT/$TOTAL - done"

# 3. Shiny sprites (specific IDs used in archetypes)
echo "Downloading shiny sprites..."
for id in 77 130 147 443 612; do
  if [ ! -f "$DEST/pokemon/shiny/${id}.png" ]; then
    curl -sL -o "$DEST/pokemon/shiny/${id}.png" "$BASE/pokemon/shiny/${id}.png" &
  fi
done
wait
echo "  Shiny sprites done"

# 4. Sprite override (Darmanitan Zen)
if [ ! -f "$DEST/pokemon/10017.png" ]; then
  curl -sL -o "$DEST/pokemon/10017.png" "$BASE/pokemon/10017.png"
fi

# 5. Type icons (18 types)
echo "Downloading type icons..."
for id in $(seq 1 18); do
  if [ ! -f "$DEST/types/${id}.png" ]; then
    curl -sL -o "$DEST/types/${id}.png" "$BASE/types/generation-viii/sword-shield/small/${id}.png" &
  fi
done
wait
echo "  Type icons done"

echo "All sprites cached in $DEST/"
