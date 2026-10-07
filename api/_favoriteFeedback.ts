import { TYPE_NAMES } from '../src/types/pokemon.js';

const types = new Set<string>([...TYPE_NAMES, 'starter', 'legendary', 'gimmick', 'favorite']);
const generations = new Set(['gimmick', 'legendary', 'favorite']);
const MAX_CELLS = 264;

/** Keep only bounded diagnostic counts and known coordinates, never picks. */
export function sanitizeFavoriteFeedback(raw: unknown): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
  const c = raw as Record<string, unknown>;
  const counts = [c.filled, c.total, c.picksFilled, c.pointersFilled];
  if (counts.some(n => typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > MAX_CELLS)) return;
  const [filled, total, picksFilled, pointersFilled] = counts as number[];
  if (filled > total || filled !== picksFilled + pointersFilled) return;
  let selection: { type: string; gen: string | number } | null = null;
  const s = c.selection as Record<string, unknown> | null;
  if (s && typeof s === 'object' && !Array.isArray(s) && typeof s.type === 'string' && types.has(s.type)) {
    const gen = s.gen;
    if ((typeof gen === 'number' && Number.isInteger(gen) && gen >= 1 && gen <= 9)
      || (typeof gen === 'string' && generations.has(gen))) selection = { type: s.type, gen };
  }
  return { filled, total, picksFilled, pointersFilled, selection };
}
