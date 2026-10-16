import { cn } from '@/lib/utils';
import { SHAPE_NAMES, type ShapeName } from '@/types/pokemon';

const SHAPE_ICON_SCALE = 1.65;

export const SHAPE_ORDER: readonly ShapeName[] = SHAPE_NAMES;

export const shapeIconPath = (shape: ShapeName | string) => `/shapes/${shape}.png`;

export function ShapeIcon({ shape, className }: { shape: ShapeName; className?: string }) {
  return (
    <img
      src={shapeIconPath(shape)}
      alt=""
      aria-hidden
      className={cn('object-contain dark:invert', className)}
    />
  );
}

export function ShapeIconCircle({ shape, size = 20, className }: { shape: ShapeName; size?: number; className?: string }) {
  const px = size * SHAPE_ICON_SCALE;
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full border border-border bg-background shrink-0',
        className,
      )}
      style={{ width: px, height: px }}
    >
      <ShapeIcon shape={shape} className="w-[70%] h-[70%]" />
    </span>
  );
}

