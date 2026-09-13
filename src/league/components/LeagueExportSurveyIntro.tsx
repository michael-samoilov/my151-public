import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { buildExportUniquenessHighlights } from '../export/exportPersonalization';
import { useLeagueStore } from '../store/useLeagueStore';

export function LeagueExportSurveyIntro({
  exportKind,
  onContinue,
  onSkip,
}: {
  exportKind: 'league' | 'card';
  onContinue: () => void;
  onSkip: () => void;
}) {
  const cards = useLeagueStore((s) => s.cards);
  const highlights = buildExportUniquenessHighlights(cards, exportKind);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 pb-4 pt-1">
      <div className="flex items-start gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-3">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <div className="space-y-2 text-sm leading-relaxed">
          <p className="font-semibold text-foreground">Your export is one of a kind</p>
          {highlights.length > 0 ? (
            <ul className="list-disc space-y-1.5 ps-4 text-muted-foreground">
              {highlights.map((h) => (
                <li key={h.text}>{h.text}</li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">
              The teams, themes, and Pokémon you chose are what make this image yours.
            </p>
          )}
        </div>
      </div>

      <p className="text-sm leading-relaxed text-foreground">
        Would you take about a minute to share your perspective? Your take — as someone who actually built
        this league — helps us improve the experience for the next person.
      </p>

      <div className="mt-auto flex flex-col gap-2 pt-2">
        <Button type="button" onClick={onContinue}>
          Sure, I&apos;ll help
        </Button>
        <Button type="button" variant="ghost" onClick={onSkip}>
          Not now
        </Button>
      </div>
    </div>
  );
}
