import type { Tool } from './_events.js';

export const VISITS_PREFIX = 'visits';
export const VISITS_TTL_DAYS = 400;
export const VISITS_TTL_S = VISITS_TTL_DAYS * 24 * 60 * 60;
export const VISIT_PAGES = ['/', '/pokedex-builder', '/custom-gym-leader', '/league-card', '/favorite-pokemon-picker'] as const;
export type VisitPage = (typeof VISIT_PAGES)[number] | 'other';

export function visitFields(tool: Tool, page: VisitPage, optedOut: boolean): string[] {
  const base = ['all', `tool:${tool}`, `page:${page}`];
  return optedOut ? [...base, ...base.map((field) => `${field}:optout`)] : base;
}

export interface VisitTotals {
  all: number;
  optedOut: number;
  byTool: Record<string, { all: number; optedOut: number }>;
}

export function visitTotals(hash: Record<string, unknown> | null): VisitTotals {
  const n = (field: string) => Math.max(0, Number(hash?.[field]) || 0);
  const tools = Object.keys(hash ?? {}).filter((f) => /^tool:[a-z]+$/.test(f)).map((f) => f.slice('tool:'.length));
  return {
    all: n('all'),
    optedOut: n('all:optout'),
    byTool: Object.fromEntries(tools.map((tool) => [tool, { all: n(`tool:${tool}`), optedOut: n(`tool:${tool}:optout`) }])),
  };
}
