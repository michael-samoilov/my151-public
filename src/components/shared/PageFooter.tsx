declare const __BUILD_TIMESTAMP__: string;
const BUILD_VERSION = __BUILD_TIMESTAMP__.replace(/[-:]/g, '').slice(2, 13);
const YEAR = new Date().getFullYear();

export function PageFooter() {
  return (
    <div className="h-16 flex flex-col items-center justify-center gap-1">
      <svg width="24" height="24" viewBox="0 0 24 24" className="text-muted-foreground/20">
        <circle cx="12" cy="12" r="11" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <line x1="1" y1="12" x2="8.5" y2="12" stroke="currentColor" strokeWidth="1.5" />
        <line x1="15.5" y1="12" x2="23" y2="12" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="12" cy="12" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      </svg>
      <span className="text-[9px] text-muted-foreground/30">
        v{BUILD_VERSION} · Pokémon © 1995–{YEAR} Nintendo / Game Freak / Creatures
      </span>
    </div>
  );
}
