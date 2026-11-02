import { describe, expect, it } from 'vitest';
import * as L from './layout';
import { showcasePair, exportRow, vacantRow, homeRowsForCard } from './exportLeague';
import { emptyCard, type GymCard } from '../store/useLeagueStore';
import { makePlacedLine } from '../model/engine';
import { DEFAULT_LEAGUE_HOME_EXPORT_LAYOUT } from './exportOptions';

describe('export layout', () => {
  it('puts every team sprite on a whole pixel', () => {
    // platform: A canvas sprite centred on a half pixel resamples one device pixel off the browser's placement, which reads as hatching.
    expect(Number.isInteger(L.TITLE_BLOCK_H)).toBe(true);
    expect(Number.isInteger(L.FRAME)).toBe(true);
    for (let i = 0; i < 7; i++) {
      expect(Number.isInteger(L.FRAME + L.PADX + (i + 0.5) * L.COL)).toBe(true);
    }
    for (let row = 1; row <= L.ROW_COUNT; row++) {
      expect(Number.isInteger(L.gridTop() + L.rowTop(row) + L.ROW / 2)).toBe(true);
    }
  });

  it('puts the ace and the partner on whole pixels, inside the panel', () => {
    const ox = L.FRAME + L.PADX;
    const oy = L.gridTop();
    const box = L.showcaseBox();
    const { ace, partner } = L.showcaseSquares(ox, oy);
    expect(ace.w).toBe(2 * partner.w);
    for (const sq of [ace, partner]) {
      expect(Number.isInteger(sq.x)).toBe(true);
      expect(Number.isInteger(sq.y)).toBe(true);
      expect(sq.x).toBeGreaterThanOrEqual(ox + box.left);
      expect(sq.y).toBeGreaterThanOrEqual(oy + box.top);
      expect(sq.x + sq.w).toBeLessThanOrEqual(ox + box.left + box.width);
      expect(sq.y + sq.h).toBeLessThanOrEqual(oy + box.top + box.height);
    }
  });

  it('runs the seam clear of both sprites and inside the panel, for any caption width', () => {
    const box = L.showcaseBox();
    const panel = { x: box.left, y: box.top, w: box.width, h: box.height };
    const { ace, partner } = L.showcaseSquares(0, 0);
    const lineBox = (x: number, y: number, w: number) => ({ x, y, w, h: L.HEAD_LINE });
    const depth = (x: number, y: number) => y + Math.tan(Math.PI / 6) * x;
    const clear = L.SEAM_SQUARE_CLEAR / Math.cos(Math.PI / 6);
    for (let aceW = 0; aceW <= ace.w; aceW += 8) {
      for (let partnerW = 0; partnerW <= partner.x - panel.x; partnerW += 8) {
        const aceCx = ace.x + ace.w / 2;
        const aceLines = [0, 1].map((i) => lineBox(aceCx - aceW / 2, ace.y + ace.h + i * L.HEAD_LINE, aceW));
        const top = partner.y + partner.h / 2 - 1.5 * L.HEAD_LINE;
        const partnerLines = [0, 1, 2].map((i) => lineBox(partner.x - partnerW, top + i * L.HEAD_LINE, partnerW));
        const d = L.seamDepth({ square: ace, lines: aceLines }, { square: partner, lines: partnerLines });
        expect(d - depth(ace.x + ace.w, ace.y + ace.h)).toBeGreaterThanOrEqual(clear - 1e-9);
        expect(depth(partner.x, partner.y) - d).toBeGreaterThanOrEqual(clear - 1e-9);
        const seg = L.seamSegment(panel, d);
        for (const [sx, sy] of [[seg.x1, seg.y1], [seg.x2, seg.y2]]) {
          expect(sx).toBeGreaterThanOrEqual(panel.x - 1e-9);
          expect(sx).toBeLessThanOrEqual(panel.x + panel.w + 1e-9);
          expect(sy).toBeGreaterThanOrEqual(panel.y - 1e-9);
          expect(sy).toBeLessThanOrEqual(panel.y + panel.h + 1e-9);
          expect(depth(sx, sy)).toBeCloseTo(d, 9);
        }
        const aceReach = Math.max(
          depth(ace.x + ace.w, ace.y + ace.h) + clear,
          ...aceLines.map((b) => depth(b.x + b.w, b.y + b.h)),
        );
        const partnerReach = Math.min(
          depth(partner.x, partner.y) - clear,
          ...partnerLines.map((b) => depth(b.x, b.y)),
        );
        if (aceReach <= partnerReach) {
          expect(d).toBeGreaterThanOrEqual(aceReach);
          expect(d).toBeLessThanOrEqual(partnerReach);
        }
      }
    }
  });

  it('draws the solo showcase sprite at a whole multiple of the source, larger than the partner', () => {
    const box = L.showcaseBox();
    const sprite = L.soloExportSprite(box.width, box.height);
    expect(sprite % 96).toBe(0);
    expect(sprite).toBeGreaterThanOrEqual(96);
    expect(sprite).toBeGreaterThan(L.PARTNER_SPRITE);
    const pad = 0.5 * 16 * L.K;
    expect(sprite).toBeLessThanOrEqual(box.width - 2 * pad);
    expect(2 * L.HEAD_LINE + L.NAME_LINE + sprite + 2 * pad).toBeLessThanOrEqual(box.height);
  });

  it('splits every band at the same x in both-teams mode, with equal gaps and pills', () => {
    const geom = L.homeExportGeometry(true, true, 0);
    const gym = L.homeSectionPills(0, geom, 'GYM LEADERS', true, true);
    expect(gym).toHaveLength(3);
    const gap12 = gym[1].x - (gym[0].x + gym[0].w);
    const gap23 = gym[2].x - (gym[1].x + gym[1].w);
    expect(gap12).toBeCloseTo(L.HOME_SIDE_GAP, 6);
    expect(gap23).toBeCloseTo(L.HOME_SIDE_GAP, 6);
    expect(gym[0].w).toBeCloseTo(geom.blockWidth, 6);
    expect(gym[1].w).toBeCloseTo(geom.blockWidth, 6);
    expect(gym[2].w).toBeCloseTo(geom.blockWidth, 6);

    for (const title of ['ELITE FOUR', 'CHAMPION', 'ENDGAME BOSS']) {
      const pills = L.homeSectionPills(0, geom, title, true, false);
      expect(pills.map((p) => [p.x, p.w])).toEqual(gym.map((p) => [p.x, p.w]));
      expect(pills.map((p) => p.label)).toEqual([title, null, null]);
    }
  });

  it('centers the TM type/name stack on the disc+label the way the live card flexes', () => {
    const badgeH = L.tmBadgeH();
    expect(L.TM_CHIP_H).toBeGreaterThan(badgeH);
    const typeRowH = Math.max(badgeH, L.TM_CHIP_H);
    const slotH = 1.5 * L.ROW - 2 * L.INY;
    const cy = slotH / 2;
    const body = L.tmMoveBody(cy);
    expect(body.height).toBeCloseTo(typeRowH + L.TM_STACK_GAP + L.NAME_LINE);
    expect(body.badgeY + badgeH / 2).toBeCloseTo(body.chipY + L.TM_CHIP_H / 2);
    expect(body.nameTop).toBeCloseTo(body.top + typeRowH + L.TM_STACK_GAP);
    expect(body.top).toBeGreaterThan(0);
    expect(body.top + body.height).toBeLessThan(slotH);
  });

  it('matches the type-badge→disc-top gap to the name-bottom→TM-bottom gap', () => {
    const { top, bottom } = L.tmInkGaps(100);
    expect(Math.abs(top - bottom)).toBeLessThanOrEqual(1);
  });

  it('grows the TM stack by one name line when a two-word name wraps', () => {
    const one = L.tmMoveBody(100, 1);
    const two = L.tmMoveBody(100, 2);
    expect(two.height - one.height).toBeCloseTo(L.NAME_LINE);
  });
});

