// platform: Rasterizing the DOM needs SVG `<foreignObject>`, which hangs on iOS WebKit, so the export redraws on a canvas.

import type { TypeName } from '@/types/pokemon';
import { TYPE_COLORS } from '@/data/type-colors';
import { getPokemonById } from '@/league/data/catalog';
import { drawTypeBadge, drawTypeIcon } from '@/lib/drawTypeBadge';
import { TYPE_BADGE, TYPE_BADGE_H } from '@/lib/typeBadgeGeometry';
import { drawExportCredit as drawCredit } from '@/lib/exportCredit';
import { clipExportCanvas, exportInnerCornerRadius } from '@/lib/exportPngShape';
import { localeUppercase, pokemonLabel, t } from '@/i18n';
import type { GymCard, LeagueView } from '../store/useLeagueStore';
import { legendsOf, powerupsAt } from '../store/useLeagueStore';
import { deriveRow, signatureMember, type CardCell } from '../model/engine';
import { formAt, type PowerupForm } from '../model/powerups';
import { SLOT_COUNT, slotKind, slotRow } from '../model/constants';
import { NO_TYPE_STAR_RADIUS, cardShades, type CardShades } from '../theme';
import { getMoveById, CATEGORY_COLORS, type Move } from '../moves';
import { activeMoveNames, moveName } from '../moveNames';
import { RING_OF_SPRITE } from '../slotLayout';
import { fitHeadings } from '../showcaseLayout';
import { headingInline, headingLines, headingTracks, type SlotHeading } from '../slotHeadings';
import * as L from './layout';
import {
  DEFAULT_LEAGUE_HOME_EXPORT_LAYOUT,
  layoutShowsBothTeams,
  layoutShowsGymDetails,
  type LeagueHomeExportLayout,
  type CardTeamOrder,
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
import { leagueSpriteUrl } from '../leagueSprite';
import { drawGenderSymbol, genderSymbol, genderSymbolWidth } from '@/lib/genderSymbol';

const FG = '#0a0a0a';
const RED = '#DC2626';
const HOME_FRAME = RED;
const GREY = '#a3a3a3';
const NO_TYPE = '#9CA3AF';
const HOME_LINE = '#f0f0f1';

// platform: iOS Safari refuses a canvas over about 16.7M pixels, and `toBlob` then never calls back.
const MAX_CANVAS_AREA = 16_000_000;

export function showcasePair(card: GymCard): { ace: number | null; partner: number | null } {
  const seat = card.signatureSeat;
  const ace = seat === null ? null : signatureMember(card.lines[seat - 1], card.signatureId ?? null);
  return { ace, partner: card.partnerId ?? null };
}

function showcaseShiny(card: GymCard): { ace: boolean; partner: boolean } {
  const seat = card.signatureSeat;
  return { ace: seat !== null && card.lines[seat - 1]?.shiny === true, partner: card.partnerShiny === true };
}

interface ExportCell extends CardCell {
  form: PowerupForm | null;
}

export function exportRow(card: GymCard, row: number): ExportCell[] {
  const cells = deriveRow(card.lines, row, row === L.BOSS_ROW ? legendsOf(card) : []);
  const powerups = powerupsAt(card, row);
  return cells.map((c) => ({ ...c, form: formAt(powerups, row, c.seat, c.pokemonId) }));
}

function ballColours(pokemonId: number): [string, string] {
  const types = getPokemonById(pokemonId)?.types ?? [];
  const primary = TYPE_COLORS[types[0] as TypeName] ?? NO_TYPE;
  const secondary = TYPE_COLORS[(types[1] ?? types[0]) as TypeName] ?? primary;
  return [primary, secondary];
}

type Images = Map<string, HTMLImageElement>;

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
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

function cardImageUrls(card: GymCard): string[] {
  const urls: string[] = [];
  const { ace, partner } = showcasePair(card);
  const shiny = showcaseShiny(card);
  for (const url of [leagueSpriteUrl(ace, null, shiny.ace), leagueSpriteUrl(partner, null, shiny.partner)]) {
    if (url) urls.push(url);
  }
  for (let row = 1; row <= L.ROW_COUNT; row++) {
    for (const cell of exportRow(card, row)) {
      const url = leagueSpriteUrl(cell.pokemonId, cell.form, cell.shiny);
      if (url) urls.push(url);
    }
  }
  const move = card.tmMoveId === null ? undefined : getMoveById(card.tmMoveId);
  if (move) urls.push(`/sprites/moves/${move.category}.png`);
  return urls;
}

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

function homeImageUrls(cards: GymCard[], view: LeagueView, layout: LeagueHomeExportLayout): string[] {
  const urls: string[] = [];
  cards.forEach((card, index) => {
    if (layout.showTmReward) {
      const move = card.tmMoveId === null ? undefined : getMoveById(card.tmMoveId);
      if (move) urls.push(`/sprites/moves/${move.category}.png`);
    }
    if (card.lines.length === 0) return;
    for (const row of homeRowsForCard(index, view, layout)) {
      for (const cell of exportRow(card, row)) {
        const url = leagueSpriteUrl(cell.pokemonId, cell.form, cell.shiny);
        if (url) urls.push(url);
      }
    }
  });
  return urls;
}

function drawTypeMark(
  ctx: CanvasRenderingContext2D,
  type: GymCard['type'],
  x: number,
  y: number,
  size: number,
  radius: number,
): void {
  if (type && type !== 'none') {
    ctx.save();
    roundRect(ctx, x, y, size, size, radius);
    ctx.clip();
    drawTypeIcon(ctx, type, x, y, size);
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.fillStyle = NO_TYPE;
  roundRect(ctx, x, y, size, size, radius);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  drawFourPointStar(ctx, x + size / 2, y + size / 2, size * NO_TYPE_STAR_RADIUS);
  ctx.restore();
}

function capHeight(ctx: CanvasRenderingContext2D): number {
  const m = ctx.measureText('H');
  return m.actualBoundingBoxAscent || parseFloat(ctx.font) * 0.72;
}

interface HeadFace {
  px: number;
  track: number;
}

function headFace(ctx: CanvasRenderingContext2D, lines: { text: string; room: number }[]): HeadFace {
  ctx.font = font(L.HEAD_PX, 800);
  const fit = fitHeadings(
    lines.map(({ text, room }) => ({ width: ctx.measureText(text).width, letters: [...text].length, room })),
    L.HEAD_PX,
  );
  const px = Math.max(L.CAPTION_NAME_MIN_PX, Math.min(L.HEAD_PX, fit.size));
  return { px, track: headingTracks() && px === L.HEAD_PX ? fit.track : 0 };
}

function drawHeading(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  cx: number,
  top: number,
  colour: string,
  face: HeadFace,
): void {
  ctx.save();
  ctx.font = font(face.px, 800);
  ctx.fillStyle = colour;
  ctx.textBaseline = 'middle';
  ctx.translate(cx, top);
  lines.forEach((line, i) => {
    fillTrackedCentered(ctx, line, 0, (i + 0.5) * L.HEAD_LINE, face.track);
  });
  ctx.restore();
}

function drawShowcaseArt(
  ctx: CanvasRenderingContext2D,
  pokemonId: number,
  shiny: boolean,
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
    const img = images.get(leagueSpriteUrl(pokemonId, null, shiny) ?? '');
    if (img) drawSprite(ctx, img, cx, cy, sprite);
  }
}

function speciesCaption(pokemonId: number): { text: string; mark?: string } {
  const pokemon = getPokemonById(pokemonId);
  if (!pokemon) return { text: '' };
  const label = pokemonLabel(pokemon.id, pokemon.name);
  return { text: localeUppercase(label.pending ? pokemon.name : label.name),
    mark: label.mark ?? undefined };
}

interface CaptionRun {
  text: string;
  mark?: string;
  px: number;
  track: number;
  colour: string;
}

interface CaptionLine extends CaptionRun {
  x: number;
  cy: number;
  halo: L.Box;
}

function headRun(text: string, colour: string, face: HeadFace): CaptionRun {
  return { text, px: face.px, track: face.track, colour };
}

function captionMarkWidth(ctx: CanvasRenderingContext2D, mark: string | undefined, px: number): number {
  if (!mark) return 0;
  const previous = ctx.font;
  ctx.font = font(px * 0.8, 600);
  const width = mark.split(/([♂♀])/u).reduce((sum, part) => sum + (genderSymbol(part)
    ? genderSymbolWidth(part, px * 0.8) : ctx.measureText(part).width), 0);
  ctx.font = previous;
  return width + px * 0.15;
}

function nameRun(ctx: CanvasRenderingContext2D, pokemonId: number | null, room: number): CaptionRun {
  const { text, mark } = pokemonId === null ? { text: '' } : speciesCaption(pokemonId);
  const trackAt = (px: number) => (L.NAME_TRACK / L.NAME_PX) * px;
  let px = L.NAME_PX;
  ctx.font = font(px, 800);
  while (px > L.CAPTION_NAME_MIN_PX && trackedWidth(ctx, text, trackAt(px)) + captionMarkWidth(ctx, mark, px) > room) {
    px = Math.max(L.CAPTION_NAME_MIN_PX, px - 0.5);
    ctx.font = font(px, 800);
  }
  return { text: ellipsizeTracked(ctx, text, room - captionMarkWidth(ctx, mark, px), trackAt(px)), mark,
    px, track: trackAt(px), colour: FG };
}

function layoutCaption(
  ctx: CanvasRenderingContext2D,
  runs: CaptionRun[],
  align: 'center' | 'right',
  anchor: number,
  top: number,
): CaptionLine[] {
  return runs.map((run, i) => {
    ctx.font = font(run.px, 800);
    const w = trackedWidth(ctx, run.text, run.track) + captionMarkWidth(ctx, run.mark, run.px);
    const x = align === 'center' ? anchor - w / 2 : anchor - w;
    // platform: CSS letter-spacing also follows the last letter, so the tracked width includes space that is not ink.
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

function fillCaption(ctx: CanvasRenderingContext2D, lines: CaptionLine[]): void {
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  for (const line of lines) {
    ctx.font = font(line.px, 800);
    ctx.fillStyle = line.colour;
    const baseline = line.cy + capHeight(ctx) / 2;
    fillTracked(ctx, line.text, line.x, baseline, line.track);
    if (line.mark) {
      const markX = line.x + trackedWidth(ctx, line.text, line.track) + line.px * 0.15;
      ctx.save();
      ctx.globalAlpha *= 0.7;
      ctx.font = font(line.px * 0.8, 600);
      let x = markX;
      for (const part of line.mark.split(/([♂♀])/u)) {
        if (genderSymbol(part)) {
          drawGenderSymbol(ctx, part, x, baseline, line.px * 0.8);
          x += genderSymbolWidth(part, line.px * 0.8);
        } else {
          ctx.fillText(part, x, baseline);
          x += ctx.measureText(part).width;
        }
      }
      ctx.restore();
    }
  }
  ctx.restore();
}

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
  const shiny = showcaseShiny(card);
  const filled = ace !== null || partner !== null;
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
      const heading: SlotHeading = ace === partner ? 'signature' : ace !== null ? 'ace' : 'partner';
      const lines = headingLines(heading);
      const headH = lines.length * L.HEAD_LINE;
      const clusterH = headH + sprite + L.NAME_LINE;
      const top = y + (box.height - clusterH) / 2;
      const cx = x + box.width / 2;
      const spriteCy = top + headH + sprite / 2;
      drawShowcaseArt(ctx, id, ace !== null ? shiny.ace : shiny.partner, images, cx, spriteCy, sprite, 'both');
      const face = headFace(ctx, lines.map((text) => ({ text, room: box.width - 2 * L.SHOWCASE_PAD })));
      drawHeading(ctx, lines, cx, top, shades.band, face);
      ctx.save();
      ctx.font = font(L.NAME_PX, 800);
      ctx.fillStyle = FG;
      ctx.textBaseline = 'middle';
      const caption = speciesCaption(id);
      const nameCy = spriteCy + sprite / 2 + L.NAME_LINE / 2;
      if (caption.mark) {
        fillCaption(ctx, layoutCaption(ctx, [{ ...caption, px: L.NAME_PX, track: L.NAME_TRACK, colour: FG }],
          'center', cx, nameCy - L.HEAD_LINE / 2));
      } else {
        fillTrackedCentered(ctx, caption.text, cx, nameCy, L.NAME_TRACK);
      }
      ctx.restore();
    }
    ctx.restore();
    return;
  }

  const panel = { x, y, w: box.width, h: box.height };
  const squares = L.showcaseSquares(ox, oy);
  const headColour = (id: number | null) => (id !== null ? shades.band : shades.hint);
  const aceSq = squares.ace;
  const partnerSq = squares.partner;
  const partnerRight = partnerSq.x - L.CAPTION_GAP_X;
  const partnerRoom = partnerRight - x - L.CAPTION_GAP_X;
  const aceHead = headingInline('ace');
  const partnerHead = headingLines('partner');
  const face = headFace(ctx, [
    { text: aceHead, room: aceSq.w },
    ...partnerHead.map((text) => ({ text, room: partnerRoom })),
  ]);
  const aceLines = layoutCaption(
    ctx,
    [headRun(aceHead, headColour(ace), face), nameRun(ctx, ace, aceSq.w)],
    'center',
    aceSq.x + aceSq.w / 2,
    aceSq.y + aceSq.h + L.CAPTION_GAP_Y,
  );
  const partnerRuns = [
    ...partnerHead.map((line) => headRun(line, headColour(partner), face)),
    nameRun(ctx, partner, partnerRoom),
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
    { id: ace, shiny: shiny.ace, square: aceSq },
    { id: partner, shiny: shiny.partner, square: partnerSq },
  ];
  for (const { id, square } of halves) {
    if (id === null) continue;
    drawShowcaseArt(ctx, id, false, images, square.x + square.w / 2, square.y + square.h / 2, square.w, 'ball');
  }
  strokeSeam(
    ctx,
    L.seamSegment(panel, depth),
    [...halos(aceLines), ...halos(partnerLines)],
    panel,
    shades.dash,
  );
  for (const { id, shiny: shown, square } of halves) {
    const cx = square.x + square.w / 2;
    const cy = square.y + square.h / 2;
    if (id !== null) drawShowcaseArt(ctx, id, shown, images, cx, cy, square.w, 'sprite');
    else drawEmptyBall(ctx, RING_OF_SPRITE * square.w, cx, cy);
  }
  fillCaption(ctx, [...aceLines, ...partnerLines]);
  ctx.restore();
}

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
    const track = L.labelTrack(L.MARK_TRACK);
    const room = L.MARK_COL + 2 * L.MARK_PAD;
    const wide = trackedWidth(ctx, word, track);
    if (wide > room) ctx.font = font((L.MARK_LABEL_PX * room) / wide, 800);
    fillTrackedCentered(ctx, word, cx, mark.labelCy, wide > room ? (track * room) / wide : track);
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
    drawMarkColumn(ctx, L.markWord('league.tm.mark'), shades.hint, markCx, cy, (size, gx, gy) =>
      drawTmDisc(ctx, shades.dash, size, gx, gy),
    );
    return;
  }

  const moveShades = cardShades(move.type as TypeName);
  drawMarkColumn(ctx, L.markWord('league.tm.mark'), moveShades.band, markCx, cy, (size, gx, gy) =>
    drawTmDisc(ctx, TYPE_COLORS[move.type as TypeName], size, gx, gy),
  );

  const badgeH = L.tmBadgeH();
  const name = L.moveExportName(moveName(move));
  const nameTrack = L.labelTrack(L.NAME_TRACK);
  ctx.save();
  ctx.font = font(L.NAME_PX, 800);
  const lines = wrapTracked(ctx, name, bodyW, nameTrack);
  const widestAt = (scale: number) => {
    ctx.font = font(L.NAME_PX * scale, 800);
    return Math.max(...lines.map((line) => paintedWidth(ctx, line, nameTrack * scale)));
  };
  let nameScale = 1;
  if (widestAt(1) > bodyW) {
    // Glyph widths do not scale exactly with the size, so step down to fit.
    nameScale = bodyW / widestAt(1);
    while (nameScale > 0.3 && widestAt(nameScale) > bodyW) nameScale -= 0.01;
  }
  ctx.font = font(L.NAME_PX, 800);
  const body = L.tmMoveBody(cy, lines.length);

  ctx.beginPath();
  ctx.rect(bodyX, y, bodyW, h);
  ctx.clip();

  drawTypeBadge(ctx, move.type as TypeName, bodyX, body.badgeY, badgeH);

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
  if (nameScale < 1) ctx.font = font(L.NAME_PX * nameScale, 800);
  // platform: WebKit's `emHeightAscent` is the font ascent and Blink has none, so the cap height is used on every engine.
  const ascent = capHeight(ctx);
  ctx.textBaseline = 'alphabetic';
  lines.forEach((line, i) => {
    fillTracked(
      ctx,
      line,
      bodyX,
      L.cssLineAlphabetic(body.nameTop + i * L.NAME_LINE, L.NAME_LINE, L.NAME_PX * nameScale, ascent),
      nameTrack * nameScale,
    );
  });
  ctx.restore();
}

