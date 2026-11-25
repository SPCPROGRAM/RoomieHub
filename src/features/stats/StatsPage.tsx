import { useMemo } from 'react';
import { BarChart3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BarList, ColumnChart, PairedBars } from '@/components/charts/Charts';
import { PageHeader } from '@/components/layout/PageHeader';
import { ActivityFeed } from '@/components/shared/ActivityFeed';
import { Avatar } from '@/components/ui/Avatar';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { EmptyState, ProgressBar } from '@/components/ui/Feedback';
import { addDays, addMonths, startOfMonth, startOfWeek, todayISO } from '@/domain/dates';
import { choreCompliance, participationByMember, spendingByCategory, spendingByMonth } from '@/domain/stats';
import { useHousehold } from '@/hooks/useHousehold';
import { paletteOf } from '@/lib/palette';
import { cn } from '@/lib/cn';
import { features } from '@/config/features';

export default function StatsPage() {
  const { t } = useTranslation();
  const h = useHousehold();
  const today = todayISO();
  const sixMonthsFrom = addMonths(startOfMonth(today), -5);
  const recentExpenses = useMemo(() => h.snap.expenses.filter((e) => e.spent_on >= sixMonthsFrom), [h.snap.expenses, sixMonthsFrom]);
  const monthly = spendingByMonth(h.snap.expenses, today, 6);
  const byCategory = spendingByCategory(recentExpenses);
  const memberIds = h.snap.members.map((m) => m.user_id);
  const participation = participationByMember(memberIds, recentExpenses, h.snap.shares);
  const eightWeeksAgo = addDays(startOfWeek(today), -7 * 7);
  const recentAssignments = h.snap.assignments.filter((a) => a.week_start >= eightWeeksAgo);
  const compliance = choreCompliance(recentAssignments, today);
  const total6 = monthly.reduce((s, m) => s + m.total, 0);
  const monthsWithData = monthly.filter((m) => m.total > 0).length;

  const hasFinance = features.finances && recentExpenses.length > 0;
  const hasChores = recentAssignments.length > 0;
  const shortMonth = (m: string) => new Intl.DateTimeFormat(h.intl, { month: 'short', timeZone: 'UTC' }).format(new Date(`${m}-01T00:00:00Z`));

  const perMemberChores = h.snap.members
    .filter((m) => m.left_at === null || recentAssignments.some((a) => a.assignee_id === m.user_id))
    .map((m) => ({ member: m, c: choreCompliance(recentAssignments.filter((a) => a.assignee_id === m.user_id), today) }));

  return (
    <>
      <PageHeader title={t('stats.title')} subtitle={t('stats.subtitle')} />
      {!hasFinance && !hasChores ? (
        <Card>
          <EmptyState icon={<BarChart3 className="h-6 w-6" />} title={t('stats.noData')} />
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {hasFinance && (
            <>
              <Card className="lg:col-span-2">
                <CardHeader
                  title={t('stats.spendingByMonth')}
                  action={
                    <div className="flex gap-6 text-right">
                      <div>
                        <p className="text-xs text-muted">{t('stats.total6m')}</p>
                        <p className="tabular font-semibold">{h.money(total6)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted">{t('stats.avgMonth')}</p>
                        <p className="tabular font-semibold">{h.money(monthsWithData ? Math.round(total6 / monthsWithData) : 0)}</p>
                      </div>
                    </div>
                  }
                />
                <CardBody>
                  <ColumnChart caption={t('stats.spendingByMonth')} data={monthly.map((m) => ({ key: m.month, label: shortMonth(m.month), value: m.total }))} format={h.money} />
                </CardBody>
              </Card>
              <Card>
                <CardHeader title={t('stats.spendingByCategory')} />
                <CardBody>
                  <BarList
                    caption={t('stats.spendingByCategory')}
                    data={byCategory.map((c) => ({ key: c.categoryId ?? 'none', label: c.categoryId ? (h.categoryById.get(c.categoryId)?.name ?? '—') : t('common.noCategory'), value: c.total }))}
                    format={h.money}
                    marker={(key) => <span className={cn('h-2 w-2 shrink-0 rounded-full', paletteOf(h.categoryById.get(key)?.color).dot)} aria-hidden />}
                  />
                </CardBody>
              </Card>
              <Card>
                <CardHeader title={t('stats.participation')} />
                <CardBody>
                  <PairedBars
                    caption={t('stats.participation')}
                    seriesA={t('stats.paid')}
                    seriesB={t('stats.share')}
                    format={h.money}
                    groups={[...participation].filter(([, v]) => v.paid || v.share).map(([id, v]) => ({ key: id, label: h.fullNameOf(id), a: v.paid, b: v.share }))}
                  />
                </CardBody>
              </Card>
            </>
          )}
          {hasChores && (
            <Card>
              <CardHeader title={t('stats.choresDone')} subtitle={t('stats.complianceDetail', { done: compliance.done, due: compliance.due, onTime: compliance.onTime })} />
              <CardBody>
                <div className="mb-5 flex items-end gap-3">
                  <span className="tabular text-4xl font-semibold tracking-tight">{Math.round(compliance.rate * 100)}%</span>
                  <span className="pb-1.5 text-sm text-muted">{t('stats.compliance')}</span>
                </div>
                <ul className="space-y-4">
                  {perMemberChores.map(({ member, c }) => (
                    <li key={member.user_id}>
                      <div className="mb-1.5 flex items-center gap-2 text-sm">
                        <Avatar name={member.profile.display_name} color={member.profile.avatar_color} size="xs" />
                        <span className="min-w-0 flex-1 truncate font-medium">{h.fullNameOf(member.user_id)}</span>
                        <span className="tabular text-xs text-muted">
                          {c.done}/{c.due} · {Math.round(c.rate * 100)}%
                        </span>
                      </div>
                      <ProgressBar value={c.rate} />
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
          <Card className={cn(!hasChores && 'lg:col-span-2')}>
            <CardHeader title={t('stats.activity')} />
            <CardBody className="max-h-[480px] overflow-y-auto">
              <ActivityFeed h={h} items={h.snap.activity} limit={60} />
            </CardBody>
          </Card>
        </div>
      )}
    </>
  );
}
