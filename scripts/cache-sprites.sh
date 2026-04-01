#!/usr/bin/env bash
# Downloads all PokeAPI sprites used by the app into public/sprites/
# Run: bash scripts/cache-sprites.sh

set -e
cd "$(dirname "$0")/.."

BASE="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites"
DEST="public/sprites"

mkdir -p "$DEST/pokemon/shiny" "$DEST/types"

# Download helper with retry and validation
download() {
  local url="$1" dest="$2"
  # Skip if file exists and is non-empty
  if [ -s "$dest" ]; then return 0; fi
  for attempt in 1 2 3; do
    curl -sL -o "$dest" "$url"
    if [ -s "$dest" ]; then return 0; fi
    sleep 1
  done
  echo "  WARNING: Failed to download $url after 3 attempts" >&2
  rm -f "$dest"  # Remove empty/corrupt file
}

# 1. Extract all sprite IDs from pokemon.json
echo "Extracting sprite IDs from pokemon.json..."
IDS=$(grep -oP '"sprite":\s*"[^"]+/pokemon/\K\d+' src/data/pokemon.json | sort -un)
TOTAL=$(echo "$IDS" | wc -l)
echo "Found $TOTAL pokemon sprites"

# 2. Download base sprites (skip existing non-empty)
COUNT=0
for id in $IDS; do
  download "$BASE/pokemon/${id}.png" "$DEST/pokemon/${id}.png" &
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
  download "$BASE/pokemon/shiny/${id}.png" "$DEST/pokemon/shiny/${id}.png" &
done
wait
echo "  Shiny sprites done"

# 4. Sprite override (Darmanitan Zen)
download "$BASE/pokemon/10017.png" "$DEST/pokemon/10017.png"

# 5. Type icons (18 types)
echo "Downloading type icons..."
for id in $(seq 1 18); do
  download "$BASE/types/generation-viii/sword-shield/small/${id}.png" "$DEST/types/${id}.png" &
done
wait
echo "  Type icons done"

# 6. Validate all sprites exist
MISSING=0
for id in $IDS; do
  if [ ! -s "$DEST/pokemon/${id}.png" ]; then
    echo "  MISSING: $DEST/pokemon/${id}.png"
    MISSING=$((MISSING + 1))
  fi
done
if [ "$MISSING" -gt 0 ]; then
  echo "WARNING: $MISSING sprites are missing or empty!"
else
  echo "All sprites cached and validated in $DEST/"
fi
