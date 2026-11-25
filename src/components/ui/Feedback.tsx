import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span role="status" className={cn('inline-flex items-center gap-2 text-muted', className)}>
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      {label && <span className="text-sm">{label}</span>}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-xl bg-sunken', className)} />;
}

export function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy>
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-36" />
        <Skeleton className="h-36" />
        <Skeleton className="h-36" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

export function EmptyState({ icon, title, hint, action, compact }: { icon: ReactNode; title: ReactNode; hint?: ReactNode; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={cn('flex flex-col items-center text-center', compact ? 'px-4 py-6' : 'px-6 py-12')}>
      <span className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">{icon}</span>
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-muted">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ProgressBar({ value, className, tone = 'brand' }: { value: number; className?: string; tone?: 'brand' | 'warning' }) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div className={cn('h-2 overflow-hidden rounded-full bg-sunken', className)} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn('h-full rounded-full transition-[width] duration-500', tone === 'brand' ? 'bg-brand-500' : 'bg-amber-500')} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Alert({ tone = 'info', icon, children, action }: { tone?: 'info' | 'warning' | 'danger' | 'success'; icon?: ReactNode; children: ReactNode; action?: ReactNode }) {
  const tones = {
    info: 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-200',
    warning: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200',
    danger: 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200',
  };
  return (
    <div className={cn('flex items-start gap-3 rounded-xl border px-4 py-3 text-sm', tones[tone])}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}
