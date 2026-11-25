import { Check } from 'lucide-react';
import type { Member, UUID } from '@/domain/types';
import { cn } from '@/lib/cn';
import { Avatar } from '../ui/Avatar';

/** Multi-select of members as toggle chips (used to choose who shares an expense). */
export function MemberChips({ members, value, onChange, labelOf, invalid }: { members: Member[]; value: UUID[]; onChange: (ids: UUID[]) => void; labelOf: (id: UUID) => string; invalid?: boolean }) {
  const toggle = (id: UUID) => {
    // keep the members' canonical order so the remainder distribution is predictable
    const next = value.includes(id) ? value.filter((x) => x !== id) : [...value, id];
    onChange(members.map((m) => m.user_id).filter((x) => next.includes(x)));
  };
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-invalid={invalid || undefined}>
      {members.map((m) => {
        const on = value.includes(m.user_id);
        return (
          <button
            key={m.user_id}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(m.user_id)}
            className={cn(
              'inline-flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm font-medium transition-colors',
              on ? 'border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-500/10 dark:text-brand-200' : 'border-line text-muted hover:bg-sunken',
              invalid && !on && 'border-rose-300',
            )}
          >
            <Avatar name={m.profile.display_name} color={m.profile.avatar_color} size="sm" />
            {labelOf(m.user_id)}
            {on && <Check className="h-3.5 w-3.5" aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}

export function MemberStack({ members, max = 3 }: { members: Member[]; max?: number }) {
  return (
    <span className="flex -space-x-2">
      {members.slice(0, max).map((m) => (
        <Avatar key={m.user_id} name={m.profile.display_name} color={m.profile.avatar_color} size="sm" ring />
      ))}
    </span>
  );
}
