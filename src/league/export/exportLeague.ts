/**
 * The league's two exports, drawn on a canvas.
 *
 * `exportGymCard` renders one trainer's card; `exportLeagueHome` renders the
 * league summary at whichever team toggle is on screen. Both return a PNG blob
 * for `shareOrDownload`, which is the dex export's own platform path: the iOS
 * share sheet saves to Photos, Android takes the download so the gallery scans
 * it, and desktop gets a file.
 *
 * Nothing is rasterized from the DOM. The dex export settled that: an
 * html-to-image pass needs an SVG `<foreignObject>`, which hangs on iOS WebKit.
 * So the picture is redrawn from the same geometry the components lay out
 * with, and `layout.ts` holds the numbers both agree on.
 */

import type { TypeName } from '@/types/pokemon';
import { TYPE_COLORS } from '@/data/type-colors';
import { typeIconPath, typeGlyphPath } from '@/data/type-ids';
import { getPokemonById } from '@/hooks/usePokemonData';
import { drawTypeBadge } from '@/lib/drawTypeBadge';
import { TYPE_BADGE_H, TYPE_BADGE_W } from '@/lib/typeBadgeGeometry';
import { expandTemplate } from '@/lib/richTemplate';
import { raw } from '@/i18n';
import type { GymCard, LeagueView } from '../store/useLeagueStore';
import { legendsOf, powerupsAt } from '../store/useLeagueStore';
import { deriveRow, signatureMember } from '../model/engine';
import { formAt, type PowerupForm } from '../model/powerups';
import { SLOT_COUNT, slotKind, slotRow } from '../model/constants';
import { cardShades, type CardShades } from '../theme';
import { getMoveById, CATEGORY_COLORS, type Move } from '../moves';
import { placeSlot, seamEnds, type Runs } from '../slotLayout';
import * as L from './layout';
import {
  drawBossBall,
  drawCrown,
  drawDiamonds,
  drawEmptyBall,
  drawFourPointStar,
  drawHexagon,
  drawPokeballBg,
  drawSprite,
  drawStars,
  drawTmDisc,
  ellipsize,
  fitFontSize,
  fillTracked,
  fillTrackedCentered,
  font,
  FONT_STACK,
  roundRect,
  trackedWidth,
  wrapLines,
} from './paint';

/** One name each, whatever the league is called and whoever is on the card. */
export const CARD_FILENAME = 'my151-trainer-card.png';
export const HOME_FILENAME = 'my151-league.png';

const PAGE_BG = '#f7f7f8';
const FG = '#0a0a0a';
const RED = '#DC2626';
const MUTED = '#737373';
const GREY = '#a3a3a3';
const ZINC = '#a1a1aa';
const NO_TYPE = '#9CA3AF';
const HOME_LINE = '#f0f0f1';

/**
 * The backing store's ceiling, in device pixels.
 *
 * iOS Safari refuses a canvas past roughly 16.7M pixels: `toBlob` never fires
 * its callback and the export spinner hangs. The dex export caps at the same
 * number; neither league page is near it at 1×, so this only ever matters if
 * the card grows.
 */
const MAX_CANVAS_AREA = 16_000_000;

// ---------- reading a card ----------

/** The ace and the partner: the two Pokémon the showcase draws. */
export function showcasePair(card: GymCard): { ace: number | null; partner: number | null } {
  const seat = card.signatureSeat;
  const ace = seat === null ? null : signatureMember(card.lines[seat - 1], card.signatureId ?? null);
  return { ace, partner: card.partnerId ?? null };
}

export interface ExportCell {
  seat: number;
  pokemonId: number | null;
  form: PowerupForm | null;
}

/** One row of the card, with each seat's powerup form already resolved. */
export function exportRow(card: GymCard, row: number): ExportCell[] {
  const cells = deriveRow(card.lines, row, row === L.BOSS_ROW ? legendsOf(card) : []);
  const powerups = powerupsAt(card, row);
  return cells.map((c) => ({
    seat: c.seat,
    pokemonId: c.pokemonId,
    form: formAt(powerups, row, c.seat, c.pokemonId),
  }));
}

/** A seat's sprite, or null when the seat is empty or the id is unknown. */
function spriteUrl(pokemonId: number | null, form: PowerupForm | null): string | null {
  if (form) return `/sprites/pokemon/${form.id}.png`;
  if (pokemonId === null) return null;
  return getPokemonById(pokemonId)?.sprite ?? `/sprites/pokemon/${pokemonId}.png`;
}

/** The two colours a Pokémon's pokeball is painted in. */
function ballColours(pokemonId: number): [string, string] {
  const types = getPokemonById(pokemonId)?.types ?? [];
  const primary = TYPE_COLORS[types[0] as TypeName] ?? NO_TYPE;
  const secondary = TYPE_COLORS[(types[1] ?? types[0]) as TypeName] ?? primary;
  return [primary, secondary];
}

