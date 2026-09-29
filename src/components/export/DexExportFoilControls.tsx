import type { HoverTiltRecipe } from '@/components/export/hoverTiltRecipe';
import { withFoilLayer, type FoilRecipe } from '@/league/export/foilRecipe';

export function DexExportFoilControls({
  recipe,
  onRecipe,
  tilt,
  onTilt,
}: {
  recipe: FoilRecipe;
  onRecipe: (next: FoilRecipe) => void;
  tilt: HoverTiltRecipe;
  onTilt: (next: HoverTiltRecipe) => void;
}) {
  const holo = recipe.layers.holographic;

  return (
    <div
      className="shrink-0 touch-auto space-y-1 border-b px-3 py-2"
      data-export-foil-pinned
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="grid grid-cols-[4.75rem_minmax(0,1fr)] items-center gap-x-2 gap-y-1">
        <RowLabel name="shine">Shine</RowLabel>
        <div className="flex min-w-0 items-center gap-2" data-export-foil-shine>
          <input
            type="checkbox"
            checked={holo.on}
            aria-label="Shine on ink"
            data-foil-on="holographic"
            onChange={(e) => onRecipe(withFoilLayer(recipe, 'holographic', { on: e.target.checked }))}
          />
          <Range
            label="Amount"
            min={0}
            max={1}
            step={0.01}
            value={holo.amount}
            testId="holographic"
            onChange={(amount) => onRecipe(withFoilLayer(recipe, 'holographic', { amount }))}
          />
        </div>

        <RowLabel name="glare">Glare</RowLabel>
        <div className="min-w-0" data-export-foil-glare>
          <Range
            label="Intensity"
            min={0}
            max={1}
            step={0.01}
            value={tilt.glareIntensity}
            testId="glareIntensity"
            onChange={(glareIntensity) => onTilt({ ...tilt, glareIntensity })}
          />
        </div>

        <RowLabel name="shadow">Shadow</RowLabel>
        <div className="flex min-w-0 items-center gap-2" data-export-foil-shadow>
          <input
            type="checkbox"
            checked={tilt.shadow}
            aria-label="Drop shadow"
            data-export-shadow-toggle
            onChange={(e) => onTilt({ ...tilt, shadow: e.target.checked })}
          />
          <Range
            label="Blur"
            min={0}
            max={80}
            step={1}
            value={tilt.shadowBlur}
            suffix=" px"
            testId="shadowBlur"
            onChange={(shadowBlur) => onTilt({ ...tilt, shadowBlur })}
          />
        </div>
      </div>
    </div>
  );
}

function RowLabel({ name, children }: { name: string; children: string }) {
  return (
    <span className="text-sm font-semibold leading-none text-foreground" data-export-foil-label={name}>
      {children}
    </span>
  );
}

function Range({
  label,
  min,
  max,
  step,
  value,
  suffix = '',
  testId,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  suffix?: string;
  testId: string;
  onChange: (value: number) => void;
}) {
  const shown = Number.isInteger(step) && step >= 1 ? value.toFixed(0) : value.toFixed(2);
  return (
    <label className="flex min-w-0 flex-1 items-center gap-2 text-xs text-muted-foreground">
      <span className="sr-only">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        data-foil-slider={testId}
        className="min-w-0 flex-1 touch-pan-x"
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="w-12 shrink-0 text-right tabular-nums text-foreground">
        {shown}
        {suffix}
      </span>
    </label>
  );
}
