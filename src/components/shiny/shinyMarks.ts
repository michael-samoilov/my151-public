export const SHINY_GLYPH = {
  big: 'M8.7 21.9Q8.04 15.96 2.1 15.3Q8.04 14.64 8.7 8.7Q9.36 14.64 15.3 15.3Q9.36 15.96 8.7 21.9Z',
  small: 'M17.8 10.4Q17.38 6.62 13.6 6.2Q17.38 5.78 17.8 2Q18.22 5.78 22 6.2Q18.22 6.62 17.8 10.4Z',
  bigOpen: 'M15.3 15.3Q9.36 15.96 8.7 21.9Q8.04 15.96 2.1 15.3Q8.04 14.64 8.7 8.7',
  slash: 'm2 2 20 20',
} as const;

export type ShinyMark = 'on' | 'off' | 'none';

export const SHINY_ON = { color: '#F5B301', pillFill: '#FFF6D6' } as const;

export const SHINY_STAR = {
  path: 'M12 1.4Q12.848 11.152 22.6 12Q12.848 12.848 12 22.6Q11.152 12.848 1.4 12Q11.152 11.152 12 1.4Z',
  fill: { from: [6, 3], to: [18, 21], stops: [[0, '#FFD84D'], [1, '#F59E0B']] },
  rim: '#ffffff',
  rimWidth: 2.6,
} as const;

export const NO_SHINY = {
  sprite: { filter: 'grayscale(1)', opacity: 0.45 },
  placement: 'badge' as 'badge' | 'center',
  ink: '#64748b',
  disc: '#ffffff',
  ring: 'rgba(15,23,42,0.22)',
} as const;
