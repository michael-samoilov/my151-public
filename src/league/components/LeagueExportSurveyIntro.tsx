import { Button } from '@/components/ui/button';
import {
  earlyExportLine,
  firstPokemonLine,
  pokemonDisplayName,
  type ExportHighlight,
} from '../export/exportPersonalization';

export function LeagueExportSurveyIntro({
  highlight,
  onContinue,
  onSkip,
}: {
  highlight: ExportHighlight | null;
  onContinue: () => void;
  onSkip: () => void;
}) {
  const early = highlight ? earlyExportLine(highlight.ordinal, highlight.tool) : null;
  const pokeName = highlight?.firstPokemonId != null ? pokemonDisplayName(highlight.firstPokemonId) : null;
  const firstPoke =
    pokeName && highlight ? firstPokemonLine(pokeName, highlight.tool) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 pb-4 pt-1">
      <div className="space-y-2 text-sm leading-relaxed">
        <p className="text-base font-bold text-primary">You&apos;re here early!</p>
        {early && <p className="text-foreground">{early}</p>}
        {firstPoke && <p className="text-foreground">{firstPoke}</p>}
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
