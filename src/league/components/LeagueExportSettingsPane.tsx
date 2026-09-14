import { Check, Download, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { LeagueHomeExportLayout, LeagueHomeTeamMode } from '../export/exportOptions';

const TEAM_OPTIONS: { mode: LeagueHomeTeamMode; label: string; fill: 'left' | 'right' | 'both' }[] = [
  { mode: 'story', label: 'Story', fill: 'left' },
  { mode: 'rematch', label: 'Rematch', fill: 'right' },
  { mode: 'both', label: 'Story and Rematch', fill: 'both' },
];

const DETAIL_OPTIONS: {
  key: 'showLeagueName' | 'showTheme' | 'showTmReward' | 'showBadgeName';
  title: string;
}[] = [
  { key: 'showLeagueName', title: 'League Name' },
  { key: 'showTheme', title: 'Theme' },
  { key: 'showTmReward', title: 'TM Reward' },
  { key: 'showBadgeName', title: 'Badge Name' },
];

export function LeagueExportSettingsPane({
  isLeague,
  layout,
  onLayout,
  busy,
  onExport,
  onClose,
  mobileSheet = false,
}: {
  isLeague: boolean;
  layout: LeagueHomeExportLayout;
  onLayout: (next: LeagueHomeExportLayout) => void;
  busy: boolean;
  onExport: () => void;
  onClose: () => void;
  mobileSheet?: boolean;
}) {
  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-background">
      {!mobileSheet && (
        <div className="shrink-0 border-b">
          <div className="flex h-11 items-center justify-between px-3 py-2">
            <span className="text-sm font-semibold text-foreground">Export</span>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 cursor-pointer rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Close export"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {isLeague ? (
          <div className={mobileSheet ? 'space-y-2 px-3 pb-2 pt-1' : 'space-y-4 px-3 pb-2 pt-3'}>
            <div>
              <h3 className="mb-2 text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground">
                Details
              </h3>
              <div className={mobileSheet ? 'grid grid-cols-2 gap-1' : 'space-y-1'}>
                {DETAIL_OPTIONS.map(({ key, title }) => (
                  <LayoutToggle
                    key={key}
                    on={layout[key]}
                    title={title}
                    compact={mobileSheet}
                    onClick={() => onLayout({ ...layout, [key]: !layout[key] })}
                  />
                ))}
              </div>
            </div>
            <div>
              <h3 className="mb-1 text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground">
                Teams
              </h3>
              <div className="grid grid-cols-3 gap-1">
                {TEAM_OPTIONS.map(({ mode, label, fill }) => (
                  <TeamModeOption
                    key={mode}
                    selected={layout.teamMode === mode}
                    label={label}
                    fill={fill}
                    onClick={() => onLayout({ ...layout, teamMode: mode })}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <p className="px-3 py-3 text-sm text-muted-foreground">
            Trainer card exports match the card on screen.
          </p>
        )}
      </div>

      <div className={`flex shrink-0 flex-col gap-2 border-t pt-2 ${mobileSheet ? 'px-3 pb-3' : 'px-4 pb-4'}`}>
        <Button type="button" disabled={busy} onClick={onExport} data-league-export-confirm>
          {busy ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Preparing…
            </>
          ) : (
            <>
              <Download className="mr-2 size-4" />
              Save image
            </>
          )}
        </Button>
        {!mobileSheet && (
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

function LayoutToggle({
  on,
  title,
  onClick,
  compact = false,
}: {
  on: boolean;
  title: string;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-export-detail={title}
      className={`w-full cursor-pointer rounded-md text-left transition-colors ${
        compact ? 'px-2 py-1.5' : 'px-3 py-2'
      } ${on ? 'bg-primary/10' : 'hover:bg-muted'}`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
            on ? 'border-primary bg-primary' : 'border-muted-foreground/40'
          }`}
        >
          {on && <Check className="h-3 w-3 text-primary-foreground" />}
        </span>
        <span className={`text-sm leading-tight ${on ? 'font-medium text-primary' : 'text-foreground'}`}>
          {title}
        </span>
      </div>
    </button>
  );
}

function TeamModeGlyph({ fill }: { fill: 'left' | 'right' | 'both' }) {
  const left = fill === 'left' || fill === 'both';
  const right = fill === 'right' || fill === 'both';
  return (
    <svg viewBox="0 0 32 20" className="h-4 w-7" aria-hidden>
      <rect
        x="1.25"
        y="1.25"
        width="13.5"
        height="17.5"
        rx="2"
        fill={left ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect
        x="17.25"
        y="1.25"
        width="13.5"
        height="17.5"
        rx="2"
        fill={right ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function TeamModeOption({
  selected,
  label,
  fill,
  onClick,
}: {
  selected: boolean;
  label: string;
  fill: 'left' | 'right' | 'both';
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-export-team={fill === 'both' ? 'both' : fill === 'left' ? 'story' : 'rematch'}
      className={`flex cursor-pointer flex-col items-center gap-1 rounded-md px-1 py-2 text-center text-[0.6875rem] leading-tight transition-colors ${
        selected ? 'bg-primary/10 font-medium text-primary' : 'text-foreground hover:bg-muted'
      }`}
    >
      <TeamModeGlyph fill={fill} />
      {label}
    </button>
  );
}
