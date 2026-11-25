import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'violet';

const TONES: Record<Tone, string> = {
  neutral: 'bg-sunken text-muted',
  brand: 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300',
  success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  warning: 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300',
  danger: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300',
  info: 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300',
  violet: 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300',
};

export function Badge({ tone = 'neutral', icon, children, className }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold', TONES[tone], className)}>
      {icon}
      {children}
    </span>
  );
}
