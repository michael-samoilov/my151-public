import { Button } from '@/components/ui/button';
import { getPokemonById } from '@/hooks/usePokemonData';
import {
  EXPORT_TOOL_LABEL,
  earlyExportLine,
  pokemonDisplayName,
  type ExportHighlight,
} from '../export/exportPersonalization';
import { cardShades } from '../theme';

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
  const pokemon =
    highlight?.firstPokemonId != null ? getPokemonById(highlight.firstPokemonId) : undefined;
  const pokeName = pokemon ? pokemonDisplayName(pokemon.id) : null;
  const primary = pokemon?.types[0];
  const nameColor = primary ? cardShades(primary).band : undefined;
  const sprite = pokemon?.sprite ?? (highlight?.firstPokemonId != null
    ? `/sprites/pokemon/${highlight.firstPokemonId}.png`
    : null);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 pb-4 pt-1">
      <div className="space-y-2 text-sm leading-relaxed">
        <p className="text-base font-bold text-primary">You&apos;re here early!</p>
        {early && <p className="text-foreground">{early}</p>}
        {pokeName && highlight && (
          <p className="text-foreground">
            You&apos;re also the first person to have{' '}
            <strong className="font-bold" style={nameColor ? { color: nameColor } : undefined}>
              {pokeName}
            </strong>{' '}
            in an exported {EXPORT_TOOL_LABEL[highlight.tool]}.
          </p>
        )}
      </div>

      {pokeName && sprite && (
        <div className="flex flex-col items-center gap-2">
          <img
            src={sprite}
            alt=""
            width={96}
            height={96}
            className="h-24 w-24"
            style={{ aspectRatio: '1 / 1', imageRendering: 'pixelated' }}
            draggable={false}
          />
          <p className="text-sm leading-relaxed text-foreground">Hi {pokeName}!</p>
        </div>
      )}

      <p className="text-sm leading-relaxed text-foreground">
        Would you take about a minute to share your perspective? Your take, as someone who actually
        built this league, helps me improve the experience for the next person.
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
