import { useMemo, useState } from 'react';
import { Bell, CalendarDays, ChevronLeft, ChevronRight, CircleCheck, Lock, Pencil, Plus, Repeat, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/layout/PageHeader';
import { Avatar } from '@/components/ui/Avatar';
import { Badge, type Tone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/Feedback';
import { Toggle } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Segmented';
import { addDays, addMonths, formatDate, monthGrid, startOfMonth, startOfWeek, todayISO, weekDays } from '@/domain/dates';
import type { CalendarEvent, EventKind } from '@/domain/types';
import { useHousehold } from '@/hooks/useHousehold';
import { cn } from '@/lib/cn';
import { features } from '@/config/features';
import { itemsByDay, type CalendarItem } from './calendarItems';
import { EventFormSheet } from './EventFormSheet';

const KIND_TONE: Record<EventKind | 'chore', Tone> = { event: 'brand', payment: 'violet', reminder: 'info', maintenance: 'warning', chore: 'neutral' };
const KIND_DOT: Record<EventKind | 'chore', string> = { event: 'bg-teal-500', payment: 'bg-violet-500', reminder: 'bg-sky-500', maintenance: 'bg-amber-500', chore: 'bg-slate-400' };

export default function CalendarPage() {
  const { t } = useTranslation();
  const h = useHousehold();
  const confirm = useConfirm();
  const today = todayISO();
  const [view, setView] = useState<'month' | 'week'>('month');
  const [cursor, setCursor] = useState(today);
  const [selected, setSelected] = useState(today);
  const [showChores, setShowChores] = useState(true);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [notifState, setNotifState] = useState(() => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission));

  const days = view === 'month' ? monthGrid(cursor) : weekDays(startOfWeek(cursor));
  const from = days[0]!;
  const to = days[days.length - 1]!;
  const choreMap = useMemo(() => new Map(h.snap.chores.map((c) => [c.id, c])), [h.snap.chores]);
  const byDay = useMemo(
    () => itemsByDay({ from, to, events: h.snap.events, assignments: h.snap.assignments, chores: choreMap, includeChores: showChores }),
    [from, to, h.snap.events, h.snap.assignments, choreMap, showChores],
  );

  const move = (delta: number) => {
    const next = view === 'month' ? addMonths(startOfMonth(cursor), delta) : addDays(cursor, delta * 7);
    setCursor(next);
    setSelected(view === 'month' ? (startOfMonth(next) === startOfMonth(today) ? today : startOfMonth(next)) : startOfWeek(next));
  };

  const title =
    view === 'month'
      ? new Intl.DateTimeFormat(h.intl, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${startOfMonth(cursor)}T00:00:00Z`))
      : `${formatDate(from, h.intl)} – ${formatDate(to, h.intl, { day: 'numeric', month: 'short', year: 'numeric' })}`;

  const timeLabel = (e: CalendarEvent) =>
    e.all_day
      ? t('calendar.allDay')
      : new Intl.DateTimeFormat(h.intl, { hour: 'numeric', minute: '2-digit' }).format(new Date(e.starts_at)) +
        (e.ends_at ? ` – ${new Intl.DateTimeFormat(h.intl, { hour: 'numeric', minute: '2-digit' }).format(new Date(e.ends_at))}` : '');

  const kindOf = (item: CalendarItem): EventKind | 'chore' => (item.type === 'event' ? item.event.kind : 'chore');
  const labelOf = (item: CalendarItem) => (item.type === 'event' ? item.event.title : (item.chore?.title ?? '—'));

  const removeEvent = async (e: CalendarEvent) => {
    if (await confirm({ title: t('common.delete'), message: t('calendar.deleteConfirm'), danger: true, confirmLabel: t('common.delete') })) {
      await h.run((repo) => repo.deleteEvent(e.id));
    }
  };

  const ItemRow = ({ item }: { item: CalendarItem }) => {
    if (item.type === 'chore') {
      const m = h.memberById.get(item.assignment.assignee_id);
      return (
        <li className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5">
          <CircleCheck className={cn('h-4 w-4 shrink-0', item.assignment.status === 'done' ? 'text-brand-500' : 'text-subtle')} aria-hidden />
          <span className={cn('min-w-0 flex-1 truncate text-sm', item.assignment.status === 'done' && 'text-muted line-through')}>{labelOf(item)}</span>
          <Badge tone="neutral">{t('calendar.kinds.chore')}</Badge>
          {m && <Avatar name={m.profile.display_name} color={m.profile.avatar_color} size="xs" />}
        </li>
      );
    }
    const e = item.event;
    return (
      <li className="group flex items-start gap-3 rounded-xl border border-line px-3 py-2.5">
        <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', KIND_DOT[e.kind])} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <span className="truncate">{e.title}</span>
            {e.visibility === 'private' && <Lock className="h-3.5 w-3.5 shrink-0 text-subtle" aria-label={t('calendar.private')} />}
            {e.recurrence !== 'none' && <Repeat className="h-3.5 w-3.5 shrink-0 text-subtle" aria-label={t(`calendar.recurrences.${e.recurrence}`)} />}
            {e.remind_minutes_before !== null && <Bell className="h-3.5 w-3.5 shrink-0 text-subtle" aria-label={t('calendar.remind')} />}
          </p>
          <p className="text-xs text-muted">
            {timeLabel(e)}
            {features.finances && e.amount ? ` · ${h.money(e.amount)}` : ''} · {h.nameOf(e.created_by)}
          </p>
          {e.description && <p className="mt-1 text-xs text-muted">{e.description}</p>}
        </div>
        <Badge tone={KIND_TONE[e.kind]}>{t(`calendar.kinds.${e.kind}`)}</Badge>
        <div className="flex gap-0.5">
          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={!h.canWrite} onClick={() => { setEditing(e); setFormOpen(true); }} aria-label={t('common.edit')}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-rose-600" disabled={!h.canWrite} onClick={() => void removeEvent(e)} aria-label={t('common.delete')}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </li>
    );
  };

  const selectedItems = byDay.get(selected) ?? [];
  const weekdayNames = weekDays('2026-11-23').map((d) => formatDate(d, h.intl, { weekday: 'short' }));

  return (
    <>
      <PageHeader
        title={t('calendar.title')}
        subtitle={t('calendar.subtitle')}
        actions={
          <Button icon={<Plus className="h-4 w-4" />} disabled={!h.canWrite} onClick={() => { setEditing(null); setFormOpen(true); }}>
            {t('calendar.newEvent')}
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => move(-1)} aria-label={t('calendar.previous')}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h2 className="min-w-44 text-center text-[15px] font-semibold first-letter:uppercase">{title}</h2>
          <Button variant="ghost" size="icon" onClick={() => move(1)} aria-label={t('calendar.next')}>
            <ChevronRight className="h-5 w-5" />
          </Button>
          <Button variant="secondary" size="sm" className="ml-1" onClick={() => { setCursor(today); setSelected(today); }}>
            {t('calendar.goToday')}
          </Button>
        </div>
        <Segmented
          label={t('calendar.title')}
          value={view}
          onChange={setView}
          options={[
            { value: 'month', label: t('calendar.month') },
            { value: 'week', label: t('calendar.week') },
          ]}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        {view === 'month' ? (
          <Card className="overflow-hidden">
            <div className="grid grid-cols-7 border-b border-line bg-sunken/50">
              {weekdayNames.map((w) => (
                <div key={w} className="py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-subtle">
                  {w}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((d) => {
                const items = byDay.get(d) ?? [];
                const inMonth = d.slice(0, 7) === startOfMonth(cursor).slice(0, 7);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setSelected(d)}
                    aria-pressed={d === selected}
                    aria-label={`${formatDate(d, h.intl, { weekday: 'long', day: 'numeric', month: 'long' })}${items.length ? ` · ${items.length}` : ''}`}
                    className={cn(
                      'flex min-h-16 flex-col items-stretch gap-1 border-b border-r border-line p-1.5 text-left transition-colors sm:min-h-24 [&:nth-child(7n)]:border-r-0',
                      !inMonth && 'bg-sunken/40 text-subtle',
                      d === selected ? 'bg-brand-50/80 dark:bg-brand-500/10' : 'hover:bg-sunken/60',
                    )}
                  >
                    <span className={cn('tabular grid h-6 w-6 place-items-center self-start rounded-full text-xs font-medium', d === today && 'bg-brand-600 text-white dark:bg-brand-500 dark:text-brand-950')}>
                      {Number(d.slice(8))}
                    </span>
                    <span className="hidden flex-col gap-0.5 sm:flex">
                      {items.slice(0, 2).map((it) => (
                        <span key={it.key} className="flex items-center gap-1 truncate text-[11px] text-muted">
                          <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', KIND_DOT[kindOf(it)])} />
                          <span className="truncate">{labelOf(it)}</span>
                        </span>
                      ))}
                      {items.length > 2 && <span className="text-[10px] text-subtle">+{items.length - 2}</span>}
                    </span>
                    <span className="flex flex-wrap gap-0.5 sm:hidden">
                      {items.slice(0, 4).map((it) => (
                        <span key={it.key} className={cn('h-1.5 w-1.5 rounded-full', KIND_DOT[kindOf(it)])} />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {days.map((d) => {
              const items = byDay.get(d) ?? [];
              return (
                <Card key={d} className={cn('p-4', d === today && 'ring-2 ring-brand-500/40')}>
                  <button type="button" className="mb-2 flex w-full items-baseline gap-2 text-left" onClick={() => setSelected(d)}>
                    <span className="text-sm font-semibold first-letter:uppercase">{formatDate(d, h.intl, { weekday: 'long' })}</span>
                    <span className="text-xs text-muted">{formatDate(d, h.intl)}</span>
                  </button>
                  {items.length === 0 ? (
                    <p className="text-xs text-subtle">{t('calendar.noEvents')}</p>
                  ) : (
                    <ul className="space-y-2">
                      {items.map((it) => (
                        <ItemRow key={it.key} item={it} />
                      ))}
                    </ul>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        <div className="space-y-5">
          {view === 'month' && (
            <Card>
              <CardHeader title={formatDate(selected, h.intl, { weekday: 'long', day: 'numeric', month: 'long' })} />
              <CardBody>
                {selectedItems.length === 0 ? (
                  <EmptyState
                    compact
                    icon={<CalendarDays className="h-5 w-5" />}
                    title={t('calendar.noEvents')}
                    action={
                      <Button size="sm" variant="soft" icon={<Plus className="h-4 w-4" />} disabled={!h.canWrite} onClick={() => { setEditing(null); setFormOpen(true); }}>
                        {t('calendar.newEvent')}
                      </Button>
                    }
                  />
                ) : (
                  <ul className="space-y-2">
                    {selectedItems.map((it) => (
                      <ItemRow key={it.key} item={it} />
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          )}
          <Card>
            <CardHeader title={t('calendar.remindersTitle')} icon={<Bell className="h-4.5 w-4.5" />} />
            <CardBody className="space-y-4">
              <Toggle checked={showChores} onChange={setShowChores} label={t('calendar.showChores')} />
              {notifState === 'granted' ? (
                <p className="text-xs text-muted">{t('calendar.notificationsOn')}</p>
              ) : notifState === 'denied' ? (
                <p className="text-xs text-muted">{t('calendar.notificationsDenied')}</p>
              ) : notifState !== 'unsupported' ? (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Bell className="h-4 w-4" />}
                  onClick={async () => setNotifState(await Notification.requestPermission())}
                >
                  {t('calendar.enableNotifications')}
                </Button>
              ) : null}
              <div className="flex flex-wrap gap-3 border-t border-line pt-4 text-xs text-muted">
                {(['event', 'payment', 'reminder', 'maintenance', 'chore'] as const).filter((k) => features.finances || k !== 'payment').map((k) => (
                  <span key={k} className="inline-flex items-center gap-1.5">
                    <span className={cn('h-2 w-2 rounded-full', KIND_DOT[k])} aria-hidden />
                    {t(`calendar.kinds.${k}`)}
                  </span>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>
      </div>

      <EventFormSheet h={h} open={formOpen} onClose={() => setFormOpen(false)} event={editing} defaultDate={selected} />
    </>
  );
}
