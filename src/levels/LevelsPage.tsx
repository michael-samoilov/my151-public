import { useMemo, useState } from 'react';
import { predictLevel } from '@/league/model/levelFit';
import { ROW_THRESHOLDS, levelModel, type LevelPoint } from './levelData';

/**
 * The evolution-level model, drawn.
 *
 * The card decides which stage of a line a row shows by comparing the stage's
 * evolution level against that row's hidden threshold. Stone, trade and
 * friendship evolutions have no level, so they get one from a regression of
 * level on base stat total. This page is that regression: the cloud it was
 * fitted to, the line, and every level-less evolver sitting on the line where
 * the model put it.
 *
 * Preview-only. `main.tsx` refuses to mount it on the production deploy.
 */

// Two series, one job: identity (measured against implied). Checked with the
// palette validator — ΔE 32 under protanopia, 38 with normal vision, both
// above 3:1 on the page surface.
const REAL = '#2563eb';
const IMPLIED = '#d97706';
const INK = '#525252';
const FAINT = '#e5e5e5';

const VB = { w: 360, h: 212 };
// The right margin is the row-threshold gutter: labels inside the plot land
// on the fit line wherever the two cross.
const PAD = { left: 30, right: 30, top: 8, bottom: 26 };
const PLOT = { w: VB.w - PAD.left - PAD.right, h: VB.h - PAD.top - PAD.bottom };
const X_MIN = 180;
const X_MAX = 700;
const Y_MAX = 70;

const sx = (bst: number) => PAD.left + ((bst - X_MIN) / (X_MAX - X_MIN)) * PLOT.w;
const sy = (level: number) => PAD.top + PLOT.h - (level / Y_MAX) * PLOT.h;

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <div className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-lg font-bold tabular-nums leading-tight">{value}</div>
      {note && <div className="text-[0.6875rem] text-muted-foreground">{note}</div>}
    </div>
  );
}

