import { useEffect } from 'react';
import { LeagueApp } from '../league/LeagueApp';
import { useSlotLab } from '../league/slotLab';

/**
 * The real league builder, with the ace and partner halves loose.
 *
 * Not a mock of the slot: the whole app, so the pickers work, the empty
 * states are the real empty states, and what a half looks like once a
 * Pokemon lands in it is what it will look like. Drag either half; tap it
 * and it still opens its picker.
 *
 * The readout is the point. It reports each half's offset as a **fraction of
 * the slot**, because that is the number that transfers: the slot is a
 * different size on every device, so a pixel nudge only means something on
 * the screen it was made on.
 */
export function SlotLabPage() {
  const enable = useSlotLab((s) => s.enable);
  useEffect(enable, [enable]);
  const ace = useSlotLab((s) => s.ace);
  const partner = useSlotLab((s) => s.partner);
  const slot = useSlotLab((s) => s.slot);
  const reset = useSlotLab((s) => s.reset);

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
        <div style={{ fontWeight: 700, marginBottom: 4 }}>
          Slot lab · drag either half
        </div>
        <div
          style={{
            display: 'grid', gridTemplateColumns: 'auto auto auto auto',
            gap: '2px 10px', alignItems: 'baseline',
          }}
        >
          {row('ace', ace)}
          {row('partner', partner)}
        </div>
        <div style={{ marginTop: 5, color: '#6b7280' }}>
          slot {slot ? `${slot.w.toFixed(0)} × ${slot.h.toFixed(0)}` : 'not measured'}
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
      </div>
    </>
  );
}
