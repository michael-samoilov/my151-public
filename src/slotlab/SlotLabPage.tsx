import { useEffect, useState } from 'react';
import { LeagueApp } from '../league/LeagueApp';
import { STANDARD_SPRITE, useSlotLab } from '../league/slotLab';

export function SlotLabPage() {
  const enable = useSlotLab((s) => s.enable);
  useEffect(enable, [enable]);
  const ace = useSlotLab((s) => s.ace);
  const partner = useSlotLab((s) => s.partner);
  const slot = useSlotLab((s) => s.slot);
  const sprite = useSlotLab((s) => s.sprite);
  const setSprite = useSlotLab((s) => s.setSprite);
  const reset = useSlotLab((s) => s.reset);
  const [open, setOpen] = useState(true);

  const row = (label: string, o: { dx: number; dy: number }) => (
    <div style={{ display: 'contents' }}>
      <span style={{ fontWeight: 600 }}>{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>
        {o.dx >= 0 ? '+' : ''}{(o.dx * 100).toFixed(1)}% x
      </span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>
        {o.dy >= 0 ? '+' : ''}{(o.dy * 100).toFixed(1)}% y
      </span>
      <span style={{ color: '#6b7280', fontVariantNumeric: 'tabular-nums' }}>
        {slot ? `${(o.dx * slot.w).toFixed(0)}, ${(o.dy * slot.h).toFixed(0)} px` : '—'}
      </span>
    </div>
  );

  return (
    <>
      <LeagueApp />
      <div
        style={{
          position: 'fixed', left: 8, bottom: 8, zIndex: 9999,
          background: 'rgba(255,255,255,0.96)', border: '1px solid #d4d4d8',
          borderRadius: 10, padding: '8px 10px', font: '12px/1.4 ui-monospace, monospace',
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)', maxWidth: 'calc(100vw - 16px)',
        }}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{
            display: 'block', width: '100%', textAlign: 'left', padding: 0,
            border: 0, background: 'none', font: 'inherit', fontWeight: 700,
            marginBottom: open ? 4 : 0, cursor: 'pointer',
          }}
        >
          {open ? '▾' : '▸'} Slot lab · drag either half, size them together
        </button>
        {open && (
        <>
        <div
          style={{
            display: 'grid', gridTemplateColumns: 'auto auto auto auto',
            gap: '2px 10px', alignItems: 'baseline',
          }}
        >
          {row('ace', ace)}
          {row('partner', partner)}
        </div>
        <label
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            marginTop: 7, paddingTop: 6, borderTop: '1px solid #e4e4e7',
          }}
        >
          <span style={{ fontWeight: 600 }}>sprite</span>
          <input
            type="range"
            min={24}
            max={140}
            step={2}
            value={sprite}
            onChange={(e) => setSprite(Number(e.target.value))}
            style={{ flex: 1, minWidth: 110 }}
          />
          <span style={{ fontVariantNumeric: 'tabular-nums', minWidth: 74 }}>
            {sprite}px · {(sprite / 16).toFixed(2)}rem
          </span>
        </label>
        <div style={{ marginTop: 5, color: '#6b7280' }}>
          slot {slot ? `${slot.w.toFixed(0)} × ${slot.h.toFixed(0)}` : 'not measured'}
          {'  ·  '}
          {(sprite / STANDARD_SPRITE * 100).toFixed(0)}% of standard
        </div>
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: 6, padding: '3px 10px', borderRadius: 6,
            border: '1px solid #d4d4d8', background: '#fff', cursor: 'pointer', font: 'inherit',
          }}
        >
          Reset both
        </button>
        </>
        )}
      </div>
    </>
  );
}
