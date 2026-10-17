import { sectionGlyphMask } from '@/lib/sectionGlyph';
import { BAR_H } from '@/league/export/layout';
import type { Pokemon } from '@/types/pokemon';
import { EXPORT_FRAME_PX, EXPORT_SPRITE_PX } from '@/lib/exportPngShape';
import {
  computeOutlineLayout,
  buildOutlines,
  OUTLINE_GAP,
  OUTLINE_PAD,
  OUTLINE_HEAD,
  OUTLINE_STROKE_FRAC,
  OUTLINE_TITLE_VBIAS,
  type LastRowGeom,
  type OutlineShape,
  type Spandrel,
} from '@/lib/sectionOutlines';

const DEX_EXPORT_COLS = 10;
export const DEX_EXPORT_TILE = 48;
export const DEX_EXPORT_SCALE = EXPORT_SPRITE_PX / DEX_EXPORT_TILE;
export const DEX_EXPORT_FRAME = EXPORT_FRAME_PX / DEX_EXPORT_SCALE;
export const DEX_EXPORT_HEADER = BAR_H / DEX_EXPORT_SCALE - DEX_EXPORT_FRAME;
export const DEX_EXPORT_PAD_X = 12;
export const DEX_EXPORT_PAD_TOP = 8;
export const DEX_EXPORT_PAD_BOTTOM = 28;
export const DEX_EXPORT_POKEBALL_R_FRAC = 0.42;

type DexExportSpriteSpot = {
  index: number;
  x: number;
  y: number;
  cx: number;
  cy: number;
  r: number;
  pokemon: Pokemon;
};

type DexExportOutline = {
  gridSlots: number;
  lastRowGeom: LastRowGeom | null;
  lastRowIndex: number;
  pitch: number;
  ox: number;
  oy: number;
  shapes: OutlineShape[];
  spandrels: Spandrel[];
  tileTop: (r: number) => number;
  spandrelMasks: string[];
};

type DexExportGrid = {
  width: number;
  height: number;
  footerTop: number;
  sprites: DexExportSpriteSpot[];
  outline: DexExportOutline | null;
};

function spot(index: number, x: number, y: number, pokemon: Pokemon): DexExportSpriteSpot {
  const half = DEX_EXPORT_TILE / 2;
  return {
    index,
    x,
    y,
    cx: x + half,
    cy: y + half,
    r: DEX_EXPORT_TILE * DEX_EXPORT_POKEBALL_R_FRAC,
    pokemon,
  };
}

export function layoutDexExportGrid(
  pokemon: Pokemon[],
  sections: Record<string, number[]> | null = null,
): DexExportGrid {
  const count = pokemon.length;
  const sprites: DexExportSpriteSpot[] = [];

  if (sections) {
    const oLayout = computeOutlineLayout(pokemon, sections, count, DEX_EXPORT_COLS);
    const gap = DEX_EXPORT_TILE * OUTLINE_GAP;
    const pad = DEX_EXPORT_TILE * OUTLINE_PAD;
    const headroom = DEX_EXPORT_TILE * OUTLINE_HEAD;
    const pitch = DEX_EXPORT_TILE + gap;
    const startRows = oLayout.bandRows;
    const { shapes, spandrels } = buildOutlines(
      oLayout.allRuns,
      DEX_EXPORT_COLS,
      DEX_EXPORT_TILE,
      startRows,
      headroom,
      gap,
      pad,
      OUTLINE_TITLE_VBIAS,
      oLayout.lastRowGeom,
      OUTLINE_STROKE_FRAC,
    );
    const blockTop: number[] = new Array(oLayout.totalRows + 1).fill(0);
    for (let r = 1; r <= oLayout.totalRows; r++) {
      blockTop[r] = blockTop[r - 1] + (startRows.has(r - 1) ? headroom : 0) + DEX_EXPORT_TILE + gap;
    }
    const tileTop = (r: number) => blockTop[r] + (startRows.has(r) ? headroom : 0);
    const contentH = oLayout.rowFactor * DEX_EXPORT_TILE;
    const width = oLayout.colFactor * DEX_EXPORT_TILE + DEX_EXPORT_PAD_X * 2;
    const footerTop = DEX_EXPORT_PAD_TOP + contentH;
    const ox = DEX_EXPORT_PAD_X + pad;
    const oy = DEX_EXPORT_PAD_TOP + pad;

    for (let i = 0; i < count; i++) {
      let x: number;
      let y: number;
      if (i < oLayout.gridSlots) {
        const col = i % DEX_EXPORT_COLS;
        const row = Math.floor(i / DEX_EXPORT_COLS);
        x = ox + col * pitch;
        y = oy + tileTop(row);
      } else {
        const c = i - oLayout.gridSlots;
        const off = oLayout.lastRowGeom ? oLayout.lastRowGeom.offsetCols * pitch : 0;
        x = ox + off + c * pitch;
        y = oy + tileTop(oLayout.lastRowIndex);
      }
      sprites.push(spot(i, x, y, pokemon[i]));
    }

    return {
      width,
      height: footerTop + DEX_EXPORT_PAD_BOTTOM,
      footerTop,
      sprites,
      outline: {
        gridSlots: oLayout.gridSlots,
        lastRowGeom: oLayout.lastRowGeom,
        lastRowIndex: oLayout.lastRowIndex,
        pitch,
        ox,
        oy,
        shapes,
        spandrels,
        tileTop,
        spandrelMasks: [...new Set(spandrels.map((s) => sectionGlyphMask(s.sectionId)).filter((m): m is string => m !== null))],
      },
    };
  }

  const fullRows = Math.floor(count / DEX_EXPORT_COLS);
  const lastRowCount = count % DEX_EXPORT_COLS;
  const totalRows = fullRows + (lastRowCount > 0 ? 1 : 0);
  const width = DEX_EXPORT_COLS * DEX_EXPORT_TILE + DEX_EXPORT_PAD_X * 2;
  const footerTop = DEX_EXPORT_PAD_TOP + totalRows * DEX_EXPORT_TILE;

  for (let i = 0; i < fullRows * DEX_EXPORT_COLS; i++) {
    const col = i % DEX_EXPORT_COLS;
    const row = Math.floor(i / DEX_EXPORT_COLS);
    sprites.push(
      spot(i, DEX_EXPORT_PAD_X + col * DEX_EXPORT_TILE, DEX_EXPORT_PAD_TOP + row * DEX_EXPORT_TILE, pokemon[i]),
    );
  }
  if (lastRowCount > 0) {
    const lastRowW = lastRowCount * DEX_EXPORT_TILE;
    const lastRowX = (width - lastRowW) / 2;
    for (let i = 0; i < lastRowCount; i++) {
      const idx = fullRows * DEX_EXPORT_COLS + i;
      sprites.push(
        spot(
          idx,
          lastRowX + i * DEX_EXPORT_TILE,
          DEX_EXPORT_PAD_TOP + fullRows * DEX_EXPORT_TILE,
          pokemon[idx],
        ),
      );
    }
  }

  return {
    width,
    height: footerTop + DEX_EXPORT_PAD_BOTTOM,
    footerTop,
    sprites,
    outline: null,
  };
}
