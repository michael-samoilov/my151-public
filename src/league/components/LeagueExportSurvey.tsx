import { useRef, useState } from 'react';
import type { IconType } from 'react-icons';
import { Search, Send, UserRound } from 'lucide-react';
import { SiBluesky, SiDiscord, SiReddit, SiTumblr, SiX } from 'react-icons/si';
import { Button } from '@/components/ui/button';
import { sendFeedback, collectFeedbackContext } from '@/lib/feedbackContext';
import {
  exportSurveyFeedbackRoute,
  type ExportSurveyTool,
} from '@/lib/exportSurvey';

/**
 * 4chan mark from Simple Icons (CC0).
 * https://simpleicons.org/icons/4chan
 */
function FourChanMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M11.07 8.82S9.803 1.079 5.145 1.097C2.006 1.109.78 4.124 3.055 4.802c0 0-2.698.973-2.698 2.697 0 1.725 4.274 3.54 10.713 1.32zm1.931 5.924s.904 7.791 5.558 7.991c3.136.135 4.503-2.82 2.262-3.604 0 0 2.74-.845 2.82-2.567.08-1.723-4.105-3.737-10.64-1.82zm-3.672-1.55s-7.532 2.19-6.952 6.813c.39 3.114 3.53 3.969 3.93 1.63 0 0 1.29 2.559 3.002 2.351 1.712-.208 3-4.67.02-10.794zm5.623-2.467s7.727-1.35 7.66-6.008c-.046-3.138-3.074-4.333-3.728-2.051 0 0-1-2.686-2.726-2.668-1.724.018-3.494 4.312-1.206 10.727z" />
    </svg>
  );
}

const HEARD: { id: string; label: string; Icon: IconType | typeof Search | typeof Send | typeof UserRound }[] =
  [
    { id: 'search', label: 'Search engine', Icon: Search },
    { id: 'friend', label: 'Friend', Icon: UserRound },
    { id: 'discord', label: 'Discord', Icon: SiDiscord },
    { id: 'reddit', label: 'Reddit', Icon: SiReddit },
    { id: 'x', label: 'X / Twitter', Icon: SiX },
    { id: '4chan', label: '4chan', Icon: FourChanMark },
    { id: 'bluesky', label: 'Bluesky', Icon: SiBluesky },
    { id: 'tumblr', label: 'Tumblr', Icon: SiTumblr },
    { id: 'other', label: 'Other', Icon: Send },
  ];

function chipClass(on: boolean) {
  return on
    ? 'border-primary bg-primary text-primary-foreground'
    : 'border-border bg-background text-foreground hover:bg-muted';
}

export function LeagueExportSurvey({
  exportKind,
  openedAt,
  onDone,
}: {
  exportKind: ExportSurveyTool;
  openedAt: number;
  onDone: () => void;
}) {
  const [heard, setHeard] = useState<Set<string>>(() => new Set());
  const [heardOther, setHeardOther] = useState('');
  const [ideas, setIdeas] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const otherInputRef = useRef<HTMLInputElement>(null);

  const toggleHeard = (id: string) => {
    setHeard((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const otherOn = heard.has('other');

  const selectOther = () => {
    setHeard((prev) => {
      if (prev.has('other')) return prev;
      const next = new Set(prev);
      next.add('other');
      return next;
    });
  };

  const toggleOther = () => {
    if (otherOn) {
      setHeard((prev) => {
        const next = new Set(prev);
        next.delete('other');
        return next;
      });
      setHeardOther('');
    } else {
      selectOther();
      queueMicrotask(() => otherInputRef.current?.focus());
    }
  };

  const submit = async () => {
    setSending(true);
    try {
      const elapsed = Date.now() - openedAt;
      if (elapsed < 2000) {
        await new Promise((r) => window.setTimeout(r, 2000 - elapsed));
      }
      const context = collectFeedbackContext(exportSurveyFeedbackRoute(exportKind));
      context.exportSurvey = true;
      context.exportTool = exportKind;
      const heardLabels = [...heard].map((id) => {
        if (id === 'other') return heardOther.trim() ? `Other: ${heardOther.trim()}` : 'Other';
        return HEARD.find((h) => h.id === id)?.label ?? id;
      });
      const body = [
        'Export follow-up',
        `export: ${exportKind}`,
        `heard: ${heardLabels.join(', ') || '—'}`,
        `ideas: ${ideas.trim() || '—'}`,
      ].join('\n');
      const ok = await sendFeedback({
        category: 'idea',
        message: body,
        context,
        dwellMs: Math.max(Date.now() - openedAt, 2000),
      });
      if (ok) {
        setSent(true);
        window.setTimeout(onDone, 1200);
      }
    } finally {
      setSending(false);
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
    <div
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 pb-4 pt-1"
      data-export-survey
    >
      <fieldset className="space-y-2 border-0 p-0">
        <legend className="text-sm font-semibold">How did you hear about my151?</legend>
        <p className="text-xs text-muted-foreground">Select all that apply.</p>
        <div className="flex flex-col gap-1">
          {HEARD.filter((h) => h.id !== 'other').map(({ id, label, Icon }) => {
            const on = heard.has(id);
            return (
              <button
                key={id}
                type="button"
                className={`grid w-full grid-cols-[1.25rem_minmax(0,1fr)] items-center gap-2 rounded-md border px-2.5 py-2 text-left text-sm font-medium transition-colors ${chipClass(on)} cursor-pointer`}
                onClick={() => toggleHeard(id)}
              >
                <span className="flex h-5 w-5 items-center justify-center">
                  <Icon className="size-4 shrink-0" aria-hidden />
                </span>
                <span>{label}</span>
              </button>
            );
          })}
          <div className="flex w-full items-stretch gap-1" data-export-other-row>
            <button
              type="button"
              className={`inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-sm font-medium transition-colors ${chipClass(otherOn)}`}
              onClick={toggleOther}
              aria-pressed={otherOn}
              data-export-other
            >
              <Send className="size-4 shrink-0" aria-hidden />
              Other
            </button>
            <input
              ref={otherInputRef}
              value={heardOther}
              onChange={(e) => {
                selectOther();
                setHeardOther(e.target.value);
              }}
              onFocus={selectOther}
              onPointerDown={selectOther}
              placeholder="Where?"
              aria-label="How you heard about the site"
              data-export-other-input
              className="min-w-0 flex-1 rounded-md border border-input bg-background px-2.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>
        </div>
      </fieldset>

      <label className="block space-y-1.5">
        <span className="text-sm font-semibold">Ideas, features, bugs, or anything I should know</span>
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
