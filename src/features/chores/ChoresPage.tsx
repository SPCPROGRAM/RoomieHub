import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { AlertTriangle, ChevronLeft, ChevronRight, ListChecks, Pause, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/layout/PageHeader';
import { CategoryTag } from '@/components/shared/CategoryTag';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { Alert, EmptyState, ProgressBar } from '@/components/ui/Feedback';
import { Segmented } from '@/components/ui/Segmented';
import { addDays, formatDate, formatDateTime, startOfWeek, todayISO } from '@/domain/dates';
import { assigneeFor, cycleIndex, detectRepetitions, occurrenceWeekdays, workloadByMember } from '@/domain/rotation';
import { archiveChore } from './choreActions';
import type { Chore, ChoreAssignment } from '@/domain/types';
import { useHousehold } from '@/hooks/useHousehold';
import { AssignmentRow } from './AssignmentRow';
import { ChoreFormSheet } from './ChoreFormSheet';
import { RotationPanel } from './RotationPanel';
import { SwapSheet } from './SwapSheet';

type Tab = 'week' | 'catalog' | 'rotation' | 'history';

export default function ChoresPage() {
  const { t } = useTranslation();
  const h = useHousehold();
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>('week');
  const [scope, setScope] = useState<'mine' | 'all'>('all');
  const [week, setWeek] = useState(() => startOfWeek(todayISO()));
  const [editing, setEditing] = useState<Chore | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [swapSource, setSwapSource] = useState<ChoreAssignment | null>(null);

  // /chores?new=1 (dashboard quick action, PWA shortcut) opens the "new chore" form
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    if (params.get('new') === '1') {
      setEditing(null);
      setFormOpen(true);
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  const choreById = useMemo(() => new Map(h.snap.chores.map((c) => [c.id, c])), [h.snap.chores]);
  const liveChores = h.snap.chores.filter((c) => c.archived_at === null);
  const weekRows = useMemo(
    () =>
      h.snap.assignments
        .filter((a) => a.week_start === week && (scope === 'all' || a.assignee_id === h.userId))
        .sort((a, b) => a.due_date.localeCompare(b.due_date) || (choreById.get(a.chore_id)?.title ?? '').localeCompare(choreById.get(b.chore_id)?.title ?? '')),
    [h.snap.assignments, week, scope, h.userId, choreById],
  );
  const allWeekRows = h.snap.assignments.filter((a) => a.week_start === week);
  const workload = workloadByMember(allWeekRows, h.snap.chores, h.activeMembers.map((m) => m.user_id));
  const maxEffort = Math.max(1, ...[...workload.values()].map((w) => w.effort));
  const repetitions = detectRepetitions(h.snap.assignments, h.snap.rotation.repetition_threshold).filter((r) => {
    const c = choreById.get(r.choreId);
    // a fixed-person chore repeats on purpose
    return c?.archived_at === null && c.rotation_mode !== 'fixed';
  });
  const currentWeek = startOfWeek(todayISO());
  const doneCount = allWeekRows.filter((a) => a.status === 'done').length;

  const openForm = (chore: Chore | null) => {
    setEditing(chore);
    setFormOpen(true);
  };

  const archive = async (chore: Chore) => {
    if (!(await confirm({ title: t('chores.archive'), message: t('chores.archiveConfirm'), danger: true, confirmLabel: t('common.delete') }))) return;
    // pending turns from this week on disappear; past and completed turns stay as history
    await h.run((repo) => archiveChore(repo, h, chore), { success: t('chores.archived') });
  };

  const nextAssignee = (chore: Chore) => {
    if (chore.rotation_mode === 'fixed') return chore.fixed_assignee_id;
    if (chore.rotation_mode === 'per_occurrence') return null; // changes every time: the badge explains it
    const order = h.orderedMembers.map((m) => m.user_id);
    for (let w = 1; w <= 8; w++) {
      const wk = addDays(currentWeek, w * 7);
      const cycle = cycleIndex(chore, wk, h.snap.rotation.anchor_week);
      if (cycle !== null) return assigneeFor(order, chore.rotation_offset, cycle);
    }
    return null;
  };

  const history = h.snap.completions
    .slice()
    .sort((a, b) => b.completed_at.localeCompare(a.completed_at))
    .slice(0, 100);
  const assignmentById = new Map(h.snap.assignments.map((a) => [a.id, a]));

  return (
    <>
      <PageHeader
        title={t('chores.title')}
        subtitle={t('chores.subtitle')}
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => openForm(null)} disabled={!h.canWrite}>
            {t('chores.newChore')}
          </Button>
        }
      />

      {repetitions.length > 0 && (
        <div className="mb-5 space-y-2">
          {repetitions.map((r) => (
            <Alert key={r.choreId} tone="warning" icon={<AlertTriangle className="h-4 w-4" />}>
              {t('chores.repetitionWarning', { name: h.fullNameOf(r.userId), count: r.streak, chore: choreById.get(r.choreId)?.title ?? '' })}
            </Alert>
          ))}
        </div>
      )}

      <Segmented
        label={t('chores.title')}
        value={tab}
        onChange={setTab}
        className="mb-5"
        options={[
          { value: 'week', label: t('chores.thisWeek') },
          { value: 'catalog', label: t('chores.catalog'), count: liveChores.length },
          { value: 'rotation', label: t('chores.rotation') },
          { value: 'history', label: t('chores.history') },
        ]}
      />

      {tab === 'week' && (
        <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
          <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={() => setWeek(addDays(week, -7))} aria-label={t('chores.previousWeek')}>
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <div className="min-w-40 text-center">
                  <p className="text-sm font-semibold">{week === currentWeek ? t('chores.thisWeek') : t('chores.week', { date: formatDate(week, h.intl) })}</p>
                  <p className="text-xs text-muted">
                    {formatDate(week, h.intl)} – {formatDate(addDays(week, 6), h.intl)}
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setWeek(addDays(week, 7))} aria-label={t('chores.nextWeek')}>
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </div>
              <Segmented
                label={t('chores.thisWeek')}
                value={scope}
                onChange={setScope}
                options={[
                  { value: 'all', label: t('chores.everyone') },
                  { value: 'mine', label: t('chores.mine') },
                ]}
              />
            </div>
            {weekRows.length === 0 ? (
              <Card>
                {liveChores.length === 0 ? (
                  <EmptyState
                    icon={<ListChecks className="h-6 w-6" />}
                    title={t('chores.empty')}
                    hint={t('chores.emptyHint')}
                    action={
                      <Button icon={<Plus className="h-4 w-4" />} onClick={() => openForm(null)} disabled={!h.canWrite}>
                        {t('chores.newChore')}
                      </Button>
                    }
                  />
                ) : (
                  <EmptyState
                    icon={<ListChecks className="h-6 w-6" />}
                    title={t('chores.emptyWeek')}
                    action={
                      week >= currentWeek ? (
                        <Button variant="soft" onClick={() => setTab('rotation')}>
                          {t('chores.generateWeek')}
                        </Button>
                      ) : undefined
                    }
                  />
                )}
              </Card>
            ) : (
              <ul className="space-y-2">
                {weekRows.map((a) => (
                  <AssignmentRow key={a.id} h={h} assignment={a} chore={choreById.get(a.chore_id)} onSwap={setSwapSource} onEdit={(c) => openForm(c)} />
                ))}
              </ul>
            )}
          </div>
          <Card className="h-fit">
            <CardHeader title={t('chores.workload')} subtitle={t('dashboard.choresProgress', { done: doneCount, total: allWeekRows.filter((a) => a.status !== 'skipped').length })} />
            <CardBody className="space-y-4">
              {h.orderedMembers.map((m) => {
                const w = workload.get(m.user_id) ?? { assigned: 0, done: 0, effort: 0 };
                return (
                  <div key={m.user_id}>
                    <div className="mb-1.5 flex items-center gap-2 text-sm">
                      <Avatar name={m.profile.display_name} color={m.profile.avatar_color} size="xs" />
                      <span className="min-w-0 flex-1 truncate font-medium">{h.nameOf(m.user_id)}</span>
                      <span className="tabular text-xs text-muted">
                        {w.done}/{w.assigned} · {t('chores.points', { count: w.effort })}
                      </span>
                    </div>
                    <ProgressBar value={w.effort / maxEffort} />
                  </div>
                );
              })}
            </CardBody>
          </Card>
        </div>
      )}

      {tab === 'catalog' &&
        (liveChores.length === 0 ? (
          <Card>
            <EmptyState icon={<ListChecks className="h-6 w-6" />} title={t('chores.empty')} hint={t('chores.emptyHint')} />
          </Card>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {liveChores.map((c) => {
              const next = nextAssignee(c);
              return (
                <li key={c.id}>
                  <Card className="flex h-full flex-col p-4">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{c.title}</p>
                        {c.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{c.description}</p>}
                      </div>
                      {!c.active && <Badge tone="warning">{t('chores.inactive')}</Badge>}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Badge tone="brand">{t(`chores.freq.${c.frequency}`)}</Badge>
                      {c.frequency === 'custom_days' && <Badge>{occurrenceWeekdays(c).map((d) => t(`chores.weekdayShort.${d}`)).join(' · ')}</Badge>}
                      {(c.frequency === 'weekly' || c.frequency === 'biweekly' || c.frequency === 'monthly') && <Badge>{t(`chores.weekdays.${c.due_weekday}`)}</Badge>}
                      <Badge tone="violet">{c.rotation_mode === 'fixed' ? h.fullNameOf(c.fixed_assignee_id) : t(`chores.modes.${c.rotation_mode ?? 'weekly'}.title`)}</Badge>
                      <Badge>{t('chores.points', { count: c.effort })}</Badge>
                      <CategoryTag category={c.category_id ? h.categoryById.get(c.category_id) : null} />
                    </div>
                    <div className="mt-auto flex items-center justify-between gap-2 pt-4">
                      <span className="text-xs text-muted">{c.active && next ? t('chores.nextFor', { name: h.fullNameOf(next) }) : ''}</span>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!h.canWrite} onClick={() => void h.run((repo) => repo.updateChore(c.id, { active: !c.active }))} aria-label={c.active ? t('chores.pause') : t('chores.resume')} title={c.active ? t('chores.pause') : t('chores.resume')}>
                          {c.active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!h.canWrite} onClick={() => openForm(c)} aria-label={t('common.edit')}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-rose-600" disabled={!h.canWrite} onClick={() => void archive(c)} aria-label={t('common.delete')}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        ))}

      {tab === 'rotation' && <RotationPanel h={h} viewedWeek={week} />}

      {tab === 'history' && (
        <Card>
          <CardBody>
            {history.length === 0 ? (
              <EmptyState compact icon={<ListChecks className="h-5 w-5" />} title={t('chores.noHistory')} />
            ) : (
              <ul className="divide-y divide-line">
                {history.map((c) => {
                  const a = assignmentById.get(c.assignment_id);
                  const chore = a ? choreById.get(a.chore_id) : undefined;
                  const m = h.memberById.get(c.completed_by);
                  const late = a ? c.completed_at.slice(0, 10) > a.due_date : false;
                  return (
                    <li key={c.id} className="flex items-center gap-3 py-3">
                      {m && <Avatar name={m.profile.display_name} color={m.profile.avatar_color} size="sm" />}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{chore?.title ?? '—'}</p>
                        <p className="text-xs text-muted">
                          {t('chores.completedBy', { name: h.fullNameOf(c.completed_by) })} · {formatDateTime(c.completed_at, h.intl, { dateStyle: 'medium', timeStyle: 'short' })}
                        </p>
                      </div>
                      {late && <Badge tone="warning">{t('chores.status.overdue')}</Badge>}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      )}

      <ChoreFormSheet h={h} open={formOpen} onClose={() => setFormOpen(false)} chore={editing} />
      <SwapSheet h={h} source={swapSource} onClose={() => setSwapSource(null)} />
    </>
  );
}
