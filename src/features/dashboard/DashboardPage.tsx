import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Activity, CalendarDays, CalendarPlus, Check, ListChecks, Plus, Receipt, ShoppingBasket, Wallet, Wrench } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ActivityFeed } from '@/components/shared/ActivityFeed';
import { MemberStack } from '@/components/shared/MemberChips';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { EmptyState, ProgressBar } from '@/components/ui/Feedback';
import { occurrencesInRange } from '@/domain/calendar';
import { addDays, formatDate, monthKey, startOfWeek, todayISO } from '@/domain/dates';
import { computeBalances } from '@/domain/money';
import { displayStatus } from '@/domain/rotation';
import { expensesInMonth } from '@/domain/stats';
import { useHousehold } from '@/hooks/useHousehold';
import { cn } from '@/lib/cn';
import { features } from '@/config/features';
import { STATUS_TONE } from '@/features/maintenance/tones';

function QuickAction({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  return (
    <Link to={to} className="flex flex-col items-start gap-3 rounded-2xl border border-line bg-surface p-4 text-sm font-medium shadow-card transition-colors hover:border-brand-300 hover:bg-brand-50/40 dark:hover:bg-brand-500/5">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">{icon}</span>
      {label}
    </Link>
  );
}

function ViewAll({ to }: { to: string }) {
  const { t } = useTranslation();
  return (
    <Link to={to} className="text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300">
      {t('common.viewAll')}
    </Link>
  );
}

export default function DashboardPage() {
  const { t } = useTranslation();
  const h = useHousehold();
  const today = todayISO();
  const week = startOfWeek(today);
  const choreById = useMemo(() => new Map(h.snap.chores.map((c) => [c.id, c])), [h.snap.chores]);

  const weekAssignments = h.snap.assignments.filter((a) => a.week_start === week && a.status !== 'skipped');
  const mine = weekAssignments.filter((a) => a.assignee_id === h.userId).sort((a, b) => a.due_date.localeCompare(b.due_date));
  const myDone = mine.filter((a) => a.status === 'done').length;
  const houseDone = weekAssignments.filter((a) => a.status === 'done').length;

  const monthExpenses = expensesInMonth(h.snap.expenses, monthKey(today));
  const monthTotal = monthExpenses.reduce((s, e) => s + e.amount, 0);
  const monthIds = new Set(monthExpenses.map((e) => e.id));
  const myMonthShare = h.snap.shares.filter((s) => s.user_id === h.userId && monthIds.has(s.expense_id)).reduce((s, x) => s + x.amount, 0);
  const balances = computeBalances(h.snap.members.map((m) => m.user_id), h.snap.expenses, h.snap.shares, h.snap.settlements);
  const myBalance = balances.get(h.userId) ?? 0;

  const upcoming = h.snap.events
    .flatMap((e) => occurrencesInRange(e, today, addDays(today, 14)).map((date) => ({ e, date })))
    .sort((a, b) => a.date.localeCompare(b.date) || a.e.starts_at.localeCompare(b.e.starts_at))
    .slice(0, 5);
  const pendingShopping = h.snap.shopping.filter((i) => i.status === 'pending');
  const myOverdue = mine.filter((a) => displayStatus(a, today) === 'overdue').length;
  const openIssues = h.snap.reports.filter((r) => r.status === 'open' || r.status === 'in_progress');

  const dayLabel = (d: string) => (d === today ? t('common.today') : d === addDays(today, 1) ? t('common.tomorrow') : formatDate(d, h.intl, { weekday: 'short', day: 'numeric', month: 'short' }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted first-letter:uppercase">{formatDate(today, h.intl, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-[28px]">{t('dashboard.greeting', { name: h.me?.profile.display_name.replace(/\s*\(.*\)$/, '') ?? '' })}</h1>
          <p className="mt-1 text-sm text-muted">{t('dashboard.summary', { apartment: h.snap.apartment.name })}</p>
        </div>
        <MemberStack members={h.orderedMembers} />
      </div>

      {/* headline numbers */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Link to="/chores" className="col-span-2 lg:col-span-1">
          <Card className="h-full p-4 transition-colors hover:border-brand-300">
            <div className="flex items-center gap-2 text-xs font-medium text-muted">
              <ListChecks className="h-4 w-4" aria-hidden />
              {t('dashboard.householdChores')}
            </div>
            <p className="tabular mt-2 text-2xl font-semibold tracking-tight">
              {houseDone}
              <span className="text-base font-normal text-subtle">/{weekAssignments.length}</span>
            </p>
            <ProgressBar className="mt-3" value={weekAssignments.length ? houseDone / weekAssignments.length : 0} />
          </Card>
        </Link>
        {!features.finances && (
          <>
            <Link to="/chores">
              <Card className="h-full p-4 transition-colors hover:border-brand-300">
                <div className="flex items-center gap-2 text-xs font-medium text-muted">
                  <ListChecks className="h-4 w-4" aria-hidden />
                  {t('dashboard.myPending')}
                </div>
                <p className="tabular mt-2 text-2xl font-semibold tracking-tight">{mine.filter((a) => a.status === 'pending').length}</p>
                <p className={cn('mt-1 text-xs', myOverdue > 0 ? 'font-medium text-rose-600 dark:text-rose-400' : 'text-subtle')}>{t('dashboard.overdueCount', { count: myOverdue })}</p>
              </Card>
            </Link>
            <Link to="/calendar">
              <Card className="h-full p-4 transition-colors hover:border-brand-300">
                <div className="flex items-center gap-2 text-xs font-medium text-muted">
                  <CalendarDays className="h-4 w-4" aria-hidden />
                  {t('dashboard.upcoming')}
                </div>
                <p className="tabular mt-2 text-2xl font-semibold tracking-tight">{upcoming.length}</p>
                <p className="mt-1 text-xs text-subtle">{t('dashboard.next14days')}</p>
              </Card>
            </Link>
          </>
        )}
        {features.finances && (
        <Link to="/finances">
          <Card className="h-full p-4 transition-colors hover:border-brand-300">
            <div className="flex items-center gap-2 text-xs font-medium text-muted">
              <Receipt className="h-4 w-4" aria-hidden />
              {t('dashboard.monthSpending')}
            </div>
            <p className="tabular mt-2 truncate text-xl font-semibold tracking-tight sm:text-2xl">{h.money(monthTotal)}</p>
            <p className="tabular mt-1 truncate text-xs text-subtle">{t('dashboard.myShare', { amount: h.money(myMonthShare) })}</p>
          </Card>
        </Link>
        )}
        {features.finances && (
        <Link to="/finances">
          <Card className="h-full p-4 transition-colors hover:border-brand-300">
            <div className="flex items-center gap-2 text-xs font-medium text-muted">
              <Wallet className="h-4 w-4" aria-hidden />
              {t('dashboard.myBalance')}
            </div>
            <p className={cn('tabular mt-2 truncate text-xl font-semibold tracking-tight sm:text-2xl', myBalance > 0 && 'text-emerald-600 dark:text-emerald-400', myBalance < 0 && 'text-rose-600 dark:text-rose-400')}>
              {h.money(Math.abs(myBalance))}
            </p>
            <p className="mt-1 text-xs text-subtle">{myBalance > 0 ? t('dashboard.owedToYou') : myBalance < 0 ? t('dashboard.youOwe') : t('dashboard.settled')}</p>
          </Card>
        </Link>        )}

        <Link to="/maintenance" className="col-span-2 lg:col-span-1">
          <Card className="h-full p-4 transition-colors hover:border-brand-300">
            <div className="flex items-center gap-2 text-xs font-medium text-muted">
              <Wrench className="h-4 w-4" aria-hidden />
              {t('dashboard.openIssues')}
            </div>
            <p className="tabular mt-2 text-2xl font-semibold tracking-tight">{openIssues.length}</p>
            {features.shopping ? (
              <p className="mt-1 text-xs text-subtle">
                <ShoppingBasket className="mr-1 inline h-3.5 w-3.5" aria-hidden />
                {t('dashboard.pendingCount', { count: pendingShopping.length })} · {t('nav.shopping')}
              </p>
            ) : (
              <p className="mt-1 text-xs text-subtle">
                {openIssues.filter((r) => r.status === 'in_progress').length} {t('maintenance.statuses.in_progress').toLowerCase()}
              </p>
            )}
          </Card>
        </Link>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={t('dashboard.myChores')} subtitle={t('dashboard.choresProgress', { done: myDone, total: mine.length })} icon={<ListChecks className="h-4.5 w-4.5" />} action={<ViewAll to="/chores" />} />
          <CardBody>
            {mine.length === 0 || myDone === mine.length ? (
              <EmptyState compact icon={<Check className="h-5 w-5" />} title={t('dashboard.allChoresDone')} />
            ) : (
              <ul className="space-y-2">
                {mine.map((a) => {
                  const status = displayStatus(a, today);
                  const done = a.status === 'done';
                  return (
                    <li key={a.id} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5">
                      <button
                        type="button"
                        aria-label={done ? t('chores.undoComplete') : t('chores.complete')}
                        aria-pressed={done}
                        disabled={!h.canWrite}
                        onClick={() => void h.run((repo) => (done ? repo.uncompleteAssignment(a.id) : repo.completeAssignment(h.snap.apartment.id, a.id, null)), { success: done ? undefined : t('chores.completed') })}
                        className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 transition-all active:scale-90', done ? 'border-brand-500 bg-brand-500 text-white' : 'border-line text-transparent hover:border-brand-400 hover:text-brand-400')}
                      >
                        <Check className="h-3.5 w-3.5" strokeWidth={3} />
                      </button>
                      <span className={cn('min-w-0 flex-1 truncate text-sm font-medium', done && 'text-muted line-through')}>{choreById.get(a.chore_id)?.title}</span>
                      <span className="text-xs text-muted">{dayLabel(a.due_date)}</span>
                      {status === 'overdue' && <Badge tone="danger">{t('chores.status.overdue')}</Badge>}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t('dashboard.quickActions')} />
          <CardBody className="grid grid-cols-2 gap-3">
            {features.finances ? (
              <QuickAction to="/finances?new=1" icon={<Receipt className="h-4.5 w-4.5" />} label={t('dashboard.addExpense')} />
            ) : (
              <QuickAction to="/chores?new=1" icon={<ListChecks className="h-4.5 w-4.5" />} label={t('chores.newChore')} />
            )}
            {features.shopping ? (
              <QuickAction to="/shopping" icon={<Plus className="h-4.5 w-4.5" />} label={t('dashboard.addItem')} />
            ) : (
              <QuickAction to="/stats" icon={<Activity className="h-4.5 w-4.5" />} label={t('nav.stats')} />
            )}
            <QuickAction to="/calendar" icon={<CalendarPlus className="h-4.5 w-4.5" />} label={t('dashboard.addEvent')} />
            <QuickAction to="/maintenance" icon={<Wrench className="h-4.5 w-4.5" />} label={t('dashboard.reportIssue')} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t('dashboard.upcoming')} icon={<CalendarDays className="h-4.5 w-4.5" />} action={<ViewAll to="/calendar" />} />
          <CardBody>
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted">{t('dashboard.noUpcoming')}</p>
            ) : (
              <ul className="space-y-3">
                {upcoming.map(({ e, date }) => (
                  <li key={`${e.id}@${date}`} className="flex items-center gap-3">
                    <span className="grid w-11 shrink-0 place-items-center rounded-xl bg-sunken py-1">
                      <span className="text-[10px] font-semibold uppercase text-subtle">{formatDate(date, h.intl, { month: 'short' })}</span>
                      <span className="tabular text-base font-semibold leading-none">{Number(date.slice(8))}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{e.title}</span>
                      <span className="text-xs text-muted">
                        {dayLabel(date)} · {t(`calendar.kinds.${e.kind}`)}
                        {features.finances && e.amount ? ` · ${h.money(e.amount)}` : ''}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        {features.shopping && (
        <Card>
          <CardHeader title={t('dashboard.shoppingPending')} icon={<ShoppingBasket className="h-4.5 w-4.5" />} action={<ViewAll to="/shopping" />} />
          <CardBody>
            {pendingShopping.length === 0 ? (
              <p className="text-sm text-muted">{t('shopping.empty')}</p>
            ) : (
              <ul className="space-y-2">
                {pendingShopping.slice(0, 6).map((i) => {
                  const m = i.assigned_to ? h.memberById.get(i.assigned_to) : undefined;
                  return (
                    <li key={i.id} className="flex items-center gap-2 text-sm">
                      <span className="h-1.5 w-1.5 rounded-full bg-brand-500" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{i.name}</span>
                      {m && <Avatar name={m.profile.display_name} color={m.profile.avatar_color} size="xs" />}
                    </li>
                  );
                })}
                {pendingShopping.length > 6 && <li className="text-xs text-subtle">+{pendingShopping.length - 6}</li>}
              </ul>
            )}
          </CardBody>
        </Card>
        )}

        <Card>
          <CardHeader title={t('dashboard.openIssues')} icon={<Wrench className="h-4.5 w-4.5" />} action={<ViewAll to="/maintenance" />} />
          <CardBody>
            {openIssues.length === 0 ? (
              <p className="text-sm text-muted">{t('maintenance.empty')}</p>
            ) : (
              <ul className="space-y-2.5">
                {openIssues.slice(0, 4).map((r) => (
                  <li key={r.id} className="flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{r.title}</span>
                    <Badge tone={STATUS_TONE[r.status]}>{t(`maintenance.statuses.${r.status}`)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader title={t('dashboard.recentActivity')} icon={<Activity className="h-4.5 w-4.5" />} action={<ViewAll to="/stats" />} />
          <CardBody>
            <ActivityFeed h={h} items={h.snap.activity} limit={8} />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
