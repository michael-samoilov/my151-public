import { useEffect, useState } from 'react';

// The file's URL comes in its own chunk. Imported here directly, the 21 KB
// outline would count as part of the builder's first load, though only the
// card's info menu shows it.
let loaded: string | null = null;
const load = () => import('../icons/arceus-crest.svg?url').then((m) => (loaded = `url(${m.default})`));

/** Arceus's ring, the app's legendary mark, in the text colour through a CSS mask. */
export function ArceusCrestIcon({ className }: { className?: string }) {
  const [mask, setMask] = useState(loaded);
  useEffect(() => {
    if (mask) return;
    let live = true;
    void load().then((url) => { if (live) setMask(url); });
    return () => { live = false; };
  }, [mask]);
  return (
    <span
      aria-hidden
      className={`block ${mask ? 'bg-current' : ''} ${className ?? ''}`}
      style={mask ? {
        WebkitMaskImage: mask,
        maskImage: mask,
        WebkitMaskSize: '100% 100%',
        maskSize: '100% 100%',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
      } : undefined}
    />
  );
}