function paintedWidth(ctx: CanvasRenderingContext2D, text: string, track: number): number {
  if (track === 0) return ctx.measureText(text).width;
  const chars = [...text];
  let right = 0;
  for (let i = 0; i < chars.length; i++) {
    const at = ctx.measureText(chars.slice(0, i).join('')).width + track * i;
    right = Math.max(right, at + ctx.measureText(chars[i]).width);
  }
  return Math.max(right, trackedWidth(ctx, text, track));
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

  drawMarkColumn(ctx, name ? '' : L.markWord('league.badge.mark'), name ? shades.band : shades.hint, markCx, cy, (size, gx, gy) =>
    drawHexagon(ctx, name ? shades.type : shades.dash, !!name, size, gx, gy),
  );

  if (!name) return;

  ctx.save();
  ctx.font = font(L.NAME_PX, 800);
  ctx.fillStyle = shades.band;
  ctx.textBaseline = 'middle';
  let next = name;
  let lines = wrapLines(ctx, L.badgeExportPhrase(next), bodyW, 3, false);
  while (next && !badgeLinesKeepSuffix(lines, bodyW, ctx, L.badgeExportPhrase(next))) {
    next = next.slice(0, -1).replace(/[\s\u00a0]+$/u, '');
    lines = wrapLines(ctx, L.badgeExportPhrase(next), bodyW, 3, false);
  }
  const lineH = L.NAME_LINE;
  const top = cy - (lines.length * lineH) / 2;
  lines.forEach((line, i) => {
    fillTracked(ctx, line, bodyX, top + (i + 0.5) * lineH, L.labelTrack(L.NAME_TRACK));
  });
  ctx.restore();
}

