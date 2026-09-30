/**
 * The league's two exports, drawn on a canvas.
 *
 * `exportGymCard` renders one trainer's card; `exportLeagueHome` renders the
 * league summary at the layout's team mode, which the export pane starts at
 * the team toggle on screen. Both return a PNG blob
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
import { TYPE_BADGE, TYPE_BADGE_H } from '@/lib/typeBadgeGeometry';
import { expandTemplate } from '@/lib/richTemplate';
import { clipExportCanvas, exportInnerCornerRadius } from '@/lib/exportPngShape';
import { localeUppercase, pokemonLabel, raw } from '@/i18n';
import type { GymCard, LeagueView } from '../store/useLeagueStore';
import { legendsOf, powerupsAt } from '../store/useLeagueStore';
import { deriveRow, signatureMember } from '../model/engine';
import { formAt, type PowerupForm } from '../model/powerups';
import { SLOT_COUNT, slotKind, slotRow } from '../model/constants';
import { cardShades, type CardShades } from '../theme';
import { getMoveById, CATEGORY_COLORS, type Move } from '../moves';
import { RING_OF_SPRITE } from '../slotLayout';
import * as L from './layout';
import {
  DEFAULT_LEAGUE_HOME_EXPORT_LAYOUT,
  layoutShowsBothTeams,
  layoutShowsGymDetails,
  type LeagueHomeExportLayout,
} from './exportOptions';
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
  ellipsizeTracked,
  fitFontSize,
  fillTracked,
  fillTrackedCentered,
  font,
  roundRect,
  trackedWidth,
  wrapLines,
  wrapTracked,
} from './paint';

/** One name each, whatever the league is called and whoever is on the card. */
export const CARD_FILENAME = 'my151-trainer-card.png';
export const HOME_FILENAME = 'my151-league.png';

const FG = '#0a0a0a';
const RED = '#DC2626';
/** The league summary's frame: the Dex export's red. */
const HOME_FRAME = RED;
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
  // The title row's badge wants the type's white glyph, not its icon.
  if (card.type && card.type !== 'none') urls.push(typeGlyphPath(card.type));
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

/** Story and rematch rows a slot paints. Rematch is always the endgame row. */
export function homeRowsForCard(
  index: number,
  view: LeagueView,
  layout: LeagueHomeExportLayout,
): number[] {
  const challenge = slotRow(index);
  const rematch = L.BOSS_ROW;
  if (layoutShowsBothTeams(layout)) return [challenge, rematch];
  const effectiveView =
    layout.teamMode === 'rematch' ? 'rematch' : layout.teamMode === 'story' ? 'challenge' : view;
  return [effectiveView === 'rematch' ? rematch : challenge];
}

/** Every image the league home needs. */
function homeImageUrls(cards: GymCard[], view: LeagueView, layout: LeagueHomeExportLayout): string[] {
  const urls: string[] = [];
  cards.forEach((card, index) => {
    if (card.type && card.type !== 'none') urls.push(typeIconPath(card.type));
    if (layout.showTmReward) {
      const move = card.tmMoveId === null ? undefined : getMoveById(card.tmMoveId);
      if (move) {
        urls.push(typeIconPath(move.type as TypeName));
        urls.push(`/sprites/moves/${move.category}.png`);
      }
    }
    if (card.lines.length === 0) return;
    for (const row of homeRowsForCard(index, view, layout)) {
      for (const cell of exportRow(card, row)) {
        const url = spriteUrl(cell.pokemonId, cell.form);
        if (url) urls.push(url);
      }
    }
  });
  return urls;
}

// ---------- shared chrome ----------

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
 * The type square on a league row: the chosen type's icon, or the no-type
 * grey and its star.
 *
 * A trainer with a team and no type exports as "no type" rather than as the
 * app's dashed square. The dashed square is an add affordance — it asks the
 * card's owner to do something — and a picture they hand to someone else has
 * nothing to press. An open seat is the exception: see `vacantRow`.
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

const ACE_HEAD = L.ACE_HEAD;
const PARTNER_HEAD = L.PARTNER_HEAD;

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
  ctx.translate(cx, top);
  lines.forEach((line, i) => {
    fillTrackedCentered(ctx, line, 0, (i + 0.5) * L.HEAD_LINE, L.HEAD_TRACK);
  });
  ctx.restore();
}

/**
 * A chosen Pokémon on its two-tone ball, in one layer or in both.
 *
 * The showcase draws the pair in two passes, so it needs the ball and the
 * sprite separately; everywhere else takes both at once.
 */
function drawShowcaseArt(
  ctx: CanvasRenderingContext2D,
  pokemonId: number,
  images: Images,
  cx: number,
  cy: number,
  sprite: number,
  layer: 'ball' | 'sprite' | 'both' = 'both',
): void {
  if (layer !== 'sprite') {
    const [primary, secondary] = ballColours(pokemonId);
    drawPokeballBg(ctx, primary, secondary, sprite / 1.2, cx, cy);
  }
  if (layer !== 'ball') {
    const img = images.get(spriteUrl(pokemonId, null) ?? '');
    if (img) drawSprite(ctx, img, cx, cy, sprite);
  }
}

function speciesCaps(pokemonId: number): string {
  const pokemon = getPokemonById(pokemonId);
  if (!pokemon) return '';
  const label = pokemonLabel(pokemon.id, pokemon.name);
  return localeUppercase(label.pending ? pokemon.name : label.name);
}

