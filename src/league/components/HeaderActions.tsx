import { HeaderActionButton } from '@/components/ui/HeaderActionButton';
import { Download } from 'lucide-react';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useT, type NoArgKey } from '@/i18n';
import { TipDot } from '@/components/milestone/TipDot';
import { useLeagueStore, type LeagueView } from '../store/useLeagueStore';
import { useLeagueUi } from '../store/useLeagueUi';

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
  const t = useT();
  const tip = cardIndex === undefined ? 'league-export' : 'league-card-export';

  return (
    <HeaderActionButton
      type="button"
      onClick={() => openLeagueExport(cardIndex)}
      aria-label={cardIndex === undefined ? t('league.export.league') : t('league.export.card')}
      data-league-export={cardIndex === undefined ? 'league' : 'card'}
      data-tip-target={tip}
      className="text-primary hover:bg-primary hover:text-primary-foreground"
    >
      <TipDot target={tip} />
      <Download className="h-4 w-4" />
    </HeaderActionButton>
  );
}
