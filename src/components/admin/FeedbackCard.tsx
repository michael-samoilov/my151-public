import { useMemo, useState } from 'react';
import { ExternalLink, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { routeCounts } from '@/lib/feedbackRoutes';
import {
  EXPORT_SURVEY_TOOL_LABEL,
  isExportSurveyTool,
} from '@/lib/exportSurvey';
import {
  openToolFor,
  requestFeedbackList,
  routeTool,
  useFeedbackList,
  type FeedbackItem,
  type FeedbackTool,
} from './feedbackList';

const SEEN_KEY = 'p151-feedback-seen';

const CATEGORY_LABELS: Record<string, string> = {
  bug: 'Bug',
  translation: 'Translation',
  idea: 'Idea',
  data: 'Data',
  other: 'Other',
  crash: 'Crash',
};

function rowText(item: FeedbackItem): string {
  if (item.message) return item.message;
  const err = item.context?.error as { name?: string; message?: string } | undefined;
  return err ? `${err.name ?? 'Error'}: ${err.message ?? ''}` : '';
}

function loadSeen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

function saveSeen(seen: Set<string>): void {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-5000)));
  } catch {
    return;
  }
}

function asIssue(item: FeedbackItem): string {
  const ctx = item.context ?? {};
  const lines = [
    `**${CATEGORY_LABELS[item.category] ?? item.category}** — ${new Date(item.ts).toISOString()}`,
    '',
    rowText(item),
    '',
    '<details><summary>Context</summary>',
    '',
    '```',
    ...Object.entries(ctx).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`),
    '```',
    '',
    '</details>',
  ];
  return lines.join('\n');
}

const TOOL_LABEL: Record<FeedbackTool, string> = { dex: 'Dex', league: 'League', favorites: 'Picker' };

