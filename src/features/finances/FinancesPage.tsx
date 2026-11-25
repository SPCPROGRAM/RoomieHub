import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ArrowRight, HandCoins, Pencil, Plus, Receipt, Trash2, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/layout/PageHeader';
import { CategoryTag } from '@/components/shared/CategoryTag';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/Feedback';
import { Select } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Segmented';
import { formatDate, monthKey, todayISO } from '@/domain/dates';
import { computeBalances, suggestSettlements, type Transfer } from '@/domain/money';
import { expensesInMonth } from '@/domain/stats';
import type { Expense } from '@/domain/types';
import { useHousehold } from '@/hooks/useHousehold';
import { cn } from '@/lib/cn';
import { ExpenseFormSheet, type ExpenseDraft } from './ExpenseFormSheet';
import { SettlementFormSheet } from './SettlementFormSheet';

type Tab = 'expenses' | 'balances' | 'settlements';

function monthLabel(month: string, intl: string) {
  return new Intl.DateTimeFormat(intl, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));
}

export default function FinancesPage() {
  const { t } = useTranslation();
  const h = useHousehold();
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>('expenses');
  const [month, setMonth] = useState(() => monthKey(todayISO()));
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [draft, setDraft] = useState<ExpenseDraft | undefined>();
  const [settleOpen, setSettleOpen] = useState(false);
  const [suggestion, setSuggestion] = useState<Transfer | null>(null);

  // deep links: /finances?new=1 (PWA shortcut) and ?report=<id>&amount=… from repairs
  useEffect(() => {
    if (params.get('new') === '1' || params.get('report')) {
      const report = params.get('report');
      setDraft(report ? { maintenanceReportId: report, description: h.snap.reports.find((r) => r.id === report)?.title, categoryId: h.categoriesOf('expense').find((c) => /repar|repair/i.test(c.name))?.id } : undefined);
      setEditing(null);
      setExpenseOpen(true);
      setParams({}, { replace: true });
    }
  }, [params, setParams, h.snap.reports, h]);

  const balances = useMemo(
    () => computeBalances(h.snap.members.map((m) => m.user_id), h.snap.expenses, h.snap.shares, h.snap.settlements),
    [h.snap.members, h.snap.expenses, h.snap.shares, h.snap.settlements],
  );
  const transfers = useMemo(() => suggestSettlements(balances), [balances]);
  const months = useMemo(() => {
    const set = new Set(h.snap.expenses.map((e) => monthKey(e.spent_on)));
    set.add(monthKey(todayISO()));
    return [...set].sort().reverse();
  }, [h.snap.expenses]);
  const shown = month === 'all' ? h.snap.expenses : expensesInMonth(h.snap.expenses, month);
  const shownIds = new Set(shown.map((e) => e.id));
  const monthTotal = shown.reduce((s, e) => s + e.amount, 0);
  const myShare = h.snap.shares.filter((s) => s.user_id === h.userId && shownIds.has(s.expense_id)).reduce((s, x) => s + x.amount, 0);
  const myPaid = shown.filter((e) => e.paid_by === h.userId).reduce((s, e) => s + e.amount, 0);
  const myBalance = balances.get(h.userId) ?? 0;

  const openNew = () => {
    setEditing(null);
    setDraft(undefined);
    setExpenseOpen(true);
  };

  const removeExpense = async (e: Expense) => {
    if (await confirm({ title: t('common.delete'), message: t('finances.deleteConfirm'), danger: true, confirmLabel: t('common.delete') })) {
      await h.run((repo) => repo.deleteExpense(e.id), { success: t('finances.deleted') });
    }
  };

  return (
    <>
      <PageHeader
        title={t('finances.title')}
        subtitle={t('finances.subtitle')}
        actions={
          <>
            <Button variant="secondary" icon={<HandCoins className="h-4 w-4" />} disabled={!h.canWrite} onClick={() => { setSuggestion(null); setSettleOpen(true); }}>
              {t('finances.newSettlement')}
            </Button>
            <Button icon={<Plus className="h-4 w-4" />} disabled={!h.canWrite} onClick={openNew}>
              {t('finances.newExpense')}
            </Button>
          </>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs font-medium text-muted">{month === 'all' ? t('common.total') : t('finances.monthTotal')}</p>
          <p className="tabular mt-1 text-2xl font-semibold tracking-tight">{h.money(monthTotal)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-muted">{t('finances.yourShare')}</p>
          <p className="tabular mt-1 text-2xl font-semibold tracking-tight">{h.money(myShare)}</p>
          <p className="tabular mt-0.5 text-xs text-subtle">
            {t('finances.youPaid')}: {h.money(myPaid)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-muted">{t('dashboard.myBalance')}</p>
          <p className={cn('tabular mt-1 text-2xl font-semibold tracking-tight', myBalance > 0 && 'text-emerald-600 dark:text-emerald-400', myBalance < 0 && 'text-rose-600 dark:text-rose-400')}>
            {h.money(Math.abs(myBalance))}
          </p>
          <p className="mt-0.5 text-xs text-subtle">{myBalance > 0 ? t('dashboard.owedToYou') : myBalance < 0 ? t('dashboard.youOwe') : t('dashboard.settled')}</p>
        </Card>
      </div>

      <Segmented
        label={t('finances.title')}
        value={tab}
        onChange={setTab}
        className="mb-5"
        options={[
          { value: 'expenses', label: t('finances.expenses') },
          { value: 'balances', label: t('finances.balances') },
          { value: 'settlements', label: t('finances.settlements'), count: h.snap.settlements.length },
        ]}
      />

      {tab === 'expenses' && (
        <Card>
          <CardHeader
            title={month === 'all' ? t('finances.allMonths') : t('finances.monthOf', { month: monthLabel(month, h.intl) })}
            action={
              <div className="w-44">
                <Select value={month} onChange={(e) => setMonth(e.target.value)} aria-label={t('finances.filterMonth')} className="h-9 text-sm">
                  <option value="all">{t('finances.allMonths')}</option>
                  {months.map((m) => (
                    <option key={m} value={m}>
                      {monthLabel(m, h.intl)}
                    </option>
                  ))}
                </Select>
              </div>
            }
          />
          <CardBody>
            {shown.length === 0 ? (
              <EmptyState
                icon={<Receipt className="h-6 w-6" />}
                title={t('finances.empty')}
                hint={t('finances.emptyHint')}
                action={
                  <Button icon={<Plus className="h-4 w-4" />} onClick={openNew} disabled={!h.canWrite}>
                    {t('finances.newExpense')}
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y divide-line">
                {shown.map((e) => {
                  const payer = h.memberById.get(e.paid_by);
                  const mine = h.snap.shares.find((s) => s.expense_id === e.id && s.user_id === h.userId)?.amount;
                  return (
                    <li key={e.id} className="group flex items-center gap-3 py-3">
                      {payer && <Avatar name={payer.profile.display_name} color={payer.profile.avatar_color} size="md" />}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{e.description}</p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
                          <span>{formatDate(e.spent_on, h.intl)}</span>
                          <span>{t('finances.paidByName', { name: h.nameOf(e.paid_by) })}</span>
                          <CategoryTag category={e.category_id ? h.categoryById.get(e.category_id) : null} />
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="tabular font-semibold">{h.money(e.amount)}</p>
                        {mine !== undefined && <p className="tabular text-xs text-subtle">{t('finances.yourShare')}: {h.money(mine)}</p>}
                      </div>
                      <div className="flex gap-0.5 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:focus-within:opacity-100">
                        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!h.canWrite} onClick={() => { setEditing(e); setDraft(undefined); setExpenseOpen(true); }} aria-label={t('common.edit')}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-rose-600" disabled={!h.canWrite} onClick={() => void removeExpense(e)} aria-label={t('common.delete')}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      )}

      {tab === 'balances' && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader title={t('finances.balances')} icon={<Wallet className="h-4.5 w-4.5" />} />
            <CardBody>
              <ul className="space-y-3">
                {h.snap.members
                  .filter((m) => m.left_at === null || (balances.get(m.user_id) ?? 0) !== 0)
                  .map((m) => {
                    const b = balances.get(m.user_id) ?? 0;
                    return (
                      <li key={m.user_id} className="flex items-center gap-3">
                        <Avatar name={m.profile.display_name} color={m.profile.avatar_color} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{h.fullNameOf(m.user_id)}</span>
                          <span className="text-xs text-muted">{b > 0 ? t('finances.balancePositive') : b < 0 ? t('finances.balanceNegative') : t('finances.balanceZero')}</span>
                        </span>
                        <span className={cn('tabular font-semibold', b > 0 && 'text-emerald-600 dark:text-emerald-400', b < 0 && 'text-rose-600 dark:text-rose-400')}>
                          {b > 0 ? '+' : b < 0 ? '−' : ''}
                          {h.money(Math.abs(b))}
                        </span>
                      </li>
                    );
                  })}
              </ul>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title={t('finances.suggested')} icon={<HandCoins className="h-4.5 w-4.5" />} />
            <CardBody>
              {transfers.length === 0 ? (
                <EmptyState compact icon={<HandCoins className="h-5 w-5" />} title={t('finances.allSettled')} />
              ) : (
                <ul className="space-y-2">
                  {transfers.map((tr) => (
                    <li key={`${tr.from}-${tr.to}`} className="flex items-center gap-3 rounded-xl border border-line px-3 py-3">
                      <span className="min-w-0 flex-1 text-sm">
                        <span className="flex items-center gap-1.5 font-medium">
                          {h.nameOf(tr.from)} <ArrowRight className="h-3.5 w-3.5 text-subtle" aria-hidden /> {h.nameOf(tr.to)}
                        </span>
                        <span className="tabular text-muted">{h.money(tr.amount)}</span>
                      </span>
                      <Button size="sm" variant="soft" disabled={!h.canWrite} onClick={() => { setSuggestion(tr); setSettleOpen(true); }}>
                        {t('finances.registerSuggestion')}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-4 text-xs text-subtle">{t('finances.settlementNote')}</p>
            </CardBody>
          </Card>
        </div>
      )}

      {tab === 'settlements' && (
        <Card>
          <CardBody>
            {h.snap.settlements.length === 0 ? (
              <EmptyState compact icon={<HandCoins className="h-5 w-5" />} title={t('finances.noSettlements')} />
            ) : (
              <ul className="divide-y divide-line">
                {h.snap.settlements.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 py-3">
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-sunken text-muted">
                      <HandCoins className="h-4 w-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-sm font-medium">
                        {h.nameOf(s.from_user)} <ArrowRight className="h-3.5 w-3.5 text-subtle" aria-hidden /> {h.nameOf(s.to_user)}
                      </p>
                      <p className="text-xs text-muted">
                        {formatDate(s.settled_on, h.intl, { dateStyle: 'medium' })}
                        {s.note && ` · ${s.note}`}
                      </p>
                    </div>
                    <span className="tabular font-semibold">{h.money(s.amount)}</span>
                    {s.created_by === h.userId && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 hover:text-rose-600"
                        disabled={!h.canWrite}
                        aria-label={t('common.delete')}
                        onClick={async () => {
                          if (await confirm({ title: t('common.delete'), message: t('finances.deleteSettlementConfirm'), danger: true, confirmLabel: t('common.delete') })) {
                            await h.run((repo) => repo.deleteSettlement(s.id), { success: t('finances.deleted') });
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      )}

      <ExpenseFormSheet h={h} open={expenseOpen} onClose={() => setExpenseOpen(false)} expense={editing} draft={draft} />
      <SettlementFormSheet h={h} open={settleOpen} onClose={() => setSettleOpen(false)} suggestion={suggestion} />
    </>
  );
}
