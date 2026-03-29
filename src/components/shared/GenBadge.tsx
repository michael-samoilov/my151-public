const GEN_GRADIENTS: Record<number, string> = {
  1: 'linear-gradient(135deg, #DC0A2D 50%, #3B4CCA 50%)',
  2: 'linear-gradient(135deg, #DAA520 33%, #C0C0C0 33%, #C0C0C0 66%, #7FC8E8 66%)',
  3: 'linear-gradient(135deg, #A00000 33%, #0055BF 33%, #0055BF 66%, #00A86B 66%)',
  4: 'linear-gradient(135deg, #AACCEE 50%, #FFAACC 50%)',
  5: 'linear-gradient(135deg, #1a1a1a 50%, #f0f0f0 50%)',
  6: 'linear-gradient(135deg, #025DA6 50%, #EA1A3E 50%)',
  7: 'linear-gradient(135deg, #F5A623 50%, #5C4D9A 50%)',
  8: 'linear-gradient(135deg, #00A1E9 50%, #E3003A 50%)',
  9: 'linear-gradient(135deg, #E3350D 50%, #7B2D8E 50%)',
};

export function GenBadge({ gen, className }: { gen: number; className?: string }) {
  const size = 14;
  return (
    <div className={className} style={{ background: GEN_GRADIENTS[gen] ?? '#888' }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full">
        <text
          x="50%" y="52%" dominantBaseline="central" textAnchor="middle"
          fill="white" fontSize="8" fontWeight="800"
          fontFamily="system-ui, sans-serif"
          style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.4)', strokeWidth: 1.5 }}
        >
          {gen}
        </text>
      </svg>
    </div>
  );
}
