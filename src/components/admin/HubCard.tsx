import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { JOURNAL_MAX_PER_DAY, type JournalEntry } from '../../../api/_events';
import { hubViews, journalHealth, type HubCounts } from '@/lib/hubJournal';

/**
 * The hub, from the per-day funnel journal.
 *
 * Its own file and its own fetch, like FeedbackCard: `/api/journal` returns
 * raw events rather than aggregates, the response grows with the window the
 * admin picks, and the dashboard's own load cycle has no reason to wait for
 * it.
 *
 * The hub is the only surface with no per-user record. Someone who reads it
 * and leaves exists nowhere else, so this card is the only place the top of
 * the funnel is visible at all.
 */

const WINDOWS = [7, 30, 90] as const;
type Window = (typeof WINDOWS)[number];

interface JournalResponse {
  from: string;
  to: string;
  maxDays: number;
  dayCap: number;
  days: { day: string; count: number; capped: boolean }[];
  entries: JournalEntry[];
  truncated: boolean;
  membership: Record<string, number>;
}

function dayKey(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);
}

async function fetchJournal(token: string, days: Window): Promise<JournalResponse> {
  const qs = new URLSearchParams({ from: dayKey(days - 1), to: dayKey(0) });
  const res = await fetch(`/api/journal?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new Error('Invalid admin token.');
  if (!res.ok) throw new Error(`Request failed (${res.status}).`);
  return (await res.json()) as JournalResponse;
}

function pct(n: number, of: number): string {
  return of > 0 ? `${Math.round((n / of) * 100)}%` : '–';
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="flex flex-col px-3 py-2 rounded-md bg-muted min-w-[6.5rem]">
      <span className="text-2xl font-bold tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

/** What became of the browsers that saw the hub, as one stacked bar. The four
 *  outcomes are exhaustive, so a bar is the honest shape: shares of one whole. */
function OutcomeBar({ c }: { c: HubCounts }) {
  const names:Record<string,string> = {dex:'Dex only',league:'League only',favorites:'Picker only','dex+league':'Dex + League','dex+favorites':'Dex + Picker','favorites+league':'Picker + League','dex+favorites+league':'All three',neither:'None'};
  const colors:Record<string,string> = {dex:'rgb(37,99,235)',league:'rgb(217,119,6)',favorites:'rgb(14,116,94)','dex+league':'rgb(109,40,217)','dex+favorites':'rgb(2,132,199)','favorites+league':'rgb(190,18,60)','dex+favorites+league':'var(--color-primary)',neither:'var(--color-muted-foreground)'};
  const rows = Object.entries(c.outcomes).filter(([,n])=>n>0).map(([key,n])=>({label:names[key] ?? key,n,color:colors[key]}));
  if (c.shown === 0) return null;
  return (
    <div>
      <div className="flex h-3 w-full rounded overflow-hidden">
        {rows.map((r) => (
          <div
            key={r.label}
            style={{ width: `${(r.n / c.shown) * 100}%`, background: r.color }}
            title={`${r.label}: ${r.n}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
        {rows.map((r) => (
          <span key={r.label} className="text-xs text-muted-foreground flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm inline-block" style={{ background: r.color }} />
            {r.label} · <span className="tabular-nums text-foreground">{r.n}</span> ({pct(r.n, c.shown)})
          </span>
        ))}
      </div>
    </div>
  );
}

