import { cn } from '@/lib/cn';
import { paletteOf } from '@/lib/palette';

export function initials(name: string): string {
  const clean = name.replace(/\(.*?\)/g, '').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

const SIZES = { xs: 'h-5 w-5 text-[9px]', sm: 'h-7 w-7 text-[11px]', md: 'h-9 w-9 text-xs', lg: 'h-12 w-12 text-sm' } as const;

export function Avatar({ name, color, size = 'md', className, ring }: { name: string; color?: string | null; size?: keyof typeof SIZES; className?: string; ring?: boolean }) {
  return (
    <span
      title={name}
      aria-hidden
      className={cn(
        'inline-grid shrink-0 select-none place-items-center rounded-full font-semibold',
        paletteOf(color).solid,
        SIZES[size],
        ring && 'ring-2 ring-surface',
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