function badgeLinesKeepSuffix(
  lines: string[],
  maxW: number,
  ctx: CanvasRenderingContext2D,
  phrase: string,
): boolean {
  if (lines.length === 0) return false;
  const last = lines[lines.length - 1] ?? '';
  const suffix = L.badgeExportSuffix();
  const whole = suffix
    ? last.endsWith(suffix)
    : lines.join(' ').split(/\s+/).join(' ') === phrase.trim().split(/\s+/).join(' ');
  return whole && ctx.measureText(last).width <= maxW + 0.5;
}

function drawBand(
  ctx: CanvasRenderingContext2D,
  shades: CardShades,
  label: string,
  note: string | null,
  ox: number,
  y: number,
): void {
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
  const track = L.labelTrack(0.07 * size);
  const cy = y + L.BAND / 2;
  let tx = x + L.BAND_R;
  fillTracked(ctx, label, tx, cy, track);
  if (note) {
    tx += trackedWidth(ctx, label, track) + 5 * L.K;
    const room = x + w - L.BAND_R - tx;
    ctx.font = font(size, 400);
    const natural = ctx.measureText(note).width;
    if (natural > room) ctx.font = font(Math.max(size * 0.8, (size * room) / natural), 400);
    ctx.globalAlpha = 0.85;
    ctx.fillText(ellipsize(ctx, note, room), tx, cy);
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
    const size = 9.5 * L.K;
    ctx.font = font(size, 600);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const block = size + 3 * L.K + 8 * L.K;
    ctx.fillText(t('league.glyph.noBadges'), cx, cy - block / 2 + size / 2);
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
  teamOrder: CardTeamOrder,
): void {
  const shades = cardShades(card.type);
  const type = card.type !== 'none' ? card.type : null;

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
  const right = ox + innerW - L.RAIL;

  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.font = font(L.TITLE_PX, 800);
  const titleBase = L.BAR_H / 2 + capHeight(ctx) / 2;
  ctx.fillStyle = '#ffffff';
  let x = fx + L.BAR_TEXT_X;
  const titleTrack = L.labelTrack(L.TITLE_TRACK);
  const title = L.cardTitle();
  fillTracked(ctx, title, x, titleBase, titleTrack);
  x += trackedWidth(ctx, title, titleTrack) + L.TITLE_GAP;
  if (type) {
    const specialist = L.specialistRuns();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(L.TITLE_SEP, x, titleBase);
    x += ctx.measureText(L.TITLE_SEP).width + L.TITLE_GAP;
    if (specialist.before) {
      ctx.fillStyle = '#ffffff';
      fillTracked(ctx, specialist.before, x, titleBase, titleTrack);
      x += trackedWidth(ctx, specialist.before, titleTrack) + L.TITLE_WORD_GAP;
    }
    const badgeTop = (L.BAR_H - L.TITLE_BADGE_H) / 2;
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
    drawTypeBadge(ctx, type, x, badgeTop, L.TITLE_BADGE_H);
    x += L.TITLE_BADGE_W + L.TITLE_WORD_GAP;
    ctx.fillStyle = '#ffffff';
    if (specialist.after) fillTracked(ctx, specialist.after, x, titleBase, titleTrack);
  }
  ctx.restore();

  const fieldTop = L.BAR_H + L.THEME_GAP;
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.font = font(L.THEME_LABEL_PX, 800);
  const labelTrack = L.labelTrack(0.1 * L.THEME_LABEL_PX);
  const themeLabel = localeUppercase(t('league.export.theme'));
  ctx.fillStyle = shades.band;
  const labelX = ox + L.RAIL;
  fillTracked(ctx, themeLabel, labelX, fieldTop + L.FIELD_H / 2 + capHeight(ctx) / 2, labelTrack);
  const fieldX = labelX + trackedWidth(ctx, themeLabel, labelTrack) + L.LABEL_GAP;
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, fieldX, fieldTop, right - fieldX, L.FIELD_H, L.FIELD_R);
  ctx.fill();
  ctx.font = font(L.THEME_TEXT_PX, card.theme ? 700 : 500);
  ctx.fillStyle = card.theme ? FG : shades.hint;
  const room = right - fieldX - 2 * L.FIELD_PADX;
  ctx.fillText(
    ellipsize(ctx, card.theme || t('league.export.noTheme'), room),
    fieldX + L.FIELD_PADX,
    fieldTop + L.FIELD_H / 2 + capHeight(ctx) / 2,
  );
  ctx.restore();

  const gridY = L.gridTop();

  drawBand(ctx, shades, localeUppercase(t('league.band.team')), null, ox, gridY);
  for (let row = 1; row <= L.ROW_COUNT; row++) {
    const banner = L.BAND_BEFORE[row];
    if (banner) drawBand(ctx, shades, localeUppercase(t(banner[0])), t(banner[1]), ox, gridY + L.rowTop(row) - L.BAND);
    const y = gridY + L.rowTop(row);
    if (row !== 1 && !banner) {
      ctx.save();
      ctx.fillStyle = shades.line;
      ctx.fillRect(ox, y, innerW, L.K);
      ctx.restore();
    }
    const resolved = exportRow(card, row);
    const occupied = resolved.filter((cell) => cell.pokemonId !== null);
    const cells = teamOrder === 'first-last' && occupied.length > 0
      ? [...occupied.slice(0, -1).reverse(), ...occupied.slice(-1)]
      : resolved;
    const span = L.GLYPH_SPAN[row] ?? 1;
    const glyphLead = 7 - resolved.length - span;
    const pokemonLead = 7 - cells.length;
    drawGlyphCell(ctx, row, span, shades, ox + glyphLead * L.COL, y);
    cells.forEach((cell, i) => {
      const cx = ox + (pokemonLead + i) * L.COL + L.COL / 2;
      const cy = y + L.ROW / 2;
      const w = L.COL - 2 * L.INX;
      const h = L.ROW - 2 * L.INY;
      const url = leagueSpriteUrl(cell.pokemonId, cell.form, cell.shiny);
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

  drawShowcase(ctx, card, shades, images, ox, gridY);
  drawTmSlot(ctx, card.tmMoveId === null ? undefined : getMoveById(card.tmMoveId), shades, images, ox, gridY);
  drawBadgeSlot(ctx, card.badgeName, shades, ox, gridY);

  drawCredit(ctx, fx + L.CARD_W / 2, gridY + L.gridHeight() + L.FOOT / 2, L.CREDIT_PX, L.cardCreditPrefix());
}

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
    const url = leagueSpriteUrl(c.pokemonId, c.form, c.shiny);
    const img = url ? images.get(url) : undefined;
    if (img) drawSprite(ctx, img, cx, cy, 96);
    else drawEmptyBall(ctx, 18 * L.K2, cx, cy);
  });
}

