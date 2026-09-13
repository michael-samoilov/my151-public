import { useState } from 'react';
import type { IconType } from 'react-icons';
import { Search, UserRound } from 'lucide-react';
import { SiBluesky, SiDiscord, SiReddit, SiTumblr, SiX } from 'react-icons/si';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { collectFeedbackContext, sendFeedback } from '@/lib/feedbackContext';
const HEARD: { id: string; label: string; Icon: IconType | typeof Search | typeof UserRound }[] = [
  { id: 'search', label: 'Search engine', Icon: Search },
  { id: 'friend', label: 'Friend', Icon: UserRound },
  { id: 'discord', label: 'Discord', Icon: SiDiscord },
  { id: 'reddit', label: 'Reddit', Icon: SiReddit },
  { id: 'x', label: 'X / Twitter', Icon: SiX },
  { id: '4chan', label: '4chan', Icon: FourChanMark },
  { id: 'bluesky', label: 'Bluesky', Icon: SiBluesky },
  { id: 'tumblr', label: 'Tumblr', Icon: SiTumblr },
  { id: 'other', label: 'Other', Icon: Search },
];

function FourChanMark({ className }: { className?: string }) {
  return (
    <span className={className} aria-hidden style={{ fontFamily: 'serif', fontWeight: 700, lineHeight: 1 }}>
      🍀
    </span>
  );
}

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
  const [heard, setHeard] = useState<Set<string>>(() => new Set());
  const [heardOther, setHeardOther] = useState('');
  const [ideas, setIdeas] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const toggleHeard = (id: string) => {
    setHeard((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = async () => {
    setSending(true);
    const context = collectFeedbackContext('/custom-gym-leader');
    const heardLabels = [...heard].map((id) => {
      if (id === 'other') return heardOther.trim() ? `Other: ${heardOther.trim()}` : 'Other';
      return HEARD.find((h) => h.id === id)?.label ?? id;
    });
    const body = [
      'League export follow-up',
      `export: ${exportKind}`,
      `heard: ${heardLabels.join(', ') || '—'}`,
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
      <fieldset className="space-y-2 border-0 p-0">
        <legend className="text-sm font-semibold">How did you hear about my151?</legend>
        <p className="text-xs text-muted-foreground">Select all that apply.</p>
        <div className="flex flex-wrap gap-1.5">
          {HEARD.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.6875rem] font-medium transition-colors ${chipClass(heard.has(id))}`}
              onClick={() => toggleHeard(id)}
            >
              <Icon className="size-3.5 shrink-0" aria-hidden />
              {label}
            </button>
          ))}
        </div>
        {heard.has('other') && (
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
        <span className="block text-xs text-muted-foreground">(I read everything that comes in!)</span>
        <textarea
          value={ideas}
          onChange={(e) => setIdeas(e.target.value)}
          rows={3}
          placeholder="Optional"
          className="flex w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-base md:text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
      </label>

      <p className="text-sm leading-relaxed text-muted-foreground">
        If you know someone who would enjoy this tool, please share it with them ^_^
      </p>

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
