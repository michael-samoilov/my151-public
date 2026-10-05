#!/usr/bin/env bash
# Writes the smaller `srcset` candidates of the hub and Pokédex intro
# screenshots, next to each original as `<name>-<width>.webp`. Each copy covers
# the image's size on a 3x phone; the originals stay for 2x desktops and
# landscape phones. See `SHOT_SIZES` in src/components/home/HomePage.tsx and
# `SHOT_SRCSETS` in src/components/pokedex/IntroCard.tsx. Run it again after
# re-exporting an original. It needs ffmpeg built with libwebp.
#
# The hub copies are exactly half size. A box filter (`area`) makes the same
# half-size image as Chrome's mipmap of the original, so a phone draws the copy
# closer to the original than Lanczos does. The intro scales are not halves;
# each keeps its original's exact aspect ratio, so a card's width cannot shift.
# Quality 86 is the default. The detailed 151 pair uses 82 to stay within
# the existing Pokédex image budget after its native frame became wider.
set -euo pipefail
cd "$(dirname "$0")/.."

resize() { # <original> <width> <height, or -1 to keep the aspect ratio> <filter> [quality]
  ffmpeg -v error -y -i "$1" -vf "scale=$2:$3:flags=$4" \
    -c:v libwebp -quality "${5:-86}" -compression_level 6 "${1%.webp}-$2.webp"
}

for shot in tool-dex tool-dex-b tool-league tool-league-b; do
  resize "src/assets/home/$shot.webp" 400 -1 area
done
resize src/assets/intro/shot-45.webp 234 372 lanczos
resize src/assets/intro/shot-95-outlines.webp 261 465 lanczos
resize src/assets/intro/shot-151-stats.webp 444 -1 lanczos 82
