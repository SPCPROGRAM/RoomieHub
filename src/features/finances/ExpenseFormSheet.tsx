import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MemberChips } from '@/components/shared/MemberChips';
import { MoneyInput } from '@/components/shared/MoneyInput';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Sheet } from '@/components/ui/Sheet';
import { todayISO } from '@/domain/dates';
import { formatAmountPlain, parseMoneyInput, splitEqually } from '@/domain/money';
import { expenseSchema, type ExpenseValues } from '@/domain/schemas';
import type { Expense, UUID } from '@/domain/types';
import type { Household } from '@/hooks/useHousehold';

export interface ExpenseDraft {
  description?: string;
  amount?: number;
  maintenanceReportId?: UUID;
  categoryId?: UUID;
}

export function ExpenseFormSheet({ h, open, onClose, expense, draft }: { h: Household; open: boolean; onClose: () => void; expense: Expense | null; draft?: ExpenseDraft }) {
  const { t } = useTranslation();
  const { register, handleSubmit, reset, control, watch, formState } = useForm<ExpenseValues>({ resolver: zodResolver(expenseSchema) });

  useEffect(() => {
    if (!open) return;
    const participants = expense ? h.snap.shares.filter((s) => s.expense_id === expense.id).map((s) => s.user_id) : h.orderedMembers.map((m) => m.user_id);
    const ordered = h.snap.members.map((m) => m.user_id).filter((id) => participants.includes(id));
    reset({
      description: expense?.description ?? draft?.description ?? '',
      amount: expense ? formatAmountPlain(expense.amount, h.intl) : draft?.amount ? formatAmountPlain(draft.amount, h.intl) : '',
      paidBy: expense?.paid_by ?? h.userId,
      spentOn: expense?.spent_on ?? todayISO(),
      categoryId: expense?.category_id ?? draft?.categoryId ?? '',
      participants: ordered,
      notes: expense?.notes ?? '',
      maintenanceReportId: expense?.maintenance_report_id ?? draft?.maintenanceReportId ?? '',
    });
  }, [open, expense, draft, reset, h.snap.shares, h.snap.members, h.orderedMembers, h.userId, h.intl]);

  const amount = parseMoneyInput(watch('amount') ?? '');
  const participants = watch('participants') ?? [];
  const preview = amount && participants.length > 0 ? splitEqually(amount, participants) : [];
  // members who left still appear when editing an old expense they were part of
  const selectable = expense ? h.snap.members.filter((m) => m.left_at === null || participants.includes(m.user_id) || m.user_id === expense.paid_by) : h.orderedMembers;

  const onSubmit = handleSubmit(async (v) => {
    const input = {
      description: v.description.trim(),
      amount: parseMoneyInput(v.amount)!,
      paid_by: v.paidBy,
      spent_on: v.spentOn,
      category_id: v.categoryId || null,
      participants: v.participants,
      notes: v.notes.trim() || null,
      maintenance_report_id: v.maintenanceReportId || null,
    };
    // resolves only after the server confirmed; nothing is shown as saved before that
    const r = await h.run<unknown>((repo) => (expense ? repo.updateExpense(expense.id, input) : repo.createExpense(h.snap.apartment.id, input)), { success: t('finances.saved') });
    if (r.ok) onClose();
  });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={expense ? t('finances.editExpense') : t('finances.newExpense')}
      footer={
        <>
          {formState.isSubmitting && <span className="mr-auto self-center text-xs text-muted">{t('finances.pendingConfirmation')}</span>}
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="expense-form" loading={formState.isSubmitting} disabled={!h.canWrite}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="expense-form" onSubmit={onSubmit} noValidate className="space-y-4">
        <Field label={t('finances.description')} error={formState.errors.description?.message}>
          {(p) => <Input {...p} placeholder={t('finances.descriptionPlaceholder')} {...register('description')} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('finances.amount')} hint={t('finances.amountHint')} error={formState.errors.amount?.message}>
            {(p) => <MoneyInput {...p} currency={h.snap.apartment.currency} locale={h.intl} {...register('amount')} />}
          </Field>
          <Field label={t('finances.spentOn')} error={formState.errors.spentOn?.message}>
            {(p) => <Input {...p} type="date" {...register('spentOn')} />}
          </Field>
          <Field label={t('finances.paidBy')} error={formState.errors.paidBy?.message}>
            {(p) => (
              <Select {...p} {...register('paidBy')}>
                {selectable.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {h.fullNameOf(m.user_id)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('common.category')}>
            {(p) => (
              <Select {...p} {...register('categoryId')}>
                <option value="">{t('common.noCategory')}</option>
                {h.categoriesOf('expense').map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Field label={t('finances.splitBetween')} error={formState.errors.participants?.message}>
          {() => (
            <Controller
              control={control}
              name="participants"
              render={({ field }) => <MemberChips members={selectable} value={field.value ?? []} onChange={field.onChange} labelOf={h.nameOf} invalid={Boolean(formState.errors.participants)} />}
            />
          )}
        </Field>
        {preview.length > 0 && (
          <div className="rounded-xl bg-sunken px-4 py-3">
            <ul className="space-y-1 text-sm">
              {preview.map((s) => (
                <li key={s.userId} className="flex justify-between">
                  <span className="text-muted">{t('finances.shareOf', { name: h.nameOf(s.userId) })}</span>
                  <span className="tabular font-medium">{h.money(s.amount)}</span>
                </li>
              ))}
            </ul>
            {amount! % participants.length !== 0 && (
              <p className="mt-2 flex gap-1.5 text-xs text-subtle">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                {t('finances.residueNote')}
              </p>
            )}
          </div>
        )}
        {h.snap.reports.length > 0 && (
          <Field label={t('finances.linkedReport')} optional>
            {(p) => (
              <Select {...p} {...register('maintenanceReportId')}>
                <option value="">{t('common.none')}</option>
                {h.snap.reports.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <Field label={t('common.notes')} optional error={formState.errors.notes?.message}>
          {(p) => <Textarea {...p} {...register('notes')} />}
        </Field>
      </form>
    </Sheet>
  );
}
