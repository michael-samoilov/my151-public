export interface FitProposal {
  scale: number;
  width: number;
}

export const SCALE_EPS = 0.015;
export const WIDTH_EPS = 2;
const MEASURE_EPS = 20;

function quantizeScale(scale: number): number {
  return Math.round(scale * 1000) / 1000;
}

export function stabilizeMeasure(next: number, prev: number, eps = MEASURE_EPS): number {
  if (prev > 0 && Math.abs(next - prev) <= eps) return prev;
  return next;
}

interface SquashInput {
  mode: 'squash';
  natural: number;
  tailNatural: number;
  avail: number;
  room: number;
  floor: number;
  prevScale: number;
  prevWidth: number;
}

interface GrowInput {
  mode: 'grow';
  natural: number;
  avail: number;
  room: number;
  floor: number;
  baseWidth: number;
  spriteCeil: number;
  prevScale: number;
  prevWidth: number;
}

interface HoldInput {
  mode: 'hold';
  shortest: number;
  avail: number;
  room: number;
  floor: number;
  hold: number;
  baseWidth?: number;
  prevScale: number;
  prevWidth: number;
}

type FitInput = SquashInput | GrowInput | HoldInput;

export function proposeFit(input: FitInput): FitProposal | null {
  if (input.mode === 'hold') return proposeHold(input);
  if (input.natural <= 0) return null;

  let scale: number;
  let width: number;

  if (input.mode === 'grow') {
    const wScale = input.room / input.baseWidth;
    const hScale = input.avail / input.natural;
    scale = Math.max(input.floor, Math.min(wScale, hScale, input.spriteCeil));
    width = input.baseWidth;
  } else {
    const body = Math.max(1, input.natural - input.tailNatural);
    const squash = Math.min(1, Math.max(input.floor, input.avail / body));
    width = input.room / squash;
    scale = Math.min(1, Math.max(input.floor, input.avail / input.natural));
  }

  scale = quantizeScale(scale);

  if (
    Math.abs(scale - input.prevScale) <= SCALE_EPS &&
    Math.abs(width - input.prevWidth) <= WIDTH_EPS
  ) {
    return null;
  }
  return { scale, width };
}

function proposeHold(input: HoldInput): FitProposal | null {
  if (input.shortest <= 0) return null;
  const wide = input.baseWidth ? input.room / input.baseWidth : Infinity;
  const fits = Math.min(wide, input.avail / input.shortest);
  const scale = Math.max(input.floor, Math.min(input.hold, fits));
  const width = input.baseWidth ?? input.room / scale;
  if (scale === input.prevScale && width === input.prevWidth) return null;
  return { scale, width };
}
