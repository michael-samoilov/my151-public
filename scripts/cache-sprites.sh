#!/usr/bin/env bash



set -e
cd "$(dirname "$0")/.."

BASE="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites"
DEST="public/sprites"

mkdir -p "$DEST/pokemon/shiny" "$DEST/types/small"

download() {
  local url="$1" dest="$2"
  if [ -s "$dest" ]; then return 0; fi
  for attempt in 1 2 3; do
    curl -sL -o "$dest" "$url"
    if [ -s "$dest" ]; then return 0; fi
    sleep 1
  done
  echo "  WARNING: Failed to download $url after 3 attempts" >&2
  rm -f "$dest"
}

echo "Extracting sprite IDs from pokemon.json..."
IDS=$(grep -oP '"sprite":\s*"[^"]+/pokemon/\K\d+' src/data/pokemon.json | sort -un)
TOTAL=$(echo "$IDS" | wc -l)
echo "Found $TOTAL pokemon sprites"

COUNT=0
for id in $IDS; do
  download "$BASE/pokemon/${id}.png" "$DEST/pokemon/${id}.png" &
  COUNT=$((COUNT + 1))
  if (( COUNT % 20 == 0 )); then
    wait
    echo "  Pokemon sprites: $COUNT/$TOTAL"
  fi
done
wait
echo "  Pokemon sprites: $COUNT/$TOTAL - done"

echo "Downloading shiny sprites..."
for id in 77 130 147 443 612; do
  download "$BASE/pokemon/shiny/${id}.png" "$DEST/pokemon/shiny/${id}.png" &
done
wait
echo "  Shiny sprites done"

download "$BASE/pokemon/10017.png" "$DEST/pokemon/10017.png"
download "$BASE/pokemon/10127.png" "$DEST/pokemon/10127.png"
download "$BASE/pokemon/10256.png" "$DEST/pokemon/10256.png"
download "$BASE/pokemon/10276.png" "$DEST/pokemon/10276.png"








echo "Downloading type small icons..."
for id in $(seq 1 18); do
  download "$BASE/types/generation-ix/scarlet-violet/small/${id}.png" "$DEST/types/small/${id}.png" &
done
wait
echo "  Type small icons done"

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
