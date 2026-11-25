import { ArrowLeftRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/Feedback';
import { Sheet } from '@/components/ui/Sheet';
import { formatDate } from '@/domain/dates';
import type { ChoreAssignment } from '@/domain/types';
import type { Household } from '@/hooks/useHousehold';

export function SwapSheet({ h, source, onClose }: { h: Household; source: ChoreAssignment | null; onClose: () => void }) {
  const { t } = useTranslation();
  const choreTitle = (id: string) => h.snap.chores.find((c) => c.id === id)?.title ?? '—';
  const candidates = source
    ? h.snap.assignments.filter((a) => a.week_start === source.week_start && a.status === 'pending' && a.assignee_id !== source.assignee_id && a.id !== source.id)
    : [];

  return (
    <Sheet open={source !== null} onClose={onClose} title={t('chores.swapTitle')} description={source ? `${choreTitle(source.chore_id)} · ${h.fullNameOf(source.assignee_id)}` : undefined}>
      <p className="mb-4 text-sm text-muted">{t('chores.swapDescription')}</p>
      {candidates.length === 0 ? (
        <EmptyState compact icon={<ArrowLeftRight className="h-5 w-5" />} title={t('chores.swapNone')} />
      ) : (
        <ul className="space-y-2">
          {candidates.map((c) => {
            const m = h.memberById.get(c.assignee_id);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-xl border border-line px-4 py-3 text-left hover:border-brand-400 hover:bg-sunken"
                  onClick={async () => {
                    const r = await h.run((repo) => repo.swapAssignments(source!.id, c.id), { success: t('chores.swapped') });
                    if (r.ok) onClose();
                  }}
                >
                  {m && <Avatar name={m.profile.display_name} color={m.profile.avatar_color} size="sm" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{choreTitle(c.chore_id)}</span>
                    <span className="text-xs text-muted">
                      {h.fullNameOf(c.assignee_id)} · {formatDate(c.due_date, h.intl, { weekday: 'short', day: 'numeric' })}
                    </span>
                  </span>
                  <ArrowLeftRight className="h-4 w-4 text-subtle" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}