/** One run of a signature caption: its text and its face. */
interface CaptionRun {
  text: string;
  px: number;
  track: number;
  colour: string;
}

/** A caption run laid out on its line. */
interface CaptionLine extends CaptionRun {
  /** Where the run starts. */
  x: number;
  /** The line box's vertical centre. */
  cy: number;
  /** The line box, as wide as the ink plus `CAPTION_HALO` each side. The seam fades inside it. */
  halo: L.Box;
}

function headRun(text: string, colour: string): CaptionRun {
  return { text, px: L.HEAD_PX, track: L.HEAD_TRACK, colour };
}

/**
 * A species name in black at the name size. A name wider than `room` shrinks
 * to `CAPTION_NAME_MIN_PX`, and past that it takes an ellipsis.
 */
function nameRun(ctx: CanvasRenderingContext2D, pokemonId: number | null, room: number): CaptionRun {
  const text = pokemonId === null ? '' : speciesCaps(pokemonId);
  const trackAt = (px: number) => (L.NAME_TRACK / L.NAME_PX) * px;
  let px = L.NAME_PX;
  ctx.font = font(px, 800);
  while (px > L.CAPTION_NAME_MIN_PX && trackedWidth(ctx, text, trackAt(px)) > room) {
    px = Math.max(L.CAPTION_NAME_MIN_PX, px - 0.5);
    ctx.font = font(px, 800);
  }
  return { text: ellipsizeTracked(ctx, text, room, trackAt(px)), px, track: trackAt(px), colour: FG };
}

/**
 * Caption runs one heading line apart from `top`, each centred on `anchor`
 * or ending at it. A shrunk name keeps the full line height, so the lines
 * around it stay where they are.
 */
function layoutCaption(
  ctx: CanvasRenderingContext2D,
  runs: CaptionRun[],
  align: 'center' | 'right',
  anchor: number,
  top: number,
): CaptionLine[] {
  return runs.map((run, i) => {
    ctx.font = font(run.px, 800);
    const w = trackedWidth(ctx, run.text, run.track);
    const x = align === 'center' ? anchor - w / 2 : anchor - w;
    // Tracking follows the last letter too, as in CSS, but it is not ink.
    const ink = Math.max(0, w - run.track);
    const lineTop = top + i * L.HEAD_LINE;
    return {
      ...run,
      x,
      cy: lineTop + L.HEAD_LINE / 2,
      halo: { x: x - L.CAPTION_HALO, y: lineTop, w: ink + 2 * L.CAPTION_HALO, h: L.HEAD_LINE },
    };
  });
}

/** Each run's capitals centred on its line box. The cap height is the same on every engine. */
function fillCaption(ctx: CanvasRenderingContext2D, lines: CaptionLine[]): void {
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  for (const line of lines) {
    ctx.font = font(line.px, 800);
    ctx.fillStyle = line.colour;
    fillTracked(ctx, line.text, line.x, line.cy + capHeight(ctx) / 2, line.track);
  }
  ctx.restore();
}

/**
 * The seam, at full strength outside the caption halos and at `SEAM_FADE`
 * inside them. Each part is stroked once, so the line's antialiased edges
 * are no heavier than a single stroke's. The halos are line boxes, which
 * never overlap, so the even-odd clip holds every point outside them.
 */
