import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLeagueStore, type LeagueView } from '../store/useLeagueStore';

/**
 * The summary's two readings, as a pair of buttons.
 *
 * This is the dex builder's own view nav — a filled button for where you are
 * and a ghost one for where you could go — without the icons, which the two
 * words carry on their own. It replaces a gear whose menu held nothing else:
 * one press instead of open, choose, dismiss.
 */
const VIEWS: { value: LeagueView; label: string }[] = [
  { value: 'challenge', label: 'Story' },
  { value: 'rematch', label: 'Rematch' },
];

/**
 * The height both header fields give their editable line.
 *
 * The league name is 0.875rem and the gym theme 0.6875rem, so left to their
 * own line boxes the two dashed underlines sit at different heights — the
 * card's ran 1.9px higher, which read as the type chip beside it being set
 * low. One height for both, and the shorter text centres in it. The name line
 * above needs no such pinning: both headers set it in the same 0.6875rem, and
 * nothing rides beside it any more.
 */
export const HEADER_FIELD_H = '1.15625rem';

export function LeagueViewToggle() {
  const view = useLeagueStore((s) => s.view);
  const setView = useLeagueStore((s) => s.setView);
  return (
    <div role="group" aria-label="League summary shows" className="flex shrink-0 items-center gap-0.5">
      {VIEWS.map((v) => (
        <Button
          key={v.value}
          type="button"
          variant={view === v.value ? 'default' : 'ghost'}
          // The same pill as the dex builder's view nav, so the two tool
          // bars carry one control at one height.
          size="pill"
          data-league-view={v.value}
          aria-pressed={view === v.value}
          onClick={() => setView(v.value)}
        >
          {v.label}
        </Button>
      ))}
    </div>
  );
}

/**
 * The export control, in the shape the dex builder's pages give it.
 *
 * Disabled, and honestly so: the league has nothing to export yet. The dex
 * builder's export draws its grid on a canvas by hand, tile by tile, and
 * nothing in that is reusable for a card. The button is here so the header is
 * finished; what it does is its own piece of work.
 */
export function LeagueExportButton() {
  return (
    <button
      type="button"
      disabled
      aria-label="Export"
      title="Export is not built yet"
      data-league-export
      className="shrink-0 rounded-md border border-primary p-1.5 text-primary transition-colors disabled:cursor-default disabled:opacity-40"
    >
      <Download className="h-4 w-4" />
    </button>
  );
}
