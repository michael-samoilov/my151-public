#!/usr/bin/env bash
# Writes the smaller `srcset` candidates of the Pokédex intro screenshots, next
# to each original as `<name>-<width>.webp`. See `SHOT_SRCSETS` in
# src/components/pokedex/IntroCard.tsx. Run it again after re-exporting an
# original. It needs ffmpeg built with libwebp.
#
# The hub has no copies: every device loads its 800px originals, because the
# copies drew at about their own size and looked soft.
#
# Each intro scale keeps its original's exact aspect ratio, so a card's width
# cannot shift. Quality 86 is the default. The detailed 151 pair uses 82 to stay
# within the existing Pokédex image budget after its native frame became wider.
set -euo pipefail
cd "$(dirname "$0")/.."

resize() { # <original> <width> <height, or -1 to keep the aspect ratio> <filter> [quality]
  ffmpeg -v error -y -i "$1" -vf "scale=$2:$3:flags=$4" \
    -c:v libwebp -quality "${5:-86}" -compression_level 6 "${1%.webp}-$2.webp"
}

resize src/assets/intro/shot-45.webp 234 372 lanczos
resize src/assets/intro/shot-95-outlines.webp 261 465 lanczos
resize src/assets/intro/shot-151-stats.webp 444 -1 lanczos 82
