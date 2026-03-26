import { useState } from 'react';

interface SpriteImageProps {
  src: string;
  alt: string;
  className?: string;
  size?: number;
}

export function SpriteImage({ src, alt, className = '', size = 64 }: SpriteImageProps) {
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div
        className={`flex items-center justify-center bg-muted rounded ${className}`}
        style={{ width: size, height: size }}
      >
        <span className="text-muted-foreground text-xs">?</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={`pixelated ${className}`}
      style={{ imageRendering: 'pixelated' }}
      loading="lazy"
      onError={() => setError(true)}
    />
  );
}