function cardWith(over: Partial<GymCard>): GymCard {
  return { ...emptyCard(), ...over };
}

describe('reading a card for export', () => {
  it('reads the picked signature, not the line leaf', () => {
    const card = cardWith({
      lines: [makePlacedLine([1, 2, 3])],
      signatureSeat: 1,
      signatureId: 2,
    });
    expect(showcasePair(card)).toEqual({ ace: 2, partner: null });
  });

  it('falls back to the endgame member when nothing was picked', () => {
    const card = cardWith({ lines: [makePlacedLine([1, 2, 3])], signatureSeat: 1 });
    expect(showcasePair(card).ace).toBe(3);
  });

  it('reads the partner beside the ace', () => {
    const card = cardWith({
      lines: [makePlacedLine([1, 2, 3])],
      signatureSeat: 1,
      signatureId: 3,
      partnerId: 25,
    });
    expect(showcasePair(card)).toEqual({ ace: 3, partner: 25 });
  });

  it('carries a legendary onto the endgame row only', () => {
    const card = cardWith({
      lines: [makePlacedLine([1, 2, 3])],
      legends: [{ pokemonId: 150, seat: 1 }],
    });
    expect(exportRow(card, L.BOSS_ROW).some((c) => c.pokemonId === 150)).toBe(true);
    expect(exportRow(card, L.CHAMPION_ROW).some((c) => c.pokemonId === 150)).toBe(false);
  });

  it('shows the dashed square for a seat with no Pokémon and no type', () => {
    expect(vacantRow(emptyCard())).toBe(true);
    expect(vacantRow(cardWith({ type: 'none' }))).toBe(true);
    expect(vacantRow(cardWith({ type: 'fire' }))).toBe(false);
    expect(vacantRow(cardWith({ lines: [makePlacedLine([1, 2, 3])] }))).toBe(false);
    expect(vacantRow(cardWith({ lines: [makePlacedLine([1, 2, 3])], type: 'none' }))).toBe(false);
  });

  it('loads rematch sprites for every slot in both-teams mode', () => {
    const both = { ...DEFAULT_LEAGUE_HOME_EXPORT_LAYOUT, teamMode: 'both' as const };
    expect(homeRowsForCard(0, 'challenge', both)).toEqual([1, L.BOSS_ROW]);
    expect(homeRowsForCard(8, 'challenge', both)).toEqual([L.ELITE_ROW, L.BOSS_ROW]);
    expect(homeRowsForCard(12, 'challenge', both)).toEqual([L.CHAMPION_ROW, L.BOSS_ROW]);
    expect(homeRowsForCard(13, 'challenge', both)).toEqual([L.BOSS_ROW, L.BOSS_ROW]);
  });
});
