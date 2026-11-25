import { ArrowLeftRight, Check, MoreVertical, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CategoryTag } from '@/components/shared/CategoryTag';
import { Avatar } from '@/components/ui/Avatar';
import { Badge, type Tone } from '@/components/ui/Badge';
import { formatDate, todayISO } from '@/domain/dates';
import { displayStatus, type DisplayStatus } from '@/domain/rotation';
import type { Chore, ChoreAssignment } from '@/domain/types';
import type { Household } from '@/hooks/useHousehold';
import { cn } from '@/lib/cn';

const STATUS_TONE: Record<DisplayStatus, Tone> = { pending: 'neutral', done: 'success', skipped: 'neutral', overdue: 'danger' };

export function AssignmentRow({ h, assignment, chore, onSwap }: { h: Household; assignment: ChoreAssignment; chore: Chore | undefined; onSwap: (a: ChoreAssignment) => void }) {
  const { t } = useTranslation();
  const [menu, setMenu] = useState(false);
  const status = displayStatus(assignment, todayISO());
  const member = h.memberById.get(assignment.assignee_id);
  const done = assignment.status === 'done';
  const swapped = assignment.assignee_id !== assignment.original_assignee_id;

  const toggle = () =>
    h.run((repo) => (done ? repo.uncompleteAssignment(assignment.id) : repo.completeAssignment(h.snap.apartment.id, assignment.id, null)), {
      success: done ? undefined : t('chores.completed'),
    });

  return (
    <li className={cn('group flex items-center gap-3 rounded-2xl border border-line bg-surface px-3 py-3 transition-colors sm:px-4', done && 'bg-sunken/50')}>
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={!h.canWrite || assignment.status === 'skipped'}
        aria-label={done ? t('chores.undoComplete') : t('chores.complete')}
        aria-pressed={done}
        className={cn(
          'grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 transition-all active:scale-90 disabled:opacity-40',
          done ? 'border-brand-500 bg-brand-500 text-white' : 'border-line text-transparent hover:border-brand-400 hover:text-brand-400',
        )}
      >
        <Check className="h-4 w-4" strokeWidth={3} />
      </button>
      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-[15px] font-medium', done && 'text-muted line-through decoration-1')}>{chore?.title ?? '—'}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <CategoryTag category={chore?.category_id ? h.categoryById.get(chore.category_id) : null} />
          <span className="text-xs text-muted">{t('chores.due', { date: formatDate(assignment.due_date, h.intl, { weekday: 'short', day: 'numeric', month: 'short' }) })}</span>
          {swapped && <span className="text-xs text-subtle">{t('chores.swappedFrom', { name: h.nameOf(assignment.original_assignee_id) })}</span>}
        </div>
      </div>
      <span className="hidden sm:block">
        <Badge tone={STATUS_TONE[status]}>{t(`chores.status.${status}`)}</Badge>
      </span>
      {status === 'overdue' && (
        <span className="sm:hidden">
          <Badge tone="danger">{t('chores.status.overdue')}</Badge>
        </span>
      )}
      {member && <Avatar name={member.profile.display_name} color={member.profile.avatar_color} size="sm" />}
      <div className="relative">
        <button
          type="button"
          onClick={() => setMenu((v) => !v)}
          className="grid h-8 w-8 place-items-center rounded-lg text-subtle hover:bg-sunken hover:text-ink"
          aria-label={t('common.actions')}
          aria-expanded={menu}
          disabled={!h.canWrite}
        >
          <MoreVertical className="h-4 w-4" />
        </button>
        {menu && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} aria-hidden />
            <div className="absolute right-0 top-9 z-20 w-56 animate-pop rounded-xl border border-line bg-elevated p-1 shadow-float" role="menu">
              {assignment.status === 'pending' && (
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-sunken"
                  onClick={() => {
                    setMenu(false);
                    onSwap(assignment);
                  }}
                >
                  <ArrowLeftRight className="h-4 w-4" aria-hidden />
                  {t('chores.swap')}
                </button>
              )}
              {assignment.status !== 'done' && (
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-sunken"
                  onClick={() => {
                    setMenu(false);
                    void h.run((repo) => repo.setAssignmentSkipped(assignment.id, assignment.status !== 'skipped'));
                  }}
                >
                  <Undo2 className="h-4 w-4" aria-hidden />
                  {assignment.status === 'skipped' ? t('chores.unskip') : t('chores.skip')}
                </button>
              )}
              {assignment.status === 'done' && (
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-sunken"
                  onClick={() => {
                    setMenu(false);
                    void toggle();
                  }}
                >
                  <Undo2 className="h-4 w-4" aria-hidden />
                  {t('chores.undoComplete')}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </li>
  );
}
