import { useState } from 'react';
import { usePokedexStore } from '@/store/usePokedexStore';
import { PREVIEW_FEATURES } from '@/lib/demoMode';

/** Hovering debug control (preview/local only) for live-tuning the size of the
 *  silhouette-in-circle shape icons — the analytics chart column, the shape
 *  drilldown header/nav, and the muted-member tile badge all read
 *  `shapeIconScale` from the store. Drag to find a value, then it can be baked in
 *  as the default and this control removed. */
export function ShapeIconDebugSlider() {
  const scale = usePokedexStore((s) => s.shapeIconScale);
  const setScale = usePokedexStore((s) => s.setShapeIconScale);
  const [collapsed, setCollapsed] = useState(false);

  if (!PREVIEW_FEATURES) return null;

  return (
    <div className="fixed bottom-3 right-3 z-[100] rounded-lg border border-border bg-background/95 shadow-elevated backdrop-blur px-3 py-2 text-xs select-none">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="font-semibold text-muted-foreground hover:text-foreground cursor-pointer"
          title="Toggle shape-icon size debug"
        >
          shape ×{scale.toFixed(2)}
        </button>
        {!collapsed && (
          <>
            <input
              type="range"
              min={0.8}
              max={2.5}
              step={0.05}
              value={scale}
              onChange={(e) => setScale(Number(e.target.value))}
              className="w-40 cursor-pointer accent-primary"
            />
            <button
              type="button"
              onClick={() => setScale(1.3)}
              className="text-muted-foreground hover:text-foreground cursor-pointer underline"
              title="Reset to default (1.30)"
            >
              reset
            </button>
          </>
        )}
      </div>
    </div>
  );
}
