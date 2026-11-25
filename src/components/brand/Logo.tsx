import { cn } from '@/lib/cn';

/** RoomieHub mark: a house whose interior holds three roomies (dots). */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={cn('h-9 w-9', className)} aria-hidden>
      <rect width="48" height="48" rx="14" fill="#0f625b" />
      <path d="M12 22.5 24 13l12 9.5V34a2 2 0 0 1-2 2H14a2 2 0 0 1-2-2V22.5Z" fill="none" stroke="#d5f2ed" strokeWidth="3" strokeLinejoin="round" />
      <circle cx="18.5" cy="28.5" r="2.6" fill="#7bcfc3" />
      <circle cx="24" cy="28.5" r="2.6" fill="#ffffff" />
      <circle cx="29.5" cy="28.5" r="2.6" fill="#f59e0b" />
    </svg>
  );
}

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark />
      {!compact && <span className="text-[17px] font-semibold tracking-tight text-ink">RoomieHub</span>}
    </span>
  );
}
