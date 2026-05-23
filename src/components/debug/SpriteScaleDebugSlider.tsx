import { useState } from 'react';
import {
  useDebugSpriteScale,
  setDebugSpriteScale,
  DEBUG_SPRITE_DEFAULTS,
} from '@/lib/debugSpriteScale';

/**
 * DEBUG-ONLY floating control to live-tune sprite sizing on a deployed
 * preview. Remove (and its mount in App.tsx) before merging to
 * production. Drag the sliders to find the sweet spot for overlap /
 * aliasing; values persist in localStorage across reloads.
 */
export function SpriteScaleDebugSlider() {
  const { imgScale, chromeBoost } = useDebugSpriteScale();
  const [open, setOpen] = useState(true);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, right: 8, zIndex: 9999,
          background: 'rgba(0,0,0,0.8)', color: '#fff', border: 'none',
          borderRadius: 999, padding: '6px 12px', fontSize: 12,
          fontFamily: 'ui-monospace, monospace', cursor: 'pointer',
        }}
      >
        ⚙ size
      </button>
    );
  }

  const row = (
    label: string,
    value: number,
    min: number,
    max: number,
    key: 'imgScale' | 'chromeBoost',
  ) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
      <span style={{ width: 92, whiteSpace: 'nowrap' }}>{label} {value.toFixed(2)}×</span>
      <input
        type="range"
        min={min}
        max={max}
        step={0.05}
        value={value}
        onChange={(e) => setDebugSpriteScale({ [key]: parseFloat(e.target.value) })}
        style={{ flex: 1 }}
      />
    </div>
  );

  return (
    <div
      style={{
        position: 'fixed', bottom: 8, left: 8, right: 8, zIndex: 9999,
        maxWidth: 420, margin: '0 auto',
        background: 'rgba(0,0,0,0.82)', color: '#fff',
        padding: '8px 10px', borderRadius: 10,
        fontSize: 12, fontFamily: 'ui-monospace, monospace',
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>sprite size (debug)</strong>
        <button
          onClick={() => setOpen(false)}
          style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 14 }}
        >
          ✕
        </button>
      </div>
      {row('img', imgScale, 1, 3, 'imgScale')}
      {row('chrome', chromeBoost, 1, 2, 'chromeBoost')}
      <button
        onClick={() => setDebugSpriteScale({ ...DEBUG_SPRITE_DEFAULTS })}
        style={{
          marginTop: 6, fontSize: 11, padding: '3px 8px', borderRadius: 6,
          border: '1px solid rgba(255,255,255,0.3)', background: 'transparent',
          color: '#fff', cursor: 'pointer',
        }}
      >
        reset to {DEBUG_SPRITE_DEFAULTS.imgScale}× / {DEBUG_SPRITE_DEFAULTS.chromeBoost}×
      </button>
    </div>
  );
}