function Section({ title, blurb, children }: { title: string; blurb: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="text-base font-bold">{title}</h2>
      <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted-foreground">{blurb}</p>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-[0.8125rem]">
        <thead>
          <tr className="border-b text-left text-[0.6875rem] uppercase tracking-wide text-muted-foreground">
            {head.map((h) => (
              <th key={h} className="whitespace-nowrap px-3 py-1.5 font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b last:border-0">
              {r.map((c, j) => (
                <td key={j} className="px-3 py-1.5 align-top">{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Scatter({ model }: { model: ReturnType<typeof levelModel> }) {
  const [hover, setHover] = useState<{ p: LevelPoint; implied: boolean } | null>(null);
  const [showRows, setShowRows] = useState(true);

  const all = useMemo(
    () => [
      ...model.real.map((p) => ({ p, implied: false })),
      ...model.implied.map((p) => ({ p, implied: true })),
    ],
    [model],
  );

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    // Client pixels back into viewBox units.
    const vx = ((e.clientX - rect.left) / rect.width) * VB.w;
    const vy = ((e.clientY - rect.top) / rect.height) * VB.h;
    let best: { p: LevelPoint; implied: boolean } | null = null;
    let bestD = 8 * 8;
    for (const entry of all) {
      const dx = sx(entry.p.bst) - vx;
      const dy = sy(entry.p.level) - vy;
      const d = dx * dx + dy * dy;
      // A tie goes to the implied point: it is what the page is about.
      if (d < bestD || (d === bestD && entry.implied)) {
        bestD = d;
        best = entry;
      }
    }
    setHover(best);
  };

  const fitY = (bst: number) => Math.max(0, Math.min(Y_MAX, predictLevel(bst, model.fit)));

  return (
    <div>
      <div className="mb-2 flex max-w-[40rem] flex-wrap items-center gap-x-4 gap-y-1 text-[0.8125rem]">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: REAL }} />
          Stated level ({model.real.length})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full ring-1 ring-white" style={{ background: IMPLIED }} />
          Implied ({model.implied.length})
        </span>
        <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-muted-foreground">
          <input type="checkbox" checked={showRows} onChange={(e) => setShowRows(e.target.checked)} />
          Card row thresholds
        </label>
      </div>

      {/* Capped: past this the SVG's own text outgrows the prose around it. */}
      <div className="relative max-w-[40rem] rounded-lg border bg-card p-1">
        <svg
          viewBox={`0 0 ${VB.w} ${VB.h}`}
          className="w-full"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          role="img"
          aria-label="Evolution level against base stat total"
        >
          {showRows &&
            ROW_THRESHOLDS.map((level, i) => {
              // Two rows four levels apart would stack their labels, so a
              // label is dropped when the line above is too close. The line
              // still draws; only the word goes.
              const prev = i > 0 ? ROW_THRESHOLDS[i - 1] : null;
              const room = prev === null || Math.abs(sy(level) - sy(prev)) > 6;
              return (
                <g key={i}>
                  <line x1={PAD.left} y1={sy(level)} x2={PAD.left + PLOT.w} y2={sy(level)} stroke={FAINT} strokeWidth="0.6" />
                  {room && (
                    <text x={PAD.left + PLOT.w + 3} y={sy(level) + 2} fontSize="5.5" fill="#a3a3a3">
                      row {i + 1}
                    </text>
                  )}
                </g>
              );
            })}

          {/* Axes: recessive, and only where a value has to be read. */}
          <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + PLOT.h} stroke={FAINT} strokeWidth="0.8" />
          <line x1={PAD.left} y1={PAD.top + PLOT.h} x2={PAD.left + PLOT.w} y2={PAD.top + PLOT.h} stroke={FAINT} strokeWidth="0.8" />
          {[0, 10, 20, 30, 40, 50, 60, 70].map((v) => (
            <text key={v} x={PAD.left - 3} y={sy(v) + 2} textAnchor="end" fontSize="6" fill="#a3a3a3">{v}</text>
          ))}
          {[200, 300, 400, 500, 600, 700].map((v) => (
            <text key={v} x={sx(v)} y={VB.h - 14} textAnchor="middle" fontSize="6" fill="#a3a3a3">{v}</text>
          ))}
          <text x={PAD.left + PLOT.w / 2} y={VB.h - 4} textAnchor="middle" fontSize="6.5" fill={INK}>
            Base stat total
          </text>
          <text
            x={8}
            y={PAD.top + PLOT.h / 2}
            textAnchor="middle"
            fontSize="6.5"
            fill={INK}
            transform={`rotate(-90 8 ${PAD.top + PLOT.h / 2})`}
          >
            Evolution level
          </text>

          {model.real.map((p) => (
            <circle key={`r${p.id}`} cx={sx(p.bst)} cy={sy(p.level)} r="1.7" fill={REAL} fillOpacity="0.32" />
          ))}

          <line
            x1={sx(X_MIN)}
            y1={sy(fitY(X_MIN))}
            x2={sx(X_MAX)}
            y2={sy(fitY(X_MAX))}
            stroke={INK}
            strokeWidth="1"
            strokeDasharray="3 2"
          />

          {model.implied.map((p) => (
            <circle
              key={`i${p.id}`}
              cx={sx(p.bst)}
              cy={sy(p.level)}
              r="2.1"
              fill={IMPLIED}
              stroke="#ffffff"
              strokeWidth="0.5"
            />
          ))}

          {hover && (
            <circle
              cx={sx(hover.p.bst)}
              cy={sy(hover.p.level)}
              r="4"
              fill="none"
              stroke={hover.implied ? IMPLIED : REAL}
              strokeWidth="1"
            />
          )}
        </svg>

        {hover && (
          <div className="pointer-events-none absolute left-2 top-2 rounded-md border bg-background/95 px-2 py-1 text-[0.75rem] shadow-sm">
            <span className="font-semibold">{hover.p.name}</span>
            <span className="text-muted-foreground">
              {' '}· BST {hover.p.bst} · {hover.implied ? 'implied' : 'stated'} L{hover.p.level} · row{' '}
              {hover.p.row}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function LevelsPage() {
  const model = levelModel();
  const { fit, quality } = model;

  return (
    <div className="mx-auto w-full max-w-[52rem] px-4 pb-16 pt-4">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-xl font-extrabold tracking-tight">Evolution level model</h1>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[0.6875rem] font-semibold text-amber-800">
          Preview only
        </span>
        <a href="/pokemon-league-builder" className="ml-auto text-[0.8125rem] text-primary underline">
          League builder
        </a>
      </header>
      <p className="mt-2 text-[0.875rem] leading-relaxed text-muted-foreground">
        A gym card fills itself in by comparing each stage's evolution level
        against the row's hidden threshold. Stone, trade and friendship
        evolutions state no level, so the builder implies one: a least-squares
        fit of level on base stat total, over every evolution that does state a
        level. This page is that fit.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Fitted on" value={String(quality.n)} note="stated-level evolutions" />
        <Stat label="Implied" value={String(model.implied.length)} note="level-less evolutions" />
        <Stat label="R²" value={quality.r2.toFixed(2)} note="of the level spread explained" />
        <Stat label="Typical miss" value={`${quality.rmse.toFixed(1)} levels`} note="root mean square error" />
      </div>

      <p className="mt-3 text-[0.8125rem] leading-relaxed text-muted-foreground">
        level = {fit.slope.toFixed(4)} × BST − {Math.abs(fit.intercept).toFixed(1)}, fitted over BST{' '}
        {model.bstRange[0]}–{model.bstRange[1]}. Every amber point sits exactly on the line, because
        the line is where it came from. The blue cloud is how far the real thing scatters around it:
        the rows are about six levels apart, and the typical miss is {quality.rmse.toFixed(1)}, so an
        implied stage is often a row out either way.
      </p>

      <div className="mt-4">
        <Scatter model={model} />
      </div>

      <Section
        title="Lines the curve alone would strip a member from"
        blurb={
          `${model.wouldLoseAMember.length} lines put two or more stages in the same row, so only the ` +
          'highest of them ever draws. The engine now gives each stage at least the row after its ' +
          "pre-evolution's, which is what the corrected column shows. Nothing here is outstanding — " +
          'it is the list the correction exists for.'
        }
      >
        <Table
          head={['Line', 'From the curve', 'Would never draw', 'Corrected']}
          rows={model.wouldLoseAMember.map((l) => [
            <span>{l.names.join(' → ')}</span>,
            <span className="tabular-nums text-muted-foreground">{l.raw.join(', ')}</span>,
            <span className="text-amber-700">{l.missing.join(', ')}</span>,
            <span className="tabular-nums">{l.corrected.join(', ')}</span>,
          ])}
        />
      </Section>

      <Section
        title="Evolutions the model puts before their own pre-evolution"
        blurb={
          `${model.inversions.length} stages have no stated level, and the implied one lands at or under ` +
          'the real level of the stage below. These are the cases where BST is the wrong proxy: a ' +
          'trade or a stone evolution is not always stronger than what it evolves from.'
        }
      >
        <Table
          head={['Pre-evolution', 'Evolution', 'Gap']}
          rows={model.inversions.map((inv) => [
            <span>{inv.pre.name} · L{inv.pre.level}</span>,
            <span>{inv.post.name} · L{inv.post.level}</span>,
            <span className="tabular-nums">{inv.post.level - inv.pre.level}</span>,
          ])}
        />
      </Section>

      <Section
        title="Where the fit misses hardest"
        blurb={
          'These evolutions state their own level, so the builder never uses the prediction for them — ' +
          'they are here to show the error the model carries. Pseudo-legendaries evolve far later than ' +
          'their stats suggest, and Gyarados far earlier.'
        }
      >
        <Table
          head={['Pokémon', 'Stated', 'Predicted', 'Off by']}
          rows={model.residuals.map((r) => [
            <span>{r.point.name}</span>,
            <span className="tabular-nums">L{r.point.level}</span>,
            <span className="tabular-nums text-muted-foreground">L{r.predicted.toFixed(1)}</span>,
            <span className="tabular-nums">{r.error > 0 ? '+' : ''}{r.error.toFixed(1)}</span>,
          ])}
        />
      </Section>

      <Section
        title="Lines that begin on a baby form"
        blurb={
          `Seating any member of these ${model.babyLines.length} lines seats the baby too — the builder ` +
          'walks up to the root of the chain. So picking Pikachu puts Pichu in gym 1. Worth a decision: ' +
          'keep it, or start the line at the first non-baby stage.'
        }
      >
        <Table
          head={['Baby', 'Evolves into', 'At']}
          rows={model.babyLines.map((b) => [
            <span>{b.baby}</span>,
            <span>{b.next}</span>,
            <span className="tabular-nums">L{b.level}</span>,
          ])}
        />
      </Section>

      <Section
        title="Branching lines"
        blurb={
          `${model.branches.length} pre-evolutions have more than one evolution. The card seats the one ` +
          'branch that runs through the Pokémon you tapped, so the others never appear in that column.'
        }
      >
        <Table
          head={['Splits at', 'Into']}
          rows={model.branches.map((b) => [
            <span>{b.from}</span>,
            <span>{b.to.map((t) => `${t.name} (L${t.level})`).join(', ')}</span>,
          ])}
        />
      </Section>

      <Section
        title="Rows each seat offers"
        blurb={
          'A seat joins the card at the first row big enough for it, so the later seats have fewer rows ' +
          'than a three-stage line has stages. Seat 6 has two: its top stage can only be reached by ' +
          'dragging.'
        }
      >
        <Table
          head={['Seat', 'Joins at row', 'Rows available']}
          rows={model.seatCapacity.map((s) => [
            <span className="tabular-nums">{s.seat}</span>,
            <span className="tabular-nums">{s.joinRow}</span>,
            <span className={s.rows < 3 ? 'tabular-nums text-amber-700' : 'tabular-nums'}>{s.rows}</span>,
          ])}
        />
      </Section>
    </div>
  );
}
