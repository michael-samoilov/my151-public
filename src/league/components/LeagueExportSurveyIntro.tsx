import { Button } from '@/components/ui/button';
import { PokemonNameText } from '@/components/shared/PokemonNameText';
import { getPokemonById } from '@/league/data/catalog';
import { pokemonLabel, raw, useNamesVersion, useT, type MessageKey } from '@/i18n';
import { splitTemplate } from '@/lib/richTemplate';
import type { ExportSurveyTool } from '@/lib/exportSurvey';
import {
  useExportSurveySpriteScale,
  usePixelPerfectSprite,
} from '@/lib/usePixelPerfectSprite';
import {
  FIRST_POKEMON_LINE,
  earlyExportLine,
  pokemonDisplayName,
  type ExportHighlight,
} from '../export/exportPersonalization';
import { cardShades } from '../theme';
import { pokemonSpriteUrl } from '@/lib/spriteUrl';

const ASK_LINE = {
  pokedex: 'exportSurvey.ask.pokedex',
  league: 'exportSurvey.ask.league',
  card: 'exportSurvey.ask.card',
} as const satisfies Record<ExportSurveyTool, MessageKey>;

export function LeagueExportSurveyIntro({
  tool,
  highlight,
  onContinue,
  onSkip,
}: {
  tool: ExportSurveyTool;
  highlight: ExportHighlight | null;
  onContinue: () => void;
  onSkip: () => void;
}) {
  const t = useT();
  useNamesVersion();
  const spriteScale = useExportSurveySpriteScale();
  const spriteCssPx = usePixelPerfectSprite(spriteScale);
  const early = highlight ? earlyExportLine(highlight.ordinal, highlight.tool) : null;
  const pokemon =
    highlight?.firstPokemonId != null ? getPokemonById(highlight.firstPokemonId) : undefined;
  const pokeName = pokemon
    ? pokemonLabel(pokemon.id, pokemonDisplayName(pokemon.name)).full
    : null;
  const primary = pokemon?.types[0];
  const nameColor = primary ? cardShades(primary).band : undefined;
  const sprite = pokemon?.sprite ?? (highlight?.firstPokemonId != null
    ? pokemonSpriteUrl(highlight.firstPokemonId)
    : null);

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 pb-4 pt-1"
      data-export-survey-intro
    >
      <div className="space-y-2 text-sm leading-relaxed">
        <p className="text-base font-bold text-primary">{t('exportSurvey.early')}</p>
        {early && <p className="text-foreground">{early}</p>}
        {pokeName && highlight && (
          <p className="text-foreground">
            {splitTemplate(raw(FIRST_POKEMON_LINE[highlight.tool])).map((part, i) =>
              part.kind === 'literal' ? part.text : (
                <strong key={i} className="font-bold" style={nameColor ? { color: nameColor } : undefined}>
                  <PokemonNameText name={pokeName} />
                </strong>
              ),
            )}
          </p>
        )}
      </div>

      {pokeName && sprite && (
        <div className="flex flex-col items-center gap-2">
          <img
            src={sprite}
            alt=""
            width={spriteCssPx}
            height={spriteCssPx}
            data-export-survey-sprite
            data-sprite-scale={spriteScale}
            data-sprite-css-px={spriteCssPx}
            style={{
              width: spriteCssPx,
              height: spriteCssPx,
              minWidth: spriteCssPx,
              minHeight: spriteCssPx,
              flexShrink: 0,
              aspectRatio: '1 / 1',
              imageRendering: 'pixelated',
            }}
            draggable={false}
          />
          <p className="text-sm leading-relaxed text-foreground"><PokemonNameText name={t('exportSurvey.hi', { name: pokeName })} /></p>
        </div>
      )}

      <p className="text-sm leading-relaxed text-foreground">{t(ASK_LINE[tool])}</p>

      <div className="mt-auto flex flex-col gap-2 pt-2">
        <Button type="button" onClick={onContinue}>
          {t('exportSurvey.accept')}
        </Button>
        <Button type="button" variant="ghost" onClick={onSkip}>
          {t('exportSurvey.skip')}
        </Button>
      </div>
    </div>
  );
}
