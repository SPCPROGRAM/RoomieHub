import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/*
 * Lightweight SVG/HTML charts (no chart library).
 * Palette validated with the dataviz validator (light & dark, all checks PASS):
 *   series A (teal)   #0d9488 both modes
 *   series B (violet) #7c3aed light / #8b5cf6 dark
 * Single-series charts use series A and need no legend (the card title names them).
 * Every chart has a hover tooltip and a visually hidden data table.
 */
const SERIES_A = 'fill-teal-600';
const SERIES_B = 'fill-violet-600 dark:fill-violet-500';
const SERIES_A_BG = 'bg-teal-600';
const SERIES_B_BG = 'bg-violet-600 dark:bg-violet-500';

export interface Datum {
  key: string;
  label: string;
  value: number;
}

function Tooltip({ children }: { children: ReactNode }) {
  return (
    <div role="tooltip" className="pointer-events-none absolute -top-2 left-1/2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-line bg-elevated px-2.5 py-1.5 text-xs text-ink shadow-float">
      {children}
    </div>
  );
}

function DataTable({ caption, headers, rows }: { caption: string; headers: string[]; rows: (string | number)[][] }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {headers.map((h) => (
            <th key={h} scope="col">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j}>{c}</td>))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Vertical bars over time (one series). Recessive baseline, value on hover, latest bar labeled. */
export function ColumnChart({ data, format, caption, height = 180 }: { data: Datum[]; format: (v: number) => string; caption: string; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const last = data.length - 1;
  return (
    <figure>
      <div className="relative flex items-end gap-2 border-b border-line" style={{ height }} aria-hidden>
        {data.map((d, i) => {
          const pct = (d.value / max) * 100;
          return (
            <div
              key={d.key}
              className="relative flex h-full flex-1 cursor-default flex-col justify-end"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onTouchStart={() => setHover(i)}
            >
              {(hover === i || (hover === null && i === last && d.value > 0)) && (
                <span className={cn('tabular mb-1 text-center text-[11px] font-medium', hover === i ? 'text-ink' : 'text-muted')}>{format(d.value)}</span>
              )}
              <div className={cn('mx-auto w-full max-w-12 rounded-t-[4px] transition-opacity', SERIES_A_BG, hover !== null && hover !== i && 'opacity-50')} style={{ height: `${Math.max(pct, d.value > 0 ? 1.5 : 0)}%` }} />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-2" aria-hidden>
        {data.map((d) => (
          <span key={d.key} className="flex-1 truncate text-center text-[11px] text-subtle">
            {d.label}
          </span>
        ))}
      </div>
      <DataTable caption={caption} headers={['', '']} rows={data.map((d) => [d.label, format(d.value)])} />
    </figure>
  );
}

/** Ranked horizontal bars, one series, direct labels (name + value) on every row. */
export function BarList({ data, format, caption, marker }: { data: Datum[]; format: (v: number) => string; caption: string; marker?: (key: string) => ReactNode }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <figure>
      <ul className="space-y-3" aria-hidden>
        {data.map((d) => (
          <li key={d.key} title={`${d.label}: ${format(d.value)}`}>
            <div className="mb-1 flex items-center gap-2 text-sm">
              {marker?.(d.key)}
              <span className="min-w-0 flex-1 truncate text-ink">{d.label}</span>
              <span className="tabular text-muted">{format(d.value)}</span>
              <span className="tabular w-10 text-right text-xs text-subtle">{total ? Math.round((d.value / total) * 100) : 0}%</span>
            </div>
            <div className="h-2 rounded-full bg-sunken">
              <div className={cn('h-full rounded-full', SERIES_A_BG)} style={{ width: `${(d.value / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
      <DataTable caption={caption} headers={['', '', '%']} rows={data.map((d) => [d.label, format(d.value), total ? `${Math.round((d.value / total) * 100)}%` : '0%'])} />
    </figure>
  );
}

/** Two series per group (e.g. paid vs share per member), shared scale, legend + hover values. */
export function PairedBars({
  groups,
  seriesA,
  seriesB,
  format,
  caption,
}: {
  groups: { key: string; label: string; a: number; b: number }[];
  seriesA: string;
  seriesB: string;
  format: (v: number) => string;
  caption: string;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(1, ...groups.flatMap((g) => [g.a, g.b]));
  const width = 100;
  return (
    <figure>
      <div className="mb-4 flex flex-wrap gap-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className={cn('h-2.5 w-2.5 rounded-sm', SERIES_A_BG)} aria-hidden />
          {seriesA}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className={cn('h-2.5 w-2.5 rounded-sm', SERIES_B_BG)} aria-hidden />
          {seriesB}
        </span>
      </div>
      <ul className="space-y-4" aria-hidden>
        {groups.map((g) => (
          <li key={g.key} className="relative" onMouseEnter={() => setHover(g.key)} onMouseLeave={() => setHover(null)} onTouchStart={() => setHover(g.key)}>
            {hover === g.key && (
              <Tooltip>
                <span className="font-semibold">{g.label}</span> · {seriesA}: {format(g.a)} · {seriesB}: {format(g.b)}
              </Tooltip>
            )}
            <p className="mb-1.5 text-sm font-medium text-ink">{g.label}</p>
            <svg viewBox={`0 0 ${width} 14`} preserveAspectRatio="none" className="h-[22px] w-full overflow-visible">
              <rect x="0" y="0" height="6" rx="1.5" width={Math.max((g.a / max) * width, g.a > 0 ? 0.8 : 0)} className={SERIES_A} />
              <rect x="0" y="8" height="6" rx="1.5" width={Math.max((g.b / max) * width, g.b > 0 ? 0.8 : 0)} className={SERIES_B} />
            </svg>
            <div className="mt-1 flex flex-wrap gap-x-4 text-[11px] text-muted">
              <span className="tabular inline-flex items-center gap-1">
                <span className={cn('h-2 w-2 rounded-sm', SERIES_A_BG)} aria-hidden />
                {seriesA}: {format(g.a)}
              </span>
              <span className="tabular inline-flex items-center gap-1">
                <span className={cn('h-2 w-2 rounded-sm', SERIES_B_BG)} aria-hidden />
                {seriesB}: {format(g.b)}
              </span>
            </div>
          </li>
        ))}
      </ul>
      <DataTable caption={caption} headers={['', seriesA, seriesB]} rows={groups.map((g) => [g.label, format(g.a), format(g.b)])} />
    </figure>
  );
}
