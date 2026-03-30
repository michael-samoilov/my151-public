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

export function GenBadge({ gen, className }: { gen: number; className?: string }) {
  const stops = GEN_STOPS[gen] ?? [{ offset: '100%', color: '#888' }];
  const gradId = `gen-grad-${gen}`;
  return (
    <svg viewBox="0 0 20 20" className={className}>
      <defs>
        {/* 135deg = top-left to bottom-right */}
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          {stops.map((s, i) => (
            <stop key={i} offset={s.offset} stopColor={s.color} />
          ))}
        </linearGradient>
      </defs>
      <circle cx="10" cy="10" r="10" fill={`url(#${gradId})`} />
      <text
        x="10" y="10" textAnchor="middle" dominantBaseline="central"
        fill="white" fontSize="11" fontWeight="800"
        fontFamily="system-ui, sans-serif"
        paintOrder="stroke"
        stroke="rgba(0,0,0,0.4)" strokeWidth="2"
      >
        {gen}
      </text>
    </svg>
  );
}
