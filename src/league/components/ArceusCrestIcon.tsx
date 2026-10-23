import crestUrl from '../icons/arceus-crest.svg?url';

const MASK = `url(${crestUrl})`;

/**
 * Arceus's ring, the app's legendary mark, in the text colour. A CSS mask
 * tints the file, so the 21 KB outline loads only where the icon shows and
 * stays out of the builder's script.
 */
export function ArceusCrestIcon({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`block bg-current ${className ?? ''}`}
      style={{
        WebkitMaskImage: MASK,
        maskImage: MASK,
        WebkitMaskSize: '100% 100%',
        maskSize: '100% 100%',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
      }}
    />
  );
}
