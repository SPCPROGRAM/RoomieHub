import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  count?: number;
}

/** Tab-like switch between views. Uses tablist semantics for screen readers. */
export function Segmented<T extends string>({ value, onChange, options, label, className }: { value: T; onChange: (v: T) => void; options: SegmentOption<T>[]; label: string; className?: string }) {
  return (
    <div role="tablist" aria-label={label} className={cn('inline-flex max-w-full gap-1 overflow-x-auto rounded-xl bg-sunken p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors',
            o.value === value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
          {o.count !== undefined && <span className="tabular rounded-full bg-sunken px-1.5 text-[11px] text-muted">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}
