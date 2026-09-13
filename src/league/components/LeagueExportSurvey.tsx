import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { collectFeedbackContext, sendFeedback } from '@/lib/feedbackContext';
import { countDistinctPokemonInLeague, readLeagueExportCount } from '../export/exportPersonalization';
import { useLeagueStore } from '../store/useLeagueStore';

const PLATFORMS = ['Discord', 'Reddit', 'X / Twitter', 'Instagram', 'TikTok', 'In person', 'Other'] as const;
const HEARD = ['Search', 'A friend', 'Social media', 'Already used my151', 'Other'] as const;

function chipClass(on: boolean) {
  return on
    ? 'border-primary bg-primary text-primary-foreground'
    : 'border-border bg-background text-foreground hover:bg-muted';
}

export function LeagueExportSurvey({
  exportKind,
  onDone,
}: {
  exportKind: 'league' | 'card';
  onDone: () => void;
}) {
  const cards = useLeagueStore((s) => s.cards);
  const [share, setShare] = useState<'yes' | 'no' | null>(null);
  const [platforms, setPlatforms] = useState<Set<string>>(() => new Set());
  const [heard, setHeard] = useState<string | null>(null);
  const [heardOther, setHeardOther] = useState('');
  const [ideas, setIdeas] = useState('');
  const [tell, setTell] = useState<'yes' | 'maybe' | 'no' | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const personalization = useMemo(() => {
    const count = readLeagueExportCount();
    const species = countDistinctPokemonInLeague(cards);
    const lines: string[] = [];
    if (count === 1) lines.push('This is your first league export from this browser.');
    else if (count > 1 && count <= 5) lines.push(`You've exported ${count} times from this browser.`);
    if (species > 0) lines.push(`This league lists ${species} different Pokémon species.`);
    return lines;
  }, [cards]);

  const togglePlatform = (p: string) => {
    setPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  };

  const submit = async () => {
    setSending(true);
    const context = collectFeedbackContext('/custom-gym-leader');
    const body = [
      'League export follow-up',
      `export: ${exportKind}`,
      `share: ${share ?? 'skipped'}`,
      `platforms: ${[...platforms].join(', ') || '—'}`,
      `heard: ${heard === 'Other' ? heardOther || 'Other' : heard ?? '—'}`,
      `tell someone: ${tell ?? '—'}`,
      `ideas: ${ideas.trim() || '—'}`,
    ].join('\n');
    const ok = await sendFeedback({
      category: 'idea',
      message: body,
      context,
      dwellMs: 0,
    });
    setSending(false);
    if (ok) {
      setSent(true);
      window.setTimeout(onDone, 1200);
    }
  };

  const skip = () => onDone();

  if (sent) {
    return (
      <p className="px-4 py-6 text-center text-sm text-muted-foreground" data-export-survey-sent>
        Thanks — your note helps.
      </p>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 pb-4 pt-1">
      {personalization.length > 0 && (
        <div className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          {personalization.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      )}

      <fieldset className="space-y-2 border-0 p-0">
        <legend className="text-sm font-semibold">Will you share this export?</legend>
        <div className="flex flex-wrap gap-1.5">
          {(['yes', 'no'] as const).map((v) => (
            <button
              key={v}
              type="button"
              className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors ${chipClass(share === v)}`}
              onClick={() => setShare(v)}
            >
              {v === 'yes' ? 'Yes' : 'Not planning to'}
            </button>
          ))}
        </div>
        {share === 'yes' && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {PLATFORMS.map((p) => (
              <button
                key={p}
                type="button"
                className={`cursor-pointer rounded-full border px-2.5 py-1 text-[0.6875rem] font-medium transition-colors ${chipClass(platforms.has(p))}`}
                onClick={() => togglePlatform(p)}
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-2 border-0 p-0">
        <legend className="text-sm font-semibold">How did you hear about my151?</legend>
        <div className="flex flex-wrap gap-1.5">
          {HEARD.map((h) => (
            <button
              key={h}
              type="button"
              className={`cursor-pointer rounded-full border px-2.5 py-1 text-[0.6875rem] font-medium transition-colors ${chipClass(heard === h)}`}
              onClick={() => setHeard(h)}
            >
              {h}
            </button>
          ))}
        </div>
        {heard === 'Other' && (
          <Input
            value={heardOther}
            onChange={(e) => setHeardOther(e.target.value)}
            placeholder="Where?"
            aria-label="How you heard about the site"
          />
        )}
      </fieldset>

      <label className="block space-y-1.5">
        <span className="text-sm font-semibold">Ideas, features, or bugs</span>
        <textarea
          value={ideas}
          onChange={(e) => setIdeas(e.target.value)}
          rows={3}
          placeholder="Optional"
          className="flex w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-base md:text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
      </label>

      <fieldset className="space-y-2 border-0 p-0">
        <legend className="text-sm font-semibold">Would you tell someone who would enjoy this?</legend>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ['yes', 'Yes'],
              ['maybe', 'Maybe'],
              ['no', 'No'],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors ${chipClass(tell === v)}`}
              onClick={() => setTell(v)}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="mt-auto flex flex-col gap-2 pt-2">
        <Button type="button" disabled={sending} onClick={() => void submit()}>
          {sending ? 'Sending…' : 'Send feedback'}
        </Button>
        <Button type="button" variant="ghost" onClick={skip}>
          Skip
        </Button>
      </div>
    </div>
  );
}