// ---------- images ----------

type Images = Map<string, HTMLImageElement>;

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    // A missing sprite degrades to an empty cell rather than failing the
    // export: one 404 should not cost the user their picture.
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function loadAll(urls: Iterable<string>): Promise<Images> {
  const unique = [...new Set(urls)];
  const loaded = await Promise.all(unique.map(loadImage));
  const out: Images = new Map();
  unique.forEach((url, i) => {
    const img = loaded[i];
    if (img) out.set(url, img);
  });
  return out;
}

/** Every image one gym card needs. */
function cardImageUrls(card: GymCard): string[] {
  const urls: string[] = [];
  if (card.type && card.type !== 'none') urls.push(typeIconPath(card.type));
  const { ace, partner } = showcasePair(card);
  for (const id of [ace, partner]) {
    const url = spriteUrl(id, null);
    if (url) urls.push(url);
  }
  for (let row = 1; row <= L.ROW_COUNT; row++) {
    for (const cell of exportRow(card, row)) {
      const url = spriteUrl(cell.pokemonId, cell.form);
      if (url) urls.push(url);
    }
  }
  const move = card.tmMoveId === null ? undefined : getMoveById(card.tmMoveId);
  if (move) {
    urls.push(typeGlyphPath(move.type as TypeName));
    urls.push(`/sprites/moves/${move.category}.png`);
  }
  return urls;
}

/** Every image the league home needs. */
function homeImageUrls(cards: GymCard[], view: LeagueView): string[] {
  const urls: string[] = [];
  cards.forEach((card, index) => {
    if (card.type && card.type !== 'none') urls.push(typeIconPath(card.type));
    if (card.lines.length === 0) return;
    const row = view === 'rematch' ? L.BOSS_ROW : slotRow(index);
    for (const cell of exportRow(card, row)) {
      const url = spriteUrl(cell.pokemonId, cell.form);
      if (url) urls.push(url);
    }
  });
  return urls;
}

// ---------- shared chrome ----------

/** The soft shadow both cards sit on, matching their CSS. */
function withCardShadow(ctx: CanvasRenderingContext2D, draw: () => void): void {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.06)';
  ctx.shadowBlur = 32;
  ctx.shadowOffsetY = 8;
  draw();
  ctx.restore();
  // A second, tighter pass for the 2px shadow under the same edge.
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.06)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 2;
  draw();
  ctx.restore();
}

/**
 * "<what this is> · made with my151.app", centred in the footer strip.
 *
 * The credit is the dex poster's translated template, so the two tools carry
 * one credit. The wordmark is a brand asset rather than copy: it stays
 * my151.app in every locale and only its place in the sentence is translated.
 * The prefix names the picture — the trainer card template is /vp/'s, and
 * the league is this tool's — in the muted grey the app's own labels use.
 */
function drawCredit(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  prefix: string,
): void {
  const segs = [
    { text: `${prefix} · `, color: MUTED },
    ...expandTemplate<{ text: string; color: string }>(
      raw('poster.credit'),
      (text) => ({ text, color: ZINC }),
      {
        app: () => [
          { text: 'my151', color: RED },
          { text: '.app', color: FG },
        ],
      },
    ),
  ];
  ctx.save();
  ctx.font = font(size, 600);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const total = segs.reduce((sum, s) => sum + ctx.measureText(s.text).width, 0);
  let x = cx - total / 2;
  for (const seg of segs) {
    ctx.fillStyle = seg.color;
    ctx.fillText(seg.text, x, cy);
    x += ctx.measureText(seg.text).width;
  }
  ctx.restore();
}

/**
 * The type square: the chosen type's icon, or the no-type grey and its star.
 *
 * An unset type exports as "no type" rather than as the app's red "+ TYPE"
 * prompt. The prompt is a control — it asks the card's owner to do something —
 * and a picture they hand to someone else has nothing to press.
 */
