import { Check, Download, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { LeagueHomeExportLayout, LeagueHomeTeamMode } from '../export/exportOptions';

const TEAM_OPTIONS: { mode: LeagueHomeTeamMode; label: string }[] = [
  { mode: 'story', label: 'Story' },
  { mode: 'rematch', label: 'Rematch' },
  { mode: 'both', label: 'Story and Rematch' },
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
    <div className="relative flex h-full w-full flex-col bg-background">
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
          <div className="space-y-4 px-3 pt-3 pb-2">
            <LayoutToggle
              on={layout.gymDetails}
              title="Gym details (theme, TM, badge)"
              onClick={() => onLayout({ ...layout, gymDetails: !layout.gymDetails })}
            />
            <div>
              <h3 className="mb-2 text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground">
                Teams
              </h3>
              <div className="space-y-1">
                {TEAM_OPTIONS.map(({ mode, label }) => (
                  <TeamModeOption
                    key={mode}
                    selected={layout.teamMode === mode}
                    label={label}
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

      <div className="flex shrink-0 flex-col gap-2 border-t px-4 pb-4 pt-2">
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
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function LayoutToggle({
  on,
  title,
  onClick,
}: {
  on: boolean;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full cursor-pointer rounded-md px-3 py-2 text-left transition-colors ${
        on ? 'bg-primary/10' : 'hover:bg-muted'
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
            on ? 'border-primary bg-primary' : 'border-muted-foreground/40'
          }`}
        >
          {on && <Check className="h-3 w-3 text-primary-foreground" />}
        </span>
        <span className={`text-sm ${on ? 'font-medium text-primary' : 'text-foreground'}`}>{title}</span>
      </div>
    </button>
  );
}

function TeamModeOption({
  selected,
  label,
  onClick,
}: {
  selected: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
        selected ? 'bg-primary/10 font-medium text-primary' : 'text-foreground hover:bg-muted'
      }`}
    >
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
          selected ? 'border-primary' : 'border-muted-foreground/40'
        }`}
      >
        {selected && <span className="h-2 w-2 rounded-full bg-primary" />}
      </span>
      {label}
    </button>
  );
}