function strokeSeam(
  ctx: CanvasRenderingContext2D,
  seam: { x1: number; y1: number; x2: number; y2: number },
  halos: L.Box[],
  panel: L.Box,
  colour: string,
): void {
  const stroke = (clip: () => void, rule: CanvasFillRule, alpha: number) => {
    ctx.save();
    ctx.beginPath();
    clip();
    ctx.clip(rule);
    ctx.strokeStyle = colour;
    ctx.lineWidth = L.K;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(seam.x1, seam.y1);
    ctx.lineTo(seam.x2, seam.y2);
    ctx.stroke();
    ctx.restore();
  };
  const halosPath = () => {
    for (const h of halos) ctx.rect(h.x, h.y, h.w, h.h);
  };
  stroke(() => {
    ctx.rect(panel.x, panel.y, panel.w, panel.h);
    halosPath();
  }, 'evenodd', 1);
  if (halos.length) stroke(halosPath, 'nonzero', L.SEAM_FADE);
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
  const filled = ace !== null || partner !== null;
  // One Pokémon to show is a single showcase: a lone ace, a lone partner, or
  // the same Pokémon in both slots, which is headed as the signature Pokémon.
  const solo = (ace === null) !== (partner === null) || (ace !== null && ace === partner);

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

  ctx.save();
  roundRect(ctx, x, y, box.width, box.height, L.SLOT_R);
  ctx.clip();

  if (solo) {
    const id = ace ?? partner;
    if (id !== null) {
      const sprite = L.soloExportSprite(box.width, box.height);
      const headH = 2 * L.HEAD_LINE;
      const clusterH = headH + sprite + L.NAME_LINE;
      const top = y + (box.height - clusterH) / 2;
      const cx = x + box.width / 2;
      const spriteCy = top + headH + sprite / 2;
      drawShowcaseArt(ctx, id, images, cx, spriteCy, sprite, 'both');
      const heading = ace === partner ? L.SIGNATURE_HEAD : ace !== null ? ACE_HEAD : PARTNER_HEAD;
      drawHeading(ctx, heading, cx, top, shades.band);
      ctx.save();
      ctx.font = font(L.NAME_PX, 800);
      ctx.fillStyle = FG;
      ctx.textBaseline = 'middle';
      fillTrackedCentered(ctx, speciesCaps(id), cx, spriteCy + sprite / 2 + L.NAME_LINE / 2, L.NAME_TRACK);
      ctx.restore();
    }
    ctx.restore();
    return;
  }

  // The ace at 2× over the partner at 1×, each captioned, and the 30° seam
  // between the two sides. The captions are laid out first, because the
  // seam runs between them.
  const panel = { x, y, w: box.width, h: box.height };
  const squares = L.showcaseSquares(ox, oy);
  const headColour = (id: number | null) => (id !== null ? shades.band : shades.hint);
  const aceSq = squares.ace;
  const aceLines = layoutCaption(
    ctx,
    [headRun(ACE_HEAD.join(' '), headColour(ace)), nameRun(ctx, ace, aceSq.w)],
    'center',
    aceSq.x + aceSq.w / 2,
    aceSq.y + aceSq.h + L.CAPTION_GAP_Y,
  );
  const partnerSq = squares.partner;
  const partnerRight = partnerSq.x - L.CAPTION_GAP_X;
  const partnerRuns = [
    ...PARTNER_HEAD.map((line) => headRun(line, headColour(partner))),
    nameRun(ctx, partner, partnerRight - x - L.CAPTION_GAP_X),
  ];
  const partnerLines = layoutCaption(
    ctx,
    partnerRuns,
    'right',
    partnerRight,
    partnerSq.y + (partnerSq.h - partnerRuns.length * L.HEAD_LINE) / 2,
  );
  const halos = (lines: CaptionLine[]) => lines.filter((line) => line.text).map((line) => line.halo);
  const depth = L.seamDepth(
    { square: aceSq, lines: halos(aceLines) },
    { square: partnerSq, lines: halos(partnerLines) },
  );

  const halves = [
    { id: ace, square: aceSq },
    { id: partner, square: partnerSq },
  ];
  for (const { id, square } of halves) {
    if (id === null) continue;
    drawShowcaseArt(ctx, id, images, square.x + square.w / 2, square.y + square.h / 2, square.w, 'ball');
  }
  strokeSeam(
    ctx,
    L.seamSegment(panel, depth),
    [...halos(aceLines), ...halos(partnerLines)],
    panel,
    shades.dash,
  );
  for (const { id, square } of halves) {
    const cx = square.x + square.w / 2;
    const cy = square.y + square.h / 2;
    if (id !== null) drawShowcaseArt(ctx, id, images, cx, cy, square.w, 'sprite');
    else drawEmptyBall(ctx, RING_OF_SPRITE * square.w, cx, cy);
  }
  fillCaption(ctx, [...aceLines, ...partnerLines]);
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
  ctx.save();
  ctx.font = font(L.MARK_LABEL_PX, 800);
  if (!word) {
    const glyph = L.MARK_COL * 0.72;
    drawGlyph(glyph, cx - glyph / 2, cy - glyph / 2);
  } else {
    const mark = L.tmMarkColumn(cy);
    drawGlyph(mark.glyph, cx - mark.glyph / 2, mark.top);
    ctx.fillStyle = colour;
    ctx.textBaseline = 'middle';
    fillTrackedCentered(ctx, word, cx, mark.labelCy, L.MARK_TRACK);
  }
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
    return;
  }

  const moveShades = cardShades(move.type as TypeName);
  drawMarkColumn(ctx, 'TM', moveShades.band, markCx, cy, (size, gx, gy) =>
    drawTmDisc(ctx, TYPE_COLORS[move.type as TypeName], size, gx, gy),
  );

  const badgeH = L.tmBadgeH();
  const name = L.moveExportName(move.name);
  ctx.save();
  ctx.font = font(L.NAME_PX, 800);
  // As few lines as fit the body: one line whenever the whole name fits,
  // as the live card wraps it.
  const lines = wrapTracked(ctx, name, bodyW, L.NAME_TRACK);
  const body = L.tmMoveBody(cy, lines.length);

  ctx.beginPath();
  ctx.rect(bodyX, y, bodyW, h);
  ctx.clip();

  drawTypeBadge(
    ctx,
    move.type as TypeName,
    images.get(typeGlyphPath(move.type as TypeName)) ?? null,
    bodyX,
    body.badgeY,
    badgeH,
  );

  const chipX = bodyX + L.TM_BADGE_W + L.TM_TYPE_GAP;
  ctx.fillStyle = CATEGORY_COLORS[move.category];
  roundRect(ctx, chipX, body.chipY, L.TM_CHIP_W, L.TM_CHIP_H, 4 * L.K);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2 * L.K;
  ctx.stroke();
  const icon = images.get(`/sprites/moves/${move.category}.png`);
  if (icon) {
    const iw = L.TM_CHIP_W * 0.62;
    const ih = (icon.naturalHeight / (icon.naturalWidth || 1)) * iw;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(
      icon,
      chipX + (L.TM_CHIP_W - iw) / 2,
      body.chipY + (L.TM_CHIP_H - ih) / 2,
      iw,
      ih,
    );
  }

  ctx.fillStyle = moveShades.band;
  // The cap height on every engine. WebKit's `emHeightAscent` is the font
  // ascent (15px here, against a 12px cap), so it dropped the name 3px in the
  // iPhone PNG. Blink has no `emHeightAscent` and always took the cap height.
  const ascent = capHeight(ctx);
  ctx.textBaseline = 'alphabetic';
  lines.forEach((line, i) => {
    fillTracked(
      ctx,
      line,
      bodyX,
      L.cssLineAlphabetic(body.nameTop + i * L.NAME_LINE, L.NAME_LINE, L.NAME_PX, ascent),
      L.NAME_TRACK,
    );
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

  drawMarkColumn(ctx, name ? '' : 'BADGE', name ? shades.band : shades.hint, markCx, cy, (size, gx, gy) =>
    drawHexagon(ctx, name ? shades.type : shades.dash, !!name, size, gx, gy),
  );

  if (!name) return;

  ctx.save();
  ctx.font = font(L.NAME_PX, 800);
  ctx.fillStyle = shades.band;
  ctx.textBaseline = 'middle';
  let next = name;
  let lines = wrapLines(ctx, L.badgeExportPhrase(next), bodyW, 3, false);
  while (next && !badgeLinesKeepSuffix(lines, bodyW, ctx)) {
    next = next.slice(0, -1).replace(/[\s\u00a0]+$/u, '');
    lines = wrapLines(ctx, L.badgeExportPhrase(next), bodyW, 3, false);
  }
  const lineH = L.NAME_LINE;
  const top = cy - (lines.length * lineH) / 2;
  lines.forEach((line, i) => {
    fillTracked(ctx, line, bodyX, top + (i + 0.5) * lineH, L.NAME_TRACK);
  });
  ctx.restore();
}

function badgeLinesKeepSuffix(
  lines: string[],
  maxW: number,
  ctx: CanvasRenderingContext2D,
): boolean {
  if (lines.length === 0) return false;
  const last = lines[lines.length - 1] ?? '';
  return last.endsWith('BADGE') && ctx.measureText(last).width <= maxW + 0.5;
}

function drawBand(
  ctx: CanvasRenderingContext2D,
  shades: CardShades,
  label: string,
  note: string | null,
  ox: number,
  y: number,
): void {
  // The band's corner curve ends on the rail and its label starts there, so
  // the box overhangs the rail by its own radius — and the rail's mirror by
  // the same, which keeps the overhang short and even.
  const x = ox + L.RAIL - L.BAND_R;
  const w = L.CARD_W - 2 * L.PADX - 2 * L.RAIL + 2 * L.BAND_R;
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
  let tx = x + L.BAND_R;
  fillTracked(ctx, label, tx, cy, track);
  if (note) {
    tx += trackedWidth(ctx, label, track) + 5 * L.K;
    ctx.font = font(size, 400);
    ctx.globalAlpha = 0.85;
    ctx.fillText(ellipsize(ctx, note, x + w - L.BAND_R - tx), tx, cy);
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
  const w = span * L.COL - 2 * L.RAIL;
  const h = L.ROW - 2 * L.INY;
  ctx.save();
  ctx.fillStyle = shades.cell;
  roundRect(ctx, x + L.RAIL, y + L.INY, w, h, L.CELL_R);
  ctx.fill();
  const cx = x + L.RAIL + w / 2;
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

function drawGymCard(
  ctx: CanvasRenderingContext2D,
  card: GymCard,
  images: Images,
): void {
  const shades = cardShades(card.type);
  const type = card.type !== 'none' ? card.type : null;

  // The frame and the bar are one colour: the whole picture first, then the
  // card's own tint inside the frame and under the bar. No page and no card
  // chrome beyond that, so nothing reads as a card floating on a blank ground.
  ctx.fillStyle = type ? shades.band : RED;
  ctx.fillRect(0, 0, L.CARD_IMG_W, L.CARD_IMG_H);
  ctx.fillStyle = shades.base;
  ctx.beginPath();
  const innerRadius = exportInnerCornerRadius(L.CARD_IMG_W, L.CARD_IMG_H, L.FRAME);
  ctx.roundRect(
    L.FRAME,
    L.BAR_H,
    L.CARD_W,
    L.CARD_IMG_H - L.BAR_H - L.FRAME,
    [0, 0, innerRadius, innerRadius],
  );
  ctx.fill();

  const fx = L.FRAME;
  const ox = fx + L.PADX;
  const innerW = L.CARD_W - 2 * L.PADX;
  // The theme field ends on the rail's mirror, where the team cells end, so
  // the band below overhangs it by the same amount at each side.
  const right = ox + innerW - L.RAIL;

  // --- the header bar: the title in white, from the grid's own left rail ---
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.font = font(L.TITLE_PX, 800);
  const titleBase = L.BAR_H / 2 + capHeight(ctx) / 2;
  ctx.fillStyle = '#ffffff';
  let x = fx + L.BAR_TEXT_X;
  fillTracked(ctx, L.CARD_TITLE, x, titleBase, L.TITLE_TRACK);
  x += trackedWidth(ctx, L.CARD_TITLE, L.TITLE_TRACK) + L.TITLE_GAP;
  if (type) {
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(L.TITLE_SEP, x, titleBase);
    x += ctx.measureText(L.TITLE_SEP).width + L.TITLE_GAP;
    const badgeTop = (L.BAR_H - L.TITLE_BADGE_H) / 2;
    // The ring: two pixels of white outside the pill, following its radius.
    const r = TYPE_BADGE.radius * (L.TITLE_BADGE_H / TYPE_BADGE_H);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = L.BAR_RING;
    roundRect(
      ctx,
      x - L.BAR_RING / 2,
      badgeTop - L.BAR_RING / 2,
      L.TITLE_BADGE_W + L.BAR_RING,
      L.TITLE_BADGE_H + L.BAR_RING,
      r + L.BAR_RING / 2,
    );
    ctx.stroke();
    drawTypeBadge(ctx, type, images.get(typeGlyphPath(type)) ?? null, x, badgeTop, L.TITLE_BADGE_H);
    x += L.TITLE_BADGE_W + L.TITLE_WORD_GAP;
    ctx.fillStyle = '#ffffff';
    fillTracked(ctx, L.SPECIALIST, x, titleBase, L.TITLE_TRACK);
  }
  ctx.restore();

  // --- the theme row: THEME on the rail, then a white field to the right ---
  const fieldTop = L.BAR_H + L.THEME_GAP;
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.font = font(L.THEME_LABEL_PX, 800);
  const labelTrack = 0.1 * L.THEME_LABEL_PX;
  ctx.fillStyle = shades.band;
  const labelX = ox + L.RAIL;
  fillTracked(ctx, 'THEME', labelX, fieldTop + L.FIELD_H / 2 + capHeight(ctx) / 2, labelTrack);
  const fieldX = labelX + trackedWidth(ctx, 'THEME', labelTrack) + L.LABEL_GAP;
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, fieldX, fieldTop, right - fieldX, L.FIELD_H, L.FIELD_R);
  ctx.fill();
  ctx.font = font(L.THEME_TEXT_PX, card.theme ? 700 : 500);
  ctx.fillStyle = card.theme ? FG : shades.hint;
  const room = right - fieldX - 2 * L.FIELD_PADX;
  ctx.fillText(
    ellipsize(ctx, card.theme || 'No theme yet', room),
    fieldX + L.FIELD_PADX,
    fieldTop + L.FIELD_H / 2 + capHeight(ctx) / 2,
  );
  ctx.restore();

  const gridY = L.gridTop();

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
      ctx.fillRect(ox, y, innerW, L.K);
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

  drawCredit(ctx, fx + L.CARD_W / 2, gridY + L.gridHeight() + L.FOOT / 2, L.CREDIT_PX, L.CARD_CREDIT_PREFIX);
}

// ---------- the league home ----------

/**
 * Whether a league row shows the dashed square where a type would go.
 *
 * A trainer with no Pokémon at all is an open seat, and the row says so the
 * way the app does: a dashed square, in the neutral shades. A trainer with a
 * team and no type has made a choice and shows the no-type square; a type
 * chosen for an empty seat is a choice too, and keeps its icon.
 */
export function vacantRow(card: GymCard): boolean {
  return card.lines.length === 0 && (!card.type || card.type === 'none');
}

function drawHomeTeamSprites(
  ctx: CanvasRenderingContext2D,
  cells: ExportCell[],
  images: Images,
  seatsX: number,
  seatCol: number,
  y: number,
): void {
  const lead = L.SEAT_COUNT - cells.length;
  cells.forEach((c, i) => {
    const cx = seatsX + (lead + i + 0.5) * seatCol;
    const cy = y + L.ROW2 / 2;
    const url = spriteUrl(c.pokemonId, c.form);
    const img = url ? images.get(url) : undefined;
    if (img) drawSprite(ctx, img, cx, cy, 96);
    else drawEmptyBall(ctx, 18 * L.K2, cx, cy);
  });
}

/** Inset of the details lines from either side of their column. */
const DETAIL_PAD = 2 * L.K2;
/** Between THEME and the theme's own words. */
const THEME_VALUE_GAP = 5 * L.K2;

/** One line of a row's details column: theme, TM, or badge. */
interface DetailLine {
  /** The column width the line needs to draw uncut, padding included. */
  need: number;
  /** Paint the line on `midY`, between the column's padded edges. */
  paint: (bodyX: number, right: number, midY: number) => void;
}

/**
 * A row's details lines, each with the width it takes at full size.
 *
 * The export sizes the details column from these widths before it draws, and
 * then paints the same lines in it, so the column and the text agree on
 * every engine.
 */
function homeDetailLines(
  ctx: CanvasRenderingContext2D,
  card: GymCard,
  shades: CardShades,
  images: Images,
  layout: LeagueHomeExportLayout,
): DetailLine[] {
  if (vacantRow(card)) return [];

  const themeText = layout.showTheme ? (card.theme?.trim() ?? '') : '';
  const move =
    layout.showTmReward && card.tmMoveId !== null ? getMoveById(card.tmMoveId) : undefined;
  const badgeName = layout.showBadgeName ? (card.badgeName?.trim() ?? '') : '';
  const lines: DetailLine[] = [];
  const typeR = L.homeTypeMarkRadius(L.HOME_DETAIL_TYPE);
  const markInset = L.HOME_DETAIL_ICON + L.HOME_DETAIL_GAP;

  const markWidth = (text: string): number => {
    ctx.save();
    ctx.font = font(L.HOME_MARK_LABEL_PX, 800);
    const w = trackedWidth(ctx, text, L.HOME_MARK_TRACK);
    ctx.restore();
    return w;
  };

  if (themeText) {
    const labelW = markWidth('THEME');
    ctx.save();
    ctx.font = font(L.HOME_THEME_TEXT_PX, 700);
    const textW = ctx.measureText(themeText).width;
    ctx.restore();
    lines.push({
      need: 2 * DETAIL_PAD + labelW + THEME_VALUE_GAP + textW,
      paint: (bodyX, right, midY) => {
        ctx.save();
        ctx.font = font(L.HOME_MARK_LABEL_PX, 800);
        ctx.fillStyle = shades.band;
        ctx.textBaseline = 'middle';
        fillTracked(ctx, 'THEME', bodyX, midY, L.HOME_MARK_TRACK);
        const valueX = bodyX + labelW + THEME_VALUE_GAP;
        const valueW = Math.max(8, right - valueX);
        const themePx = fitFontSize(
          ctx,
          themeText,
          valueW,
          L.HOME_THEME_TEXT_PX,
          L.HOME_MARK_LABEL_PX * 0.85,
          700,
        );
        ctx.font = font(themePx, 700);
        ctx.fillStyle = FG;
        ctx.fillText(ellipsize(ctx, themeText, valueW), valueX, midY);
        ctx.restore();
      },
    });
  }

  if (move) {
    const moveShades = cardShades(move.type as TypeName);
    const moveUpper = move.name.toUpperCase();
    const trailing = L.HOME_DETAIL_GAP + L.HOME_DETAIL_TYPE + L.HOME_DETAIL_GAP + L.HOME_DETAIL_CHIP_W;
    lines.push({
      need: 2 * DETAIL_PAD + markInset + markWidth(moveUpper) + trailing,
      paint: (bodyX, right, midY) => {
        const markX = bodyX + markInset;
        const iconY = midY - L.HOME_DETAIL_ICON / 2;
        drawTmDisc(ctx, TYPE_COLORS[move.type as TypeName], L.HOME_DETAIL_ICON, bodyX, iconY);
        const nameW = Math.max(8, right - trailing - markX);
        ctx.save();
        ctx.font = font(L.HOME_MARK_LABEL_PX, 800);
        ctx.fillStyle = moveShades.band;
        ctx.textBaseline = 'middle';
        const name = ellipsizeTracked(ctx, moveUpper, nameW, L.HOME_MARK_TRACK);
        fillTracked(ctx, name, markX, midY, L.HOME_MARK_TRACK);
        const typeX = markX + trackedWidth(ctx, name, L.HOME_MARK_TRACK) + L.HOME_DETAIL_GAP;
        ctx.restore();
        drawTypeMark(
          ctx,
          move.type as TypeName,
          images,
          typeX,
          midY - L.HOME_DETAIL_TYPE / 2,
          L.HOME_DETAIL_TYPE,
          typeR,
        );
        const chipX = typeX + L.HOME_DETAIL_TYPE + L.HOME_DETAIL_GAP;
        const chipY = midY - L.HOME_DETAIL_CHIP_H / 2;
        ctx.save();
        ctx.fillStyle = CATEGORY_COLORS[move.category];
        roundRect(ctx, chipX, chipY, L.HOME_DETAIL_CHIP_W, L.HOME_DETAIL_CHIP_H, 2 * L.K2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2 * L.K2;
        ctx.stroke();
        const catIcon = images.get(`/sprites/moves/${move.category}.png`);
        if (catIcon) {
          const iw = L.HOME_DETAIL_CHIP_W * 0.62;
          const ih = (catIcon.naturalHeight / (catIcon.naturalWidth || 1)) * iw;
          ctx.imageSmoothingEnabled = true;
          ctx.drawImage(
            catIcon,
            chipX + (L.HOME_DETAIL_CHIP_W - iw) / 2,
            chipY + (L.HOME_DETAIL_CHIP_H - ih) / 2,
            iw,
            ih,
          );
        }
        ctx.restore();
      },
    });
  }

  if (badgeName) {
    const badgeText = `${badgeName} Badge`.toUpperCase();
    lines.push({
      need: 2 * DETAIL_PAD + markInset + markWidth(badgeText),
      paint: (bodyX, right, midY) => {
        drawHexagon(ctx, shades.type, true, L.HOME_DETAIL_ICON, bodyX, midY - L.HOME_DETAIL_ICON / 2);
        const textX = bodyX + markInset;
        const textW = Math.max(8, right - textX);
        ctx.save();
        ctx.font = font(L.HOME_MARK_LABEL_PX, 800);
        ctx.fillStyle = shades.band;
        ctx.textBaseline = 'middle';
        fillTracked(
          ctx,
          ellipsizeTracked(ctx, badgeText, textW, L.HOME_MARK_TRACK),
          textX,
          midY,
          L.HOME_MARK_TRACK,
        );
        ctx.restore();
      },
    });
  }

  return lines;
}

/** The widest details line in the league, which the details column fits. */
function homeDetailsNeed(
  ctx: CanvasRenderingContext2D,
  cards: GymCard[],
  images: Images,
  layout: LeagueHomeExportLayout,
): number {
  let need = 0;
  for (const card of cards) {
    for (const line of homeDetailLines(ctx, card, cardShades(card.type), images, layout)) {
      need = Math.max(need, line.need);
    }
  }
  return need;
}

function drawHomeGymDetails(
  ctx: CanvasRenderingContext2D,
  card: GymCard,
  shades: CardShades,
  images: Images,
  x: number,
  y: number,
  w: number,
  layout: LeagueHomeExportLayout,
): void {
  const lines = homeDetailLines(ctx, card, shades, images, layout);
  if (lines.length === 0) return;

  const innerH = L.ROW2 - 2 * L.HOME_DETAIL_PAD_Y;
  const bandH = innerH / 3;
  const usedH = lines.length * bandH;
  const startY = y + L.HOME_DETAIL_PAD_Y + (innerH - usedH) / 2;

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, L.ROW2);
  ctx.clip();
  lines.forEach((line, i) => {
    line.paint(x + DETAIL_PAD, x + w - DETAIL_PAD, startY + i * bandH + bandH / 2);
  });
  ctx.restore();
}

function paintSectionPill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  label: string | null,
  align: 'left' | 'right',
): void {
  ctx.save();
  ctx.fillStyle = RED;
  roundRect(ctx, x, y, w, L.BAND2, L.HOME_R);
  ctx.fill();
  if (label) {
    const size = 9 * L.K2;
    const track = 0.07 * size;
    ctx.fillStyle = '#ffffff';
    ctx.font = font(size, 800);
    ctx.textBaseline = 'middle';
    const tw = trackedWidth(ctx, label, track);
    const inset = L.HOME_R;
    const tx = align === 'right' ? x + w - inset - tw : x + inset;
    fillTracked(ctx, label, tx, y + L.BAND2 / 2, track);
  }
  ctx.restore();
}

function drawHomeRow(
  ctx: CanvasRenderingContext2D,
  card: GymCard,
  index: number,
  view: LeagueView,
  layout: LeagueHomeExportLayout,
  geom: L.HomeExportGeometry,
  images: Images,
  x: number,
  y: number,
): void {
  // An unset type takes the neutral ramp, as `cardShades` gives it in the
  // app, rather than a grey of its own.
  const shades = cardShades(card.type);
  const cell = shades.cell;
  const filled = card.lines.length > 0;
  const sideBySide = layoutShowsBothTeams(layout);
  const challengeRow = slotRow(index);
  const rematchRow = L.BOSS_ROW;
  const effectiveView =
    layout.teamMode === 'rematch' ? 'rematch' : layout.teamMode === 'story' ? 'challenge' : view;
  const primaryRow = effectiveView === 'rematch' ? rematchRow : challengeRow;
  const cells = exportRow(card, primaryRow);

  ctx.save();
  ctx.fillStyle = shades.base;
  roundRect(ctx, x, y, geom.homeInner, L.ROW2, L.HOME_R);
  ctx.fill();
  ctx.fillStyle = HOME_LINE;
  ctx.fillRect(x, y, geom.homeInner, L.K2);
  ctx.restore();

  // The glyph cell, on the rail.
  const glyphH = L.ROW2 - 10 * L.K2;
  ctx.save();
  ctx.fillStyle = cell;
  const glyphW = L.GLYPH_COL - 2 * L.HOME_RAIL;
  roundRect(ctx, x + L.HOME_RAIL, y + (L.ROW2 - glyphH) / 2, glyphW, glyphH, L.HOME_R);
  ctx.fill();
  ctx.restore();
  const gcx = x + L.GLYPH_COL / 2;
  const gcy = y + L.ROW2 / 2;
  const gap = 2 * L.K2;
  const kind = slotKind(index);
  if (kind === 'gym') drawDiamonds(ctx, index + 1, 7 * L.K2, gcx, gcy, gap);
  else if (kind === 'elite') drawStars(ctx, index - 7, 9 * L.K2, gcx, gcy, gap);
  else if (kind === 'champion') drawCrown(ctx, 13 * L.K2, gcx, gcy);
  else drawBossBall(ctx, cell, 15 * L.K2, gcx, gcy);

  // The type square, or the dashed square of an open seat.
  const sq = L.HOME_TYPE_MARK;
  const sqX = x + L.GLYPH_COL + (L.TYPE_COL - sq) / 2;
  const sqY = y + (L.ROW2 - sq) / 2;
  if (vacantRow(card)) {
    ctx.save();
    ctx.strokeStyle = shades.dash;
    ctx.lineWidth = 1.4 * L.K2;
    ctx.setLineDash([4 * L.K2, 4 * L.K2]);
    // The stroke sits inside the square, as a CSS border does.
    const half = ctx.lineWidth / 2;
    roundRect(ctx, sqX + half, sqY + half, sq - 2 * half, sq - 2 * half, L.HOME_R - half);
    ctx.stroke();
    ctx.restore();
  } else {
    drawTypeMark(ctx, card.type, images, sqX, sqY, sq, L.HOME_R);
  }

  const detailsX = x + L.GLYPH_COL + L.TYPE_COL;
  if (layoutShowsGymDetails(layout)) {
    drawHomeGymDetails(ctx, card, shades, images, detailsX, y, geom.detailsCol, layout);
  }

  const teamBaseX = L.homeTeamOriginX(x, geom);
  if (!filled) {
    // An empty row says which seat is open, in the league's own words.
    ctx.save();
    ctx.font = font(11 * L.K2, 500);
    ctx.fillStyle = GREY;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const vacancyRight = L.homeVacancyAnchorX(x, geom, sideBySide);
    ctx.fillText(L.VACANCY[kind], vacancyRight - 6 * L.K2, y + L.ROW2 / 2);
    ctx.restore();
    return;
  }

  if (sideBySide) {
    const storyCells = exportRow(card, challengeRow);
    const rematchCells = exportRow(card, rematchRow);
    drawHomeTeamSprites(ctx, storyCells, images, teamBaseX, geom.seatCol, y);
    const rematchX = teamBaseX + geom.blockWidth + geom.sideGap;
    drawHomeTeamSprites(ctx, rematchCells, images, rematchX, geom.seatCol, y);
    return;
  }

  drawHomeTeamSprites(ctx, cells, images, teamBaseX, geom.seatCol, y);
}

function drawLeagueHome(
  ctx: CanvasRenderingContext2D,
  name: string,
  cards: GymCard[],
  view: LeagueView,
  layout: LeagueHomeExportLayout,
  geom: L.HomeExportGeometry,
  images: Images,
): void {
  // The picture is the league's content on white, edge to edge.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, geom.homeW, L.homeImgH(!!name, geom.homeW));

  const ox = L.HPADX;
  // An unnamed league opens on its first band, so the band takes the gutter
  // above it as well as either side of it.
  let y = L.homeTopPad(!!name, geom.homeW);

  // --- the identity line: the league's name, and nothing else ---
  // The tool's own name stays off the picture, and so does the reading:
  // someone handed it wants to know whose league it is, and the rows say
  // themselves which teams they are. An unnamed league gets no line, so the
  // picture starts at its first band and is that much shorter.
  if (name) {
    const big = 14 * L.K2;
    ctx.save();
    ctx.textBaseline = 'alphabetic';
    ctx.font = font(big, 700);
    ctx.fillStyle = FG;
    const base = y + L.HOME_HDR_H / 2 + capHeight(ctx) / 2;
    const room = geom.homeInner - 2 * L.HOME_RAIL;
    ctx.fillText(ellipsize(ctx, name, room), ox + L.HOME_RAIL, base);
    ctx.restore();
    y += L.HOME_HDR_H;
  }

  const bothTeamColumns = layoutShowsBothTeams(layout);

  for (let index = 0; index < SLOT_COUNT; index++) {
    const section = L.SECTION_BEFORE[index];
    if (section) {
      if (index !== 0) y += 2;
      // Every band splits over the two team blocks; only the first names them.
      for (const pill of L.homeSectionPills(ox, geom, section, bothTeamColumns, index === 0)) {
        paintSectionPill(ctx, pill.x, y, pill.w, pill.label, pill.align);
      }
      y += L.BAND2;
    }
    drawHomeRow(ctx, cards[index], index, view, layout, geom, images, ox, y);
    y += L.ROW2;
  }

  drawCredit(ctx, geom.homeW / 2, y + L.FOOT / 2, L.CREDIT_PX, L.HOME_CREDIT_PREFIX);
}

// ---------- assembling a PNG ----------

/**
 * Wait for the export's face.
 *
 * Text metrics decide every fit, so the real face has to be resident before
 * anything is measured. Without this the first export of a session measures a
 * fallback and lays the picture out to the wrong widths.
 */
async function fontsReady(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts?.ready) return;
  try {
    await document.fonts.ready;
  } catch {
    /* fall back to metrics as they are */
  }
}