function drawTypeMark(
  ctx: CanvasRenderingContext2D,
  type: GymCard['type'],
  images: Images,
  x: number,
  y: number,
  size: number,
  radius: number,
): void {
  const icon = type && type !== 'none' ? images.get(typeIconPath(type)) : undefined;
  if (icon) {
    ctx.save();
    roundRect(ctx, x, y, size, size, radius);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(icon, x, y, size, size);
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.fillStyle = NO_TYPE;
  roundRect(ctx, x, y, size, size, radius);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  drawFourPointStar(ctx, x + size / 2, y + size / 2, (size * 7) / 22);
  ctx.restore();
}

/** Cap height at the current font — what a reader lines two runs up by. */
function capHeight(ctx: CanvasRenderingContext2D): number {
  const m = ctx.measureText('H');
  return m.actualBoundingBoxAscent || parseFloat(ctx.font) * 0.72;
}

// ---------- the gym card ----------

const ACE_HEAD = ['ACE', 'POKÉMON'];
const PARTNER_HEAD = ['PARTNER /', 'SHOULDERMON'];
const SIG_HEAD = ['SIGNATURE', 'POKÉMON'];

/** The width of a two-line heading run, at the heading's own size. */
function headWidth(ctx: CanvasRenderingContext2D, lines: string[]): number {
  ctx.font = font(L.HEAD_PX, 800);
  return Math.max(...lines.map((line) => trackedWidth(ctx, line, L.HEAD_TRACK)));
}

/** A two-line heading, centred on `cx`, its first line's top at `top`. */
function drawHeading(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  cx: number,
  top: number,
  colour: string,
): void {
  ctx.save();
  ctx.font = font(L.HEAD_PX, 800);
  ctx.fillStyle = colour;
  ctx.textBaseline = 'middle';
  lines.forEach((line, i) => {
    fillTrackedCentered(ctx, line, cx, top + (i + 0.5) * L.HEAD_LINE, L.HEAD_TRACK);
  });
  ctx.restore();
}

/** A chosen Pokémon on its two-tone ball. */
function drawShowcaseArt(
  ctx: CanvasRenderingContext2D,
  pokemonId: number,
  images: Images,
  cx: number,
  cy: number,
  sprite: number,
): void {
  const [primary, secondary] = ballColours(pokemonId);
  drawPokeballBg(ctx, primary, secondary, sprite / 1.2, cx, cy);
  const img = images.get(spriteUrl(pokemonId, null) ?? '');
  if (img) drawSprite(ctx, img, cx, cy, sprite);
}

function drawShowcase(
  ctx: CanvasRenderingContext2D,
  card: GymCard,
  shades: CardShades,
  images: Images,
  ox: number,
  oy: number,
): void {
  const box = L.showcaseBox();
  const x = ox + box.left;
  const y = oy + box.top;
  const { ace, partner } = showcasePair(card);
  const pair = ace !== null && partner !== null && ace !== partner;
  const solo = ace ?? partner;
  const filled = solo !== null;
  const headH = 2 * L.HEAD_LINE;

  ctx.save();
  ctx.fillStyle = filled ? '#ffffff' : 'rgba(255,255,255,0.65)';
  roundRect(ctx, x, y, box.width, box.height, L.SLOT_R);
  ctx.fill();
  if (!filled) {
    ctx.strokeStyle = shades.dash;
    ctx.lineWidth = L.K;
    ctx.setLineDash([4 * L.K, 4 * L.K]);
    roundRect(ctx, x, y, box.width, box.height, L.SLOT_R);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();

  if (pair) {
    // The app's own solver, run with the name runs emptied and the sprite
    // pinned: the headings still decide where the two blocks sit, and the
    // sprite no longer has to earn its size from the room the names left.
    const aceRuns: Runs = { head: [headWidth(ctx, ACE_HEAD), headH], name: [0, 0] };
    const partnerRuns: Runs = { head: [headWidth(ctx, PARTNER_HEAD), headH], name: [0, 0] };
    const slot = placeSlot(box.width, box.height, aceRuns, partnerRuns, L.PAIR_SPRITE);
    const seam = seamEnds(box.width, box.height);

    ctx.save();
    ctx.strokeStyle = shades.dash;
    ctx.lineWidth = L.K;
    ctx.beginPath();
    ctx.moveTo(x + seam.x1 * box.width, y + seam.y1 * box.height);
    ctx.lineTo(x + seam.x2 * box.width, y + seam.y2 * box.height);
    ctx.stroke();
    ctx.restore();

    const half = (
      placed: (typeof slot)['ace'],
      lines: string[],
      pokemonId: number,
      mirrored: boolean,
    ) => {
      const cx = x + placed.left + placed.width / 2;
      const cy = y + placed.top + (mirrored ? placed.sprite / 2 : headH + placed.sprite / 2);
      drawShowcaseArt(ctx, pokemonId, images, cx, cy, placed.sprite);
      const headTop = mirrored ? cy + placed.sprite / 2 : cy - placed.sprite / 2 - headH;
      drawHeading(ctx, lines, cx, headTop, shades.band);
    };
    half(slot.ace, ACE_HEAD, ace, false);
    half(slot.partner, PARTNER_HEAD, partner, true);
    return;
  }

  const cx = x + box.width / 2;
  const gap = 12;

  if (filled) {
    // One Pokémon, or the same one in both slots: the signature, centred. It
    // has the whole slot and no seam to share, so it takes the 2× sprite.
    const total = headH + gap + L.SIG_SPRITE;
    const top = y + (box.height - total) / 2;
    drawHeading(ctx, SIG_HEAD, cx, top, shades.band);
    drawShowcaseArt(ctx, solo, images, cx, top + headH + gap + L.SIG_SPRITE / 2, L.SIG_SPRITE);
    return;
  }

  // The placeholder copy is set at the hint size the TM and badge boxes use
  // for theirs, and wraps inside four fifths of the box. At the name size it
  // ran edge to edge of the slot.
  const ring = Math.round((0.8 / 1.2) * (92 / 204) * box.height);
  ctx.font = font(L.HINT_PX, 500);
  const lineH = L.HINT_PX * 1.25;
  const lines = wrapLines(ctx, 'No signature Pokémon', box.width * 0.8, 2);
  const total = headH + gap + ring + gap + lines.length * lineH;
  const top = y + (box.height - total) / 2;
  drawHeading(ctx, SIG_HEAD, cx, top, shades.hint);
  drawEmptyBall(ctx, ring, cx, top + headH + gap + ring / 2);
  ctx.save();
  ctx.font = font(L.HINT_PX, 500);
  ctx.fillStyle = shades.hint;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((line, i) => {
    ctx.fillText(line, cx, top + headH + gap + ring + gap + (i + 0.5) * lineH);
  });
  ctx.restore();
}

/** The mark column both the TM and the badge slot open with. */
function drawMarkColumn(
  ctx: CanvasRenderingContext2D,
  word: string,
  colour: string,
  cx: number,
  cy: number,
  drawGlyph: (size: number, x: number, y: number) => void,
): void {
  const glyph = L.MARK_COL * 0.72;
  ctx.save();
  ctx.font = font(L.MARK_LABEL_PX, 800);
  const labelH = L.MARK_LABEL_PX * 1.2;
  const total = glyph + labelH - L.K;
  const top = cy - total / 2;
  drawGlyph(glyph, cx - glyph / 2, top);
  ctx.fillStyle = colour;
  ctx.textBaseline = 'middle';
  fillTrackedCentered(ctx, word, cx, top + glyph - L.K + labelH / 2, L.MARK_TRACK);
  ctx.restore();
}

function drawSlotBox(
  ctx: CanvasRenderingContext2D,
  shades: CardShades,
  filled: boolean,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  ctx.save();
  ctx.fillStyle = filled ? '#ffffff' : 'rgba(255,255,255,0.65)';
  roundRect(ctx, x, y, w, h, L.SLOT_R);
  ctx.fill();
  if (!filled) {
    ctx.strokeStyle = shades.dash;
    ctx.lineWidth = L.K;
    ctx.setLineDash([4 * L.K, 4 * L.K]);
    roundRect(ctx, x, y, w, h, L.SLOT_R);
    ctx.stroke();
  }
  ctx.restore();
}

function drawTmSlot(
  ctx: CanvasRenderingContext2D,
  move: Move | undefined,
  shades: CardShades,
  images: Images,
  ox: number,
  oy: number,
): void {
  const { left, width } = L.slotX(1, 2);
  const x = ox + left;
  const y = oy + L.rowTop(5) + L.INY;
  const h = 1.5 * L.ROW - 2 * L.INY;
  drawSlotBox(ctx, shades, !!move, x, y, width, h);

  const markCx = x + L.MARK_PAD + L.MARK_COL / 2;
  const cy = y + h / 2;
  const bodyX = x + L.MARK_PAD + L.MARK_COL + L.MARK_PAD;
  const bodyW = width - (bodyX - x) - L.MARK_PAD;

  if (!move) {
    drawMarkColumn(ctx, 'TM', shades.hint, markCx, cy, (size, gx, gy) =>
      drawTmDisc(ctx, shades.dash, size, gx, gy),
    );
    ctx.save();
    ctx.font = font(11 * L.K, 400);
    ctx.fillStyle = shades.hint;
    ctx.textBaseline = 'middle';
    ctx.fillText(ellipsize(ctx, 'No TM awarded', bodyW), bodyX, cy);
    ctx.restore();
    return;
  }

  const moveShades = cardShades(move.type as TypeName);
  drawMarkColumn(ctx, 'TM', moveShades.band, markCx, cy, (size, gx, gy) =>
    drawTmDisc(ctx, TYPE_COLORS[move.type as TypeName], size, gx, gy),
  );

  const badgeH = (L.TM_BADGE_W * TYPE_BADGE_H) / TYPE_BADGE_W;
  const chipW = 0.9375 * 16 * L.K;
  const chipH = 0.6875 * 16 * L.K;
  const gap = 2 * L.K;
  // The name at the app's own size, and never cut. A two-word move wraps; a
  // single word too wide for the box comes down in size until it fits,
  // because "Flamethro…" is not a move anyone recognises. The box holds the
  // longest single word in the data with room, so the shrink is a guard.
  const namePx = fitFontSize(ctx, move.name, bodyW, L.MOVE_PX, L.MOVE_MIN_PX, 400);
  ctx.font = font(namePx, 400);
  const nameLines = wrapLines(ctx, move.name, bodyW, 2);
  const nameLineH = namePx * 1.15;
  const nameH = nameLines.length * nameLineH;
  const total = badgeH + gap + nameH;
  const top = cy - total / 2;

  drawTypeBadge(ctx, move.type as TypeName, images.get(typeGlyphPath(move.type as TypeName)) ?? null, bodyX, top, badgeH);

  // The category chip: a white-ringed square, the same one the picker shows.
  const chipX = bodyX + L.TM_BADGE_W + 3 * L.K;
  const chipY = top + (badgeH - chipH) / 2;
  ctx.save();
  ctx.fillStyle = CATEGORY_COLORS[move.category];
  roundRect(ctx, chipX, chipY, chipW, chipH, 4 * L.K);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2 * L.K;
  ctx.stroke();
  const icon = images.get(`/sprites/moves/${move.category}.png`);
  if (icon) {
    const iw = chipW * 0.62;
    const ih = (icon.naturalHeight / (icon.naturalWidth || 1)) * iw;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(icon, chipX + (chipW - iw) / 2, chipY + (chipH - ih) / 2, iw, ih);
  }
  ctx.restore();

  ctx.save();
  ctx.font = font(namePx, 400);
  ctx.fillStyle = FG;
  ctx.textBaseline = 'middle';
  nameLines.forEach((line, i) => {
    ctx.fillText(line, bodyX, top + badgeH + gap + (i + 0.5) * nameLineH);
  });
  ctx.restore();
}

function drawBadgeSlot(
  ctx: CanvasRenderingContext2D,
  name: string,
  shades: CardShades,
  ox: number,
  oy: number,
): void {
  const { left, width } = L.slotX(1, 2);
  const x = ox + left;
  const y = oy + L.rowTop(5) + 1.5 * L.ROW + L.INY;
  const h = 1.5 * L.ROW - 2 * L.INY;
  drawSlotBox(ctx, shades, !!name, x, y, width, h);

  const markCx = x + L.MARK_PAD + L.MARK_COL / 2;
  const cy = y + h / 2;
  const bodyX = x + L.MARK_PAD + L.MARK_COL + L.MARK_PAD;
  const bodyW = width - (bodyX - x) - 4 * L.K;

  drawMarkColumn(ctx, 'BADGE', name ? shades.band : shades.hint, markCx, cy, (size, gx, gy) =>
    drawHexagon(ctx, name ? shades.type : shades.dash, !!name, size, gx, gy),
  );

  const size = 10.5 * L.K;
  ctx.save();
  ctx.font = font(size, 400);
  ctx.fillStyle = name ? FG : shades.hint;
  ctx.textBaseline = 'middle';
  const lines = name ? wrapLines(ctx, `${name} Badge`, bodyW, 3) : ['No badge awarded'];
  const lineH = size * 1.25;
  const top = cy - (lines.length * lineH) / 2;
  lines.forEach((line, i) => ctx.fillText(line, bodyX, top + (i + 0.5) * lineH));
  ctx.restore();
}

function drawBand(
  ctx: CanvasRenderingContext2D,
  shades: CardShades,
  label: string,
  note: string | null,
  ox: number,
  y: number,
): void {
  const inset = 3 * L.K;
  const x = ox + inset;
  const w = L.CARD_W - 2 * L.PADX - 2 * inset;
  ctx.save();
  ctx.fillStyle = shades.band;
  roundRect(ctx, x, y, w, L.BAND, L.BAND_R);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  const size = 9 * L.K;
  ctx.font = font(size, 800);
  const track = 0.07 * size;
  const cy = y + L.BAND / 2;
  let tx = x + 8 * L.K;
  fillTracked(ctx, label, tx, cy, track);
  if (note) {
    tx += trackedWidth(ctx, label, track) + 5 * L.K;
    ctx.font = font(size, 400);
    ctx.globalAlpha = 0.85;
    ctx.fillText(ellipsize(ctx, note, x + w - 8 * L.K - tx), tx, cy);
  }
  ctx.restore();
}

function drawGlyphCell(
  ctx: CanvasRenderingContext2D,
  row: number,
  span: number,
  shades: CardShades,
  x: number,
  y: number,
): void {
  const inset = 3 * L.K;
  const w = span * L.COL - 2 * inset;
  const h = L.ROW - 2 * L.INY;
  ctx.save();
  ctx.fillStyle = shades.cell;
  roundRect(ctx, x + inset, y + L.INY, w, h, L.CELL_R);
  ctx.fill();
  const cx = x + inset + w / 2;
  const cy = y + L.INY + h / 2;
  const gap = 2 * L.K;
  if (row === 1) {
    // Row 1 is the only row whose glyph says what it means: one open diamond
    // with nothing before it reads as "one badge", not "no badges".
    const size = 9.5 * L.K;
    ctx.font = font(size, 600);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const block = size + 3 * L.K + 8 * L.K;
    ctx.fillText('No badges', cx, cy - block / 2 + size / 2);
    drawDiamonds(ctx, 1, 8 * L.K, cx, cy + block / 2 - 4 * L.K, gap);
  } else if (row <= 8) {
    drawDiamonds(ctx, row, 7 * L.K, cx, cy, gap);
  } else if (row === L.ELITE_ROW) {
    drawStars(ctx, 4, 10 * L.K, cx, cy, gap);
  } else if (row === L.CHAMPION_ROW) {
    drawCrown(ctx, 15 * L.K, cx, cy);
  } else {
    drawBossBall(ctx, shades.cell, 17 * L.K, cx, cy);
  }
  ctx.restore();
}

function drawGymCardPage(
  ctx: CanvasRenderingContext2D,
  card: GymCard,
  images: Images,
): void {
  const shades = cardShades(card.type);
  const cardH = L.cardHeight();

  ctx.fillStyle = PAGE_BG;
  const left = L.SIDE;
  ctx.fillRect(0, 0, L.PAGE_W, L.CARD_PAGE_H);

  withCardShadow(ctx, () => {
    ctx.fillStyle = shades.base;
    roundRect(ctx, left, L.MARGIN, L.CARD_W, cardH, L.CARD_R);
    ctx.fill();
  });

  // Everything inside the card is clipped by its corners, the way the CSS
  // `overflow:hidden` clips a sprite that overhangs its cell.
  ctx.save();
  roundRect(ctx, left, L.MARGIN, L.CARD_W, cardH, L.CARD_R);
  ctx.clip();

  const ox = left + L.PADX;
  const oy = L.MARGIN + L.PADY;

  // --- the identity block: the mark and the theme, and nothing else ---
  const markSize = 55;
  drawTypeMark(ctx, card.type, images, ox, oy + (L.HDR_H - markSize) / 2, markSize, 0.4375 * 16 * L.K);
  const textX = ox + markSize + 10 * L.K;
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.font = font(L.THEME_TEXT_PX, card.theme ? 700 : 500);
  const base = oy + L.HDR_H / 2 + capHeight(ctx) / 2;
  ctx.font = font(L.THEME_LABEL_PX, 800);
  ctx.fillStyle = shades.band;
  const labelTrack = 0.1 * L.THEME_LABEL_PX;
  fillTracked(ctx, 'THEME', textX, base, labelTrack);
  const valueX = textX + trackedWidth(ctx, 'THEME', labelTrack) + L.THEME_TEXT_PX * 0.34;
  ctx.font = font(L.THEME_TEXT_PX, card.theme ? 700 : 500);
  ctx.fillStyle = card.theme ? FG : shades.hint;
  const room = L.CARD_W - 2 * L.PADX - (valueX - ox);
  ctx.fillText(ellipsize(ctx, card.theme || 'No theme yet', room), valueX, base);
  ctx.restore();

  const gridY = oy + L.HDR_H + L.HDR_GAP;

  // --- the rows, drawn first so the slots sit over the top-left corner ---
  drawBand(ctx, shades, 'GYM LEADER TEAM', null, ox, gridY);
  for (let row = 1; row <= L.ROW_COUNT; row++) {
    const banner = L.BAND_BEFORE[row];
    // `rowTop` counts the band plus the 2px above it, so the band's own top
    // is one band-height back from the row, not one band and the gap.
    if (banner) drawBand(ctx, shades, banner[0], banner[1], ox, gridY + L.rowTop(row) - L.BAND);
    const y = gridY + L.rowTop(row);
    if (row !== 1 && !banner) {
      ctx.save();
      ctx.fillStyle = shades.line;
      ctx.fillRect(ox, y, L.CARD_W - 2 * L.PADX, L.K);
      ctx.restore();
    }
    const cells = exportRow(card, row);
    const span = L.GLYPH_SPAN[row] ?? 1;
    const lead = 7 - cells.length - span;
    drawGlyphCell(ctx, row, span, shades, ox + lead * L.COL, y);
    cells.forEach((cell, i) => {
      const cx = ox + (lead + span + i) * L.COL + L.COL / 2;
      const cy = y + L.ROW / 2;
      const w = L.COL - 2 * L.INX;
      const h = L.ROW - 2 * L.INY;
      const url = spriteUrl(cell.pokemonId, cell.form);
      const img = url ? images.get(url) : undefined;
      ctx.save();
      if (img) {
        ctx.fillStyle = '#ffffff';
        roundRect(ctx, cx - w / 2, cy - h / 2, w, h, L.CELL_R);
        ctx.fill();
      } else {
        ctx.strokeStyle = shades.dash;
        ctx.lineWidth = 1.5 * L.K;
        ctx.setLineDash([4 * L.K, 4 * L.K]);
        roundRect(ctx, cx - w / 2, cy - h / 2, w, h, L.CELL_R);
        ctx.stroke();
      }
      ctx.restore();
      if (img) drawSprite(ctx, img, cx, cy, 96);
    });
  }

  // --- the three slots over the grid's top-left corner ---
  drawShowcase(ctx, card, shades, images, ox, gridY);
  drawTmSlot(ctx, card.tmMoveId === null ? undefined : getMoveById(card.tmMoveId), shades, images, ox, gridY);
  drawBadgeSlot(ctx, card.badgeName, shades, ox, gridY);

  ctx.restore();

  drawCredit(ctx, L.PAGE_W / 2, L.MARGIN + cardH + L.FOOT / 2, L.CREDIT_PX, L.CARD_CREDIT_PREFIX);
}

// ---------- the league home ----------

function drawHomeRow(
  ctx: CanvasRenderingContext2D,
  card: GymCard,
  index: number,
  view: LeagueView,
  images: Images,
  x: number,
  y: number,
): void {
  const shades = card.type ? cardShades(card.type) : null;
  const cell = shades ? shades.cell : GREY;
  const row = view === 'rematch' ? L.BOSS_ROW : slotRow(index);
  const cells = exportRow(card, row);
  const filled = card.lines.length > 0;

  ctx.save();
  ctx.fillStyle = shades ? shades.base : '#ffffff';
  roundRect(ctx, x, y, L.HOME_INNER, L.ROW2, L.HOME_R);
  ctx.fill();
  ctx.fillStyle = HOME_LINE;
  ctx.fillRect(x, y, L.HOME_INNER, L.K2);
  ctx.restore();

  // The glyph cell.
  const inset = 3 * L.K2;
  const glyphH = L.ROW2 - 10 * L.K2;
  ctx.save();
  ctx.fillStyle = cell;
  roundRect(ctx, x + inset, y + (L.ROW2 - glyphH) / 2, L.GLYPH_COL - 2 * inset, glyphH, L.HOME_R);
  ctx.fill();
  ctx.restore();
  const gcx = x + L.GLYPH_COL / 2;
  const gcy = y + L.ROW2 / 2;
  const gap = 2 * L.K2;
  const kind = slotKind(index);
  if (kind === 'gym') drawDiamonds(ctx, index + 1, 7 * L.K2, gcx, gcy, gap);
  else if (kind === 'elite') drawStars(ctx, index - 7, 9 * L.K2, gcx, gcy, gap, index - 7 === 4);
  else if (kind === 'champion') drawCrown(ctx, 13 * L.K2, gcx, gcy);
  else drawBossBall(ctx, cell, 15 * L.K2, gcx, gcy);

  // The type square.
  const sq = 22 * L.K2;
  drawTypeMark(ctx, card.type, images, x + L.GLYPH_COL + (L.TYPE_COL - sq) / 2, y + (L.ROW2 - sq) / 2, sq, L.HOME_R);

  const seatsX = x + L.GLYPH_COL + L.TYPE_COL;
  if (!filled) {
    // An empty row says which seat is open, in the league's own words.
    ctx.save();
    ctx.font = font(11 * L.K2, 500);
    ctx.fillStyle = GREY;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(L.VACANCY[kind], seatsX + 7 * L.SEAT_COL - 6 * L.K2, y + L.ROW2 / 2);
    ctx.restore();
    return;
  }

  // The spare columns sit on the left, so teams stay right-aligned.
  const lead = 7 - cells.length;
  cells.forEach((c, i) => {
    const cx = seatsX + (lead + i + 0.5) * L.SEAT_COL;
    const cy = y + L.ROW2 / 2;
    const url = spriteUrl(c.pokemonId, c.form);
    const img = url ? images.get(url) : undefined;
    if (img) drawSprite(ctx, img, cx, cy, 96);
    else drawEmptyBall(ctx, 18 * L.K2, cx, cy);
  });
}

function drawLeagueHomePage(
  ctx: CanvasRenderingContext2D,
  name: string,
  cards: GymCard[],
  view: LeagueView,
  images: Images,
): void {
  const cardH = L.homeCardHeight();
  ctx.fillStyle = PAGE_BG;
  const left = L.SIDE;
  ctx.fillRect(0, 0, L.PAGE_W, L.HOME_PAGE_H);

  withCardShadow(ctx, () => {
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, left, L.MARGIN, L.HOME_W, cardH, 12 * L.K2);
    ctx.fill();
  });

  ctx.save();
  roundRect(ctx, left, L.MARGIN, L.HOME_W, cardH, 12 * L.K2);
  ctx.clip();

  const ox = left + L.HPADX;
  let y = L.MARGIN + L.HPADY;

  // --- the identity line: the league's name, and which teams these are ---
  // The tool's own name stays off the picture. Someone who is handed it
  // wants to know whose league it is, not what drew it; the credit below
  // already says that.
  const pad = 4 * L.K2;
  const tagSize = 9 * L.K2;
  const big = 14 * L.K2;
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.font = name ? font(big, 700) : `italic 400 ${big}px ${FONT_STACK}`;
  // The name and the tag are set at different sizes and share one baseline,
  // so the smaller run sits on the line rather than in the middle of it.
  const base = y + L.HOME_HDR_H / 2 + capHeight(ctx) / 2;
  ctx.font = font(tagSize, 600);
  const tag = view === 'rematch' ? 'REMATCH TEAMS' : 'STORY TEAMS';
  const track = 0.07 * tagSize;
  const tagW = trackedWidth(ctx, tag, track);
  ctx.fillStyle = MUTED;
  fillTracked(ctx, tag, ox + L.HOME_INNER - pad - tagW, base, track);
  ctx.font = name ? font(big, 700) : `italic 400 ${big}px ${FONT_STACK}`;
  ctx.fillStyle = name ? FG : MUTED;
  const room = L.HOME_INNER - 2 * pad - tagW - 4 * L.K2;
  ctx.fillText(name ? ellipsize(ctx, name, room) : 'Unnamed league', ox + pad, base);
  ctx.restore();
  y += L.HOME_HDR_H;

  for (let index = 0; index < SLOT_COUNT; index++) {
    const section = L.SECTION_BEFORE[index];
    if (section) {
      if (index !== 0) y += 2;
      ctx.save();
      ctx.fillStyle = RED;
      roundRect(ctx, ox, y, L.HOME_INNER, L.BAND2, L.HOME_R);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = font(9 * L.K2, 800);
      ctx.textBaseline = 'middle';
      fillTracked(ctx, section, ox + 8 * L.K2, y + L.BAND2 / 2, 0.07 * 9 * L.K2);
      ctx.restore();
      y += L.BAND2;
    }
    drawHomeRow(ctx, cards[index], index, view, images, ox, y);
    y += L.ROW2;
  }

  ctx.restore();
  drawCredit(ctx, L.PAGE_W / 2, L.MARGIN + cardH + L.FOOT / 2, L.CREDIT_PX, L.HOME_CREDIT_PREFIX);
}

// ---------- assembling a PNG ----------

async function render(
  w: number,
  h: number,
  paint: (ctx: CanvasRenderingContext2D) => void,
): Promise<Blob> {
  // Text metrics decide every fit below, so the real face has to be resident
  // before anything is measured. Without this the first export of a session
  // measures a fallback and lays the card out to the wrong widths.
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      /* fall back to metrics as they are */
    }
  }

  const scale = Math.min(2, Math.sqrt(MAX_CANVAS_AREA / (w * h)));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.scale(scale, scale);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  paint(ctx);

  return new Promise<Blob>((resolve, reject) => {
    // iOS occasionally never invokes the callback, which would hang the export
    // spinner for good. The dex export guards the same way.
    const timer = window.setTimeout(() => reject(new Error('Canvas toBlob timed out')), 15000);
    canvas.toBlob((blob) => {
      window.clearTimeout(timer);
      if (blob) resolve(blob);
      else reject(new Error('Canvas toBlob failed'));
    }, 'image/png');
  });
}

/** One trainer's card as a PNG. */
export async function exportGymCard(card: GymCard): Promise<Blob> {
  const images = await loadAll(cardImageUrls(card));
  return render(L.PAGE_W, L.CARD_PAGE_H, (ctx) => drawGymCardPage(ctx, card, images));
}

/** The league summary as a PNG, at whichever team toggle is on screen. */
export async function exportLeagueHome(
  name: string,
  cards: GymCard[],
  view: LeagueView,
): Promise<Blob> {
  const images = await loadAll(homeImageUrls(cards, view));
  return render(L.PAGE_W, L.HOME_PAGE_H, (ctx) =>
    drawLeagueHomePage(ctx, name, cards, view, images),
  );
}