const DETAIL_PAD = 2 * L.K2;
const THEME_VALUE_GAP = 5 * L.K2;

interface DetailLine {
  need: number;
  paint: (bodyX: number, right: number, midY: number) => void;
}

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

  const markWidth = (text: string, track = L.HOME_MARK_TRACK): number => {
    ctx.save();
    ctx.font = font(L.HOME_MARK_LABEL_PX, 800);
    const w = trackedWidth(ctx, text, track);
    ctx.restore();
    return w;
  };
  const wordTrack = L.labelTrack(L.HOME_MARK_TRACK);
  const themeLabel = localeUppercase(t('league.export.theme'));

  if (themeText) {
    const labelW = markWidth(themeLabel, wordTrack);
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
        fillTracked(ctx, themeLabel, bodyX, midY, wordTrack);
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
    const moveUpper = L.moveExportName(moveName(move));
    const trailing = L.HOME_DETAIL_GAP + L.HOME_DETAIL_TYPE + L.HOME_DETAIL_GAP + L.HOME_DETAIL_CHIP_W;
    lines.push({
      need: 2 * DETAIL_PAD + markInset + markWidth(moveUpper, wordTrack) + trailing,
      paint: (bodyX, right, midY) => {
        const markX = bodyX + markInset;
        const iconY = midY - L.HOME_DETAIL_ICON / 2;
        drawTmDisc(ctx, TYPE_COLORS[move.type as TypeName], L.HOME_DETAIL_ICON, bodyX, iconY);
        const nameW = Math.max(8, right - trailing - markX);
        ctx.save();
        ctx.font = font(L.HOME_MARK_LABEL_PX, 800);
        ctx.fillStyle = moveShades.band;
        ctx.textBaseline = 'middle';
        const name = ellipsizeTracked(ctx, moveUpper, nameW, wordTrack);
        fillTracked(ctx, name, markX, midY, wordTrack);
        const typeX = markX + trackedWidth(ctx, name, wordTrack) + L.HOME_DETAIL_GAP;
        ctx.restore();
        drawTypeMark(
          ctx,
          move.type as TypeName,
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
    const badgeText = L.badgeExportPhrase(badgeName);
    lines.push({
      need: 2 * DETAIL_PAD + markInset + markWidth(badgeText, wordTrack),
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
          ellipsizeTracked(ctx, badgeText, textW, wordTrack),
          textX,
          midY,
          wordTrack,
        );
        ctx.restore();
      },
    });
  }

  return lines;
}

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
    const track = L.labelTrack(0.07 * size);
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

  const sq = L.HOME_TYPE_MARK;
  const sqX = x + L.GLYPH_COL + (L.TYPE_COL - sq) / 2;
  const sqY = y + (L.ROW2 - sq) / 2;
  if (vacantRow(card)) {
    ctx.save();
    ctx.strokeStyle = shades.dash;
    ctx.lineWidth = 1.4 * L.K2;
    ctx.setLineDash([4 * L.K2, 4 * L.K2]);
    const half = ctx.lineWidth / 2;
    roundRect(ctx, sqX + half, sqY + half, sq - 2 * half, sq - 2 * half, L.HOME_R - half);
    ctx.stroke();
    ctx.restore();
  } else {
    drawTypeMark(ctx, card.type, sqX, sqY, sq, L.HOME_R);
  }

  const detailsX = x + L.GLYPH_COL + L.TYPE_COL;
  if (layoutShowsGymDetails(layout)) {
    drawHomeGymDetails(ctx, card, shades, images, detailsX, y, geom.detailsCol, layout);
  }

  const teamBaseX = L.homeTeamOriginX(x, geom);
  if (!filled) {
    ctx.save();
    ctx.font = font(11 * L.K2, 500);
    ctx.fillStyle = GREY;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const vacancyRight = L.homeVacancyAnchorX(x, geom, sideBySide);
    ctx.fillText(t(L.VACANCY[kind]), vacancyRight - 6 * L.K2, y + L.ROW2 / 2);
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
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, geom.homeW, L.homeImgH(!!name, geom.homeW));

  const ox = L.HPADX;
  let y = L.homeTopPad(!!name, geom.homeW);

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
      for (const pill of L.homeSectionPills(ox, geom, localeUppercase(t(section)), bothTeamColumns, index === 0)) {
        paintSectionPill(ctx, pill.x, y, pill.w, pill.label, pill.align);
      }
      y += L.BAND2;
    }
    drawHomeRow(ctx, cards[index], index, view, layout, geom, images, ox, y);
    y += L.ROW2;
  }

  drawCredit(ctx, geom.homeW / 2, y + L.FOOT / 2, L.CREDIT_PX, L.homeCreditPrefix());
}

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
    return;
  }
}