function Row({
  item,
  seen,
  onToggle,
  openTool,
  toolKnown,
  onOpen,
}: {
  item: FeedbackItem;
  seen: boolean;
  onToggle: () => void;
  openTool: FeedbackTool | null;
  toolKnown: boolean;
  onOpen: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');
  const ctx = item.context ?? {};

  return (
    <li className={`border rounded-md p-2 text-xs flex flex-col gap-1 ${seen ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="px-1.5 py-0.5 rounded bg-muted font-medium">
          {CATEGORY_LABELS[item.category] ?? item.category}
        </span>
        <span className="text-muted-foreground tabular-nums">
          {new Date(item.ts).toLocaleString()}
        </span>
        {typeof ctx.locale === 'string' && (
          <span className="text-muted-foreground">{ctx.locale}</span>
        )}
        {typeof ctx.route === 'string' && (
          <span className="text-muted-foreground">/{ctx.route}</span>
        )}
        {item.country && <span className="text-muted-foreground">{item.country}</span>}
        {ctx.demo === true && <span className="text-amber-600">demo</span>}
        {ctx.exportSurvey === true && (
          <span className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 font-medium">
            Export
            {isExportSurveyTool(ctx.exportTool) ? ` · ${EXPORT_SURVEY_TOOL_LABEL[ctx.exportTool]}` : ''}
          </span>
        )}
        <button
          type="button"
          onClick={onToggle}
          className="ml-auto text-muted-foreground underline cursor-pointer"
        >
          {seen ? 'mark unread' : 'mark read'}
        </button>
      </div>

      <p className="whitespace-pre-wrap break-words">{rowText(item)}</p>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="text-muted-foreground underline cursor-pointer"
        >
          {expanded ? 'hide context' : 'context'}
        </button>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(asIssue(item))
              .then(() => setCopy('copied'))
              .catch(() => setCopy('failed'))
              .finally(() => setTimeout(() => setCopy('idle'), 1200));
          }}
          className="text-muted-foreground underline cursor-pointer"
        >
          {copy === 'copied' ? 'copied' : copy === 'failed' ? 'copy failed' : 'copy as issue'}
        </button>
        {openTool && (
          <button
            type="button"
            onClick={onOpen}
            data-testid="feedback-open-browser"
            data-tool={openTool}
            className="ml-auto inline-flex items-center gap-1 text-primary underline cursor-pointer"
          >
            <ExternalLink className="h-3 w-3" aria-hidden />
            Open browser{toolKnown ? ` · ${TOOL_LABEL[openTool]}` : ''}
          </button>
        )}
      </div>

      {expanded && (
        <pre className="bg-muted rounded p-2 overflow-x-auto text-[0.6875rem] whitespace-pre-wrap break-all">
          {Object.entries(ctx)
            .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
            .join('\n')}
        </pre>
      )}
    </li>
  );
}

export function FeedbackCard({
  token,
  toolsOf,
  onOpen,
  cidFilter = null,
  onClearCid,
}: {
  token: string;
  toolsOf?: (cid: string) => FeedbackTool[] | null;
  onOpen?: (tool: FeedbackTool, cid: string, country?: string) => void;
  cidFilter?: string | null;
  onClearCid?: () => void;
}) {
  const { data, error, loading: fetching } = useFeedbackList(token, true);
  const loading = fetching || (!data && !error);
  const [category, setCategory] = useState<string>('all');
  const [seen, setSeen] = useState<Set<string>>(() => loadSeen());

  const toggle = (id: string) => {
    setSeen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveSeen(next);
      return next;
    });
  };

  const items = useMemo(() => data?.items ?? [], [data]);
  const ofBrowser = cidFilter ? items.filter((i) => i.cid === cidFilter) : items;
  const shown = category === 'all' ? ofBrowser : ofBrowser.filter((i) => i.category === category);
  const unread = items.filter((i) => !seen.has(i.id)).length;
  const byRoute = useMemo(() => routeCounts(items), [items]);
  const pagePartial = (data?.total ?? 0) > items.length;

  return (
    <div className="shadow-elevated rounded-lg p-3 bg-card">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-sm font-medium">
          Feedback{unread > 0 && <span className="ml-1 text-primary">· {unread} new</span>}
        </span>
        <span className="text-xs text-muted-foreground">
          {data ? `${data.total} total` : ''}
        </span>
        <Button variant="ghost" size="sm" className="ml-auto" onClick={() => requestFeedbackList(token, true)} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </Button>
      </div>

      {error && <p className="text-xs text-destructive mb-2">{error}</p>}

      {cidFilter && (
        <div className="mb-2 flex items-center gap-1 text-xs">
          <span className="text-muted-foreground">Browser</span>
          <button
            type="button"
            onClick={onClearCid}
            data-testid="feedback-browser-filter"
            aria-label="Show all browsers"
            className="inline-flex items-center gap-1 rounded-full border border-primary bg-primary/5 px-2 py-0.5 font-semibold tabular-nums text-primary cursor-pointer"
          >
            {cidFilter.length <= 8 ? cidFilter : `${cidFilter.slice(0, 2)}…${cidFilter.slice(-4)}`}
            <span className="opacity-70">{ofBrowser.length}</span>
            <X className="h-3 w-3" aria-hidden />
          </button>
        </div>
      )}

      {data && (
        <div className="flex gap-1 flex-wrap mb-2">
          {['all', ...Object.keys(CATEGORY_LABELS)].map((id) => {
            const n7 = id === 'all'
              ? Object.values(data.last7).reduce((a, b) => a + b, 0)
              : (data.last7[id] ?? 0);
            const n30 = id === 'all'
              ? Object.values(data.last30).reduce((a, b) => a + b, 0)
              : (data.last30[id] ?? 0);
            return (
              <button
                key={id}
                type="button"
                onClick={() => setCategory(id)}
                className={`px-2 py-0.5 rounded-full border text-xs cursor-pointer ${
                  category === id ? 'border-primary text-primary bg-primary/5' : 'border-border text-muted-foreground'
                }`}
                title={`${n7} in the last 7 days, ${n30} in 30`}
              >
                {id === 'all' ? 'All' : CATEGORY_LABELS[id]}{' '}
                <span className="tabular-nums opacity-70">{n7}/{n30}</span>
              </button>
            );
          })}
        </div>
      )}

      {byRoute.length > 0 && (
        <div className="mb-2">
          <div className="text-xs text-muted-foreground mb-1">
            By surface, 7 / 30 days
            {pagePartial && <> · of the {items.length} reports loaded, not all {data?.total}</>}
          </div>
          <div className="flex gap-1 flex-wrap">
            {byRoute.map((r) => (
              <span key={r.route} className="text-xs rounded bg-muted px-2 py-0.5">
                {r.label} <span className="tabular-nums opacity-70">{r.last7}/{r.last30}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {shown.length === 0 ? (
        <p className="text-xs text-muted-foreground">{loading ? 'Loading…' : 'Nothing yet.'}</p>
      ) : (
        <ul className="flex flex-col gap-1.5 max-h-[28rem] overflow-y-auto">
          {shown.map((item) => {
            const cid = item.cid;
            const tools = cid && toolsOf ? toolsOf(cid) : null;
            const route = item.context?.route;
            const tool = !cid || !onOpen ? null : tools ? openToolFor(route, tools) : (routeTool(route) ?? 'dex');
            return (
              <Row
                key={item.id}
                item={item}
                seen={seen.has(item.id)}
                onToggle={() => toggle(item.id)}
                openTool={tool}
                toolKnown={tools != null}
                onOpen={() => tool && cid && onOpen?.(tool, cid, item.country)}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}
