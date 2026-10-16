import { HeaderActionButton } from '@/components/ui/HeaderActionButton';
import { Download } from 'lucide-react';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useT, type NoArgKey } from '@/i18n';
import { cn } from '@/lib/utils';
import { isRosterNudge } from '../model/funnelNudges';
import { useLeagueStore, type LeagueView } from '../store/useLeagueStore';
import { useLeagueUi } from '../store/useLeagueUi';
import { REVEAL_DELAY_MS } from './LeagueFunnelNudge';

const VIEWS: { value: LeagueView; label: NoArgKey }[] = [
  { value: 'challenge', label: 'league.view.story' },
  { value: 'rematch', label: 'league.view.rematch' },
];

export const HEADER_FIELD_H = '1.15625rem';

export function LeagueViewToggle() {
  const view = useLeagueStore((s) => s.view);
  const setView = useLeagueStore((s) => s.setView);
  const t = useT();
  return (
    <TabsList aria-label={t('league.view.label')} data-testid="league-nav" className="shrink-0">
      {VIEWS.map((v) => (
        <TabsTrigger
          key={v.value}
          selected={view === v.value}
          data-league-view={v.value}
          onClick={() => setView(v.value)}
        >
          {t(v.label)}
        </TabsTrigger>
      ))}
    </TabsList>
  );
}

export function LeagueExportButton({ cardIndex }: { cardIndex?: number }) {
  const openLeagueExport = useLeagueUi((s) => s.openLeagueExport);
  const pulse = useLeagueUi(
    (s) => cardIndex === undefined && isRosterNudge(s.activeNudge) && !s.exportOpen && !s.browserOpen,
  );
  const t = useT();

  return (
    <HeaderActionButton
      type="button"
      onClick={() => openLeagueExport(cardIndex)}
      aria-label={cardIndex === undefined ? t('league.export.league') : t('league.export.card')}
      data-league-export={cardIndex === undefined ? 'league' : 'card'}
      data-nudge-pulse={pulse || undefined}
      className={cn(
        'text-primary hover:bg-primary hover:text-primary-foreground',
        pulse && 'league-export-pulse',
      )}
      style={pulse ? { animationDelay: `${REVEAL_DELAY_MS}ms` } : undefined}
    >
      <Download className="h-4 w-4" />
    </HeaderActionButton>
  );
}