async function render(
  w: number,
  h: number,
  paint: (ctx: CanvasRenderingContext2D) => void,
): Promise<Blob> {
  await fontsReady();
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
    // platform: iOS occasionally never calls the `toBlob` callback, so a timeout keeps the export spinner from hanging.
    const timer = window.setTimeout(() => reject(new Error('Canvas toBlob timed out')), 15000);
    canvas.toBlob((blob) => {
      window.clearTimeout(timer);
      if (blob) resolve(blob);
      else reject(new Error('Canvas toBlob failed'));
    }, 'image/png');
  });
}

export async function exportGymCard(card: GymCard, teamOrder: CardTeamOrder = 'fixed'): Promise<Blob> {
  const [images] = await Promise.all([loadAll(cardImageUrls(card)), activeMoveNames()]);
  return render(L.CARD_IMG_W, L.CARD_IMG_H, (ctx) => drawGymCard(ctx, card, images, teamOrder));
}

export async function exportLeagueHome(
  name: string,
  cards: GymCard[],
  view: LeagueView,
  layout: LeagueHomeExportLayout = DEFAULT_LEAGUE_HOME_EXPORT_LAYOUT,
): Promise<Blob> {
  const [images] = await Promise.all([loadAll(homeImageUrls(cards, view, layout)), activeMoveNames()]);
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
