import type { PaletteColor } from '@/domain/types';

// Static class strings (Tailwind only generates classes it can see in source).
export const PALETTE_CLASSES: Record<PaletteColor, { solid: string; soft: string; text: string; dot: string; hex: string }> = {
  teal: { solid: 'bg-teal-600 text-white', soft: 'bg-teal-100 text-teal-800 dark:bg-teal-500/15 dark:text-teal-300', text: 'text-teal-700 dark:text-teal-300', dot: 'bg-teal-500', hex: '#14b8a6' },
  violet: { solid: 'bg-violet-600 text-white', soft: 'bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300', text: 'text-violet-700 dark:text-violet-300', dot: 'bg-violet-500', hex: '#8b5cf6' },
  coral: { solid: 'bg-orange-500 text-white', soft: 'bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300', text: 'text-orange-700 dark:text-orange-300', dot: 'bg-orange-500', hex: '#f97316' },
  amber: { solid: 'bg-amber-500 text-white', soft: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300', text: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-500', hex: '#f59e0b' },
  sky: { solid: 'bg-sky-600 text-white', soft: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300', text: 'text-sky-700 dark:text-sky-300', dot: 'bg-sky-500', hex: '#0ea5e9' },
  rose: { solid: 'bg-rose-600 text-white', soft: 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300', text: 'text-rose-700 dark:text-rose-300', dot: 'bg-rose-500', hex: '#f43f5e' },
  lime: { solid: 'bg-lime-600 text-white', soft: 'bg-lime-100 text-lime-800 dark:bg-lime-500/15 dark:text-lime-300', text: 'text-lime-700 dark:text-lime-300', dot: 'bg-lime-500', hex: '#84cc16' },
  slate: { solid: 'bg-slate-600 text-white', soft: 'bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300', text: 'text-slate-600 dark:text-slate-300', dot: 'bg-slate-500', hex: '#64748b' },
};

export function paletteOf(color: string | null | undefined) {
  return PALETTE_CLASSES[(color as PaletteColor) in PALETTE_CLASSES ? (color as PaletteColor) : 'slate'];
}
