/** Color stops for each generation's diagonal gradient (135deg) */
export const GEN_STOPS: Record<number, { offset: string; color: string }[]> = {
  1: [{ offset: '50%', color: '#DC0A2D' }, { offset: '50%', color: '#3B4CCA' }],
  2: [{ offset: '33%', color: '#DAA520' }, { offset: '33%', color: '#C0C0C0' }, { offset: '66%', color: '#C0C0C0' }, { offset: '66%', color: '#7FC8E8' }],
  3: [{ offset: '33%', color: '#A00000' }, { offset: '33%', color: '#0055BF' }, { offset: '66%', color: '#0055BF' }, { offset: '66%', color: '#00A86B' }],
  4: [{ offset: '50%', color: '#AACCEE' }, { offset: '50%', color: '#FFAACC' }],
  5: [{ offset: '50%', color: '#1a1a1a' }, { offset: '50%', color: '#f0f0f0' }],
  6: [{ offset: '50%', color: '#025DA6' }, { offset: '50%', color: '#EA1A3E' }],
  7: [{ offset: '50%', color: '#F5A623' }, { offset: '50%', color: '#5C4D9A' }],
  8: [{ offset: '50%', color: '#00A1E9' }, { offset: '50%', color: '#E3003A' }],
  9: [{ offset: '50%', color: '#E3350D' }, { offset: '50%', color: '#7B2D8E' }],
};

function buildGradient(stops: { offset: string; color: string }[]): string {
  return `linear-gradient(135deg, ${stops.map(s => `${s.color} ${s.offset}`).join(', ')})`;
}

export function GenBadge({ gen, className, textClass }: { gen: number; className?: string; textClass?: string }) {
  const stops = GEN_STOPS[gen] ?? [{ offset: '100%', color: '#888' }];
  return (
    <div
      className={`rounded-full flex items-center justify-center ${className ?? ''}`}
      style={{ background: buildGradient(stops) }}
    >
      <span
        className={`text-white font-extrabold leading-none ${textClass ?? 'text-[1.5vw] md:text-[7px]'}`}
        style={{
          textShadow: '0 0 2px rgba(0,0,0,0.4), 0 0 2px rgba(0,0,0,0.4)',
        }}
      >
        {gen}
      </span>
    </div>
  );
}