async function render(
  w: number,
  h: number,
  paint: (ctx: CanvasRenderingContext2D) => void,
): Promise<Blob> {
  await fontsReady();
  // One PNG px per layout px, so the team sprites paint at their native 96px
  // (1×). Only the iOS area cap could lower it.
  const scale = Math.min(1, Math.sqrt(MAX_CANVAS_AREA / (w * h)));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.scale(scale, scale);
  clipExportCanvas(ctx, w, h);
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
  return render(L.CARD_IMG_W, L.CARD_IMG_H, (ctx) => drawGymCard(ctx, card, images));
}

/** The league summary as a PNG, at the layout's team mode. `view` fills in for "both". */
export async function exportLeagueHome(
  name: string,
  cards: GymCard[],
  view: LeagueView,
  layout: LeagueHomeExportLayout = DEFAULT_LEAGUE_HOME_EXPORT_LAYOUT,
): Promise<Blob> {
  const images = await loadAll(homeImageUrls(cards, view, layout));
  // The details column fits its widest line, so measure before the canvas
  // takes its size.
  await fontsReady();
  const measure = document.createElement('canvas').getContext('2d');
  if (!measure) throw new Error('Canvas 2D context unavailable');
  const geom = L.homeExportGeometry(
    layoutShowsGymDetails(layout),
    layoutShowsBothTeams(layout),
    homeDetailsNeed(measure, cards, images, layout),
  );
  const named = Boolean(name) && layout.showLeagueName;
  const innerH = L.homeImgH(named, geom.homeW);
  const w = geom.homeW + 2 * L.FRAME;
  const h = innerH + 2 * L.FRAME;
  return render(w, h, (ctx) => {
    ctx.fillStyle = HOME_FRAME;
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(L.FRAME, L.FRAME, geom.homeW, innerH, exportInnerCornerRadius(w, h, L.FRAME));
    ctx.clip();
    ctx.translate(L.FRAME, L.FRAME);
    drawLeagueHome(ctx, named ? name : '', cards, view, layout, geom, images);
    ctx.restore();
  });
}