export function HubCard({ token }: { token: string }) {
  const [days, setDays] = useState<Window>(30);
  const [data, setData] = useState<JournalResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Refresh bumps this rather than calling a loader, so every fetch goes
  // through the one effect and every state write lands in a promise callback —
  // an effect that writes state synchronously is a cascading render.
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    void fetchJournal(token, days)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setError(null);
      })
      .catch((e: Error) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [token, days, nonce]);

  const views = useMemo(
    () => (data ? hubViews(data.entries, data.membership) : null),
    [data],
  );
  const health = useMemo(() => (data ? journalHealth(data.days) : null), [data]);

  const t = views?.totals;

  return (
    <div className="shadow-elevated rounded-lg p-3 bg-card">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-sm font-medium">Hub (from the funnel journal)</span>
        <div className="flex items-center gap-1 ml-auto flex-wrap">
          {WINDOWS.map((w) => (
            <Button
              key={w}
              variant={days === w ? 'default' : 'ghost'}
              size="sm"
              onClick={() => {
                setLoading(true);
                setDays(w);
              }}
            >
              {w}d
            </Button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setLoading(true);
              setNonce((n) => n + 1);
            }}
            disabled={loading}
          >
            {loading ? 'Loading…' : 'Refresh'}
          </Button>
        </div>
      </div>

      {error && <p className="text-xs text-destructive mb-2">{error}</p>}

      {!t && !error && <p className="text-xs text-muted-foreground">{loading ? 'Loading…' : 'No journal yet.'}</p>}

      {t && data && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Stat value={t.shown} label="Saw the hub" />
            <Stat value={`${t.dexClicks} (${pct(t.dexClicks, t.shown)})`} label="Clicked the dex card" />
            <Stat value={`${t.leagueClicks} (${pct(t.leagueClicks, t.shown)})`} label="Clicked the league card" />
            <Stat value={`${t.favoriteClicks} (${pct(t.favoriteClicks,t.shown)})`} label="Clicked the picker card" />
            <Stat
              value={`${t.shown - t.becameNeither} (${pct(t.shown - t.becameNeither, t.shown)})`}
              label="Became a tool user"
            />
          </div>

          <div>
            <div className="text-xs text-muted-foreground mb-1">
              Of the {t.shown} browser{t.shown === 1 ? '' : 's'} that saw the hub in this window, what they
              ever used — including after the window closed
            </div>
            <OutcomeBar c={t} />
          </div>

          <div>
            <div className="text-xs text-muted-foreground mb-1">
              Builder callout (the card in the dex builder that points at the gym leader maker)
            </div>
            <div className="flex flex-wrap gap-2">
              <Stat value={t.promoShown} label="Callout shown" />
              <Stat value={`${t.promoCta} (${pct(t.promoCta, t.promoShown)})`} label="Clicked" />
              <Stat value={`${t.promoDismiss} (${pct(t.promoDismiss, t.promoShown)})`} label="Dismissed" />
            </div>
          </div>

          {views.days.length > 0 && (
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="text-xs w-full">
                <thead className="text-muted-foreground sticky top-0 bg-card">
                  <tr className="text-left">
                    <th className="pr-2 font-medium">Day</th>
                    <th className="pr-2 font-medium">Saw hub</th>
                    <th className="pr-2 font-medium">→ Dex</th>
                    <th className="pr-2 font-medium">→ League</th>
                    <th className="pr-2 font-medium">→ Picker</th>
                    <th className="pr-2 font-medium">Became a user</th>
                    <th className="font-medium">Bounced</th>
                  </tr>
                </thead>
                <tbody>
                  {[...views.days].reverse().map((d) => (
                    <tr key={d.day} className="border-t border-border/50">
                      <td className="pr-2 py-1 whitespace-nowrap">{d.day}</td>
                      <td className="pr-2 tabular-nums">{d.shown}</td>
                      <td className="pr-2 tabular-nums">
                        {d.dexClicks} <span className="text-muted-foreground">({pct(d.dexClicks, d.shown)})</span>
                      </td>
                      <td className="pr-2 tabular-nums">
                        {d.leagueClicks}{' '}
                        <span className="text-muted-foreground">({pct(d.leagueClicks, d.shown)})</span>
                      </td>
                      <td className="pr-2 tabular-nums">{d.favoriteClicks} <span className="text-muted-foreground">({pct(d.favoriteClicks,d.shown)})</span></td>
                      <td className="pr-2 tabular-nums">{d.shown - d.becameNeither}</td>
                      <td className="tabular-nums">{d.becameNeither}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Journal health: the journal is what every number above is read
              from, so its own gaps belong next to them, not on another page. */}
          {health && (
            <p className="text-[0.65rem] text-muted-foreground border-t border-border pt-2">
              Journal: {health.recent.map((d) => `${d.day.slice(5)} ${d.count}`).join(' · ')} entries.{' '}
              {health.lastCappedDay ? (
                <span className="text-amber-600">
                  Day cap ({JOURNAL_MAX_PER_DAY.toLocaleString()}) last hit on {health.lastCappedDay} — that
                  day's oldest events were discarded.
                </span>
              ) : (
                `Day cap (${JOURNAL_MAX_PER_DAY.toLocaleString()}) never hit in this window.`
              )}
              {data.truncated && (
                <span className="text-amber-600">
                  {' '}
                  This response was truncated: the oldest days in the window are not counted above.
                </span>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
