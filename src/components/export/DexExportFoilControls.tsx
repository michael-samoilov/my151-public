import {
  HOVER_TILT_BLEND_MODES,
  type HoverTiltRecipe,
} from '@/components/export/hoverTiltRecipe';
import {
  FOIL_HOLO_BLEND_CANDIDATES,
  type FoilHoloBlend,
} from '@/league/export/foilBlend';
import { withFoilLayer, type FoilRecipe } from '@/league/export/foilRecipe';

export function DexExportFoilControls({
  recipe,
  onRecipe,
  tilt,
  onTilt,
  holoBlend,
  onHoloBlend,
  mobileSheet = false,
}: {
  recipe: FoilRecipe;
  onRecipe: (next: FoilRecipe) => void;
  tilt: HoverTiltRecipe;
  onTilt: (next: HoverTiltRecipe) => void;
  holoBlend: FoilHoloBlend;
  onHoloBlend: (next: FoilHoloBlend) => void;
  mobileSheet?: boolean;
}) {
  const holo = recipe.layers.holographic;
  const pad = mobileSheet ? 'px-2 py-1.5' : 'px-3 py-2';

  return (
    <div className="space-y-3">
      <fieldset className={`space-y-2 rounded-md ${pad}`} data-export-foil-rainbow>
        <legend className="text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground">
          Rainbow
        </legend>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={holo.on}
            data-foil-on="holographic"
            onChange={(e) => onRecipe(withFoilLayer(recipe, 'holographic', { on: e.target.checked }))}
          />
          Rainbow on ink
        </label>
        <Range
          label="Amount"
          min={0}
          max={1}
          step={0.01}
          value={holo.amount}
          testId="holographic"
          onChange={(amount) => onRecipe(withFoilLayer(recipe, 'holographic', { amount }))}
        />
      </fieldset>

      <fieldset className={`space-y-2 rounded-md ${pad}`} data-export-foil-glare>
        <legend className="text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground">
          Glare
        </legend>
        <Range
          label="Intensity"
          min={0}
          max={1}
          step={0.01}
          value={tilt.glareIntensity}
          testId="glareIntensity"
          onChange={(glareIntensity) => onTilt({ ...tilt, glareIntensity })}
        />
      </fieldset>

      <fieldset className={`space-y-2 rounded-md ${pad}`} data-export-foil-shadow>
        <legend className="text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground">
          Shadow
        </legend>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={tilt.shadow}
            data-export-shadow-toggle
            onChange={(e) => onTilt({ ...tilt, shadow: e.target.checked })}
          />
          Drop shadow
        </label>
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
      </fieldset>

      <fieldset className={`space-y-2 rounded-md ${pad}`} data-export-foil-blend>
        <legend className="text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground">
          Blend
        </legend>
        <BlendSelect
          label="Rainbow"
          testId="holoBlend"
          value={holoBlend}
          options={FOIL_HOLO_BLEND_CANDIDATES}
          onChange={onHoloBlend}
        />
        <BlendSelect
          label="Glare"
          testId="blendMode"
          value={tilt.blendMode}
          options={HOVER_TILT_BLEND_MODES}
          onChange={(blendMode) => onTilt({ ...tilt, blendMode })}
        />
      </fieldset>
    </div>
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
    <label className="block text-xs text-muted-foreground">
      <span className="flex justify-between gap-2">
        <span>{label}</span>
        <span className="tabular-nums text-foreground">
          {shown}
          {suffix}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        data-foil-slider={testId}
        className="mt-1 w-full"
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function BlendSelect<T extends string>({
  label,
  testId,
  value,
  options,
  onChange,
}: {
  label: string;
  testId: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
}) {
  return (
    <label className="block text-xs text-muted-foreground">
      <span className="mb-1 block">{label}</span>
      <select
        className="w-full rounded-md border bg-background px-2 py-1 text-sm text-foreground"
        value={value}
        data-export-foil-select={testId}
        onChange={(e) => {
          const next = options.find((opt) => opt === e.target.value);
          if (next) onChange(next);
        }}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </label>
  );
}
