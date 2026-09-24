import { Download } from 'lucide-react';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLeagueStore, type LeagueView } from '../store/useLeagueStore';
import { useLeagueUi } from '../store/useLeagueUi';

/**
 * The summary's two readings, as the shared pill tab set (PR 79).
 *
 * Story and Rematch name themselves; the gym-leaders export spacer is the
 * only place that adds "story teams" / "rematch teams".
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
    <TabsList aria-label="League summary shows" data-testid="league-nav" className="shrink-0">
      {VIEWS.map((v) => (
        <TabsTrigger
          key={v.value}
          selected={view === v.value}
          data-league-view={v.value}
          onClick={() => setView(v.value)}
        >
          {v.label}
        </TabsTrigger>
      ))}
    </TabsList>
  );
}

/**
 * The export control, in the shape the dex builder's pages give it.
 *
 * One button, two pictures: the league pane's exports the summary at whichever
 * team toggle is on screen, and a card pane's exports that trainer's card.
 * Both go through the dex export's platform path, so iOS offers "Save Image"
 * into Photos, Android takes the download its gallery scans, and desktop gets
 * a file.
 *
 * It never disables on an empty league. A blank trainer card is a template
 * somebody may want a picture of, which is why the empty states were designed
 * rather than suppressed.
 *
 * The store is read inside the handler rather than subscribed to. This button
 * sits in a bar that is mounted for the whole session, and subscribing to the
 * cards would re-render it on every keystroke in a theme field.
 */
export function LeagueExportButton({ cardIndex }: { cardIndex?: number }) {
  const openLeagueExport = useLeagueUi((s) => s.openLeagueExport);

  return (
    <button
      type="button"
      onClick={() => openLeagueExport(cardIndex)}
      aria-label={cardIndex === undefined ? 'Export league' : 'Export trainer card'}
      data-league-export={cardIndex === undefined ? 'league' : 'card'}
      className="shrink-0 cursor-pointer rounded-md border border-border p-1.5 text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
    >
      <Download className="h-4 w-4" />
    </button>
  );
}
