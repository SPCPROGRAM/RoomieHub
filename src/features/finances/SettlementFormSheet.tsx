import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { MoneyInput } from '@/components/shared/MoneyInput';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Sheet } from '@/components/ui/Sheet';
import { todayISO } from '@/domain/dates';
import { formatAmountPlain, parseMoneyInput, type Transfer } from '@/domain/money';
import { settlementSchema, type SettlementValues } from '@/domain/schemas';
import type { Household } from '@/hooks/useHousehold';

export function SettlementFormSheet({ h, open, onClose, suggestion }: { h: Household; open: boolean; onClose: () => void; suggestion: Transfer | null }) {
  const { t } = useTranslation();
  const { register, handleSubmit, reset, formState } = useForm<SettlementValues>({ resolver: zodResolver(settlementSchema) });
  const members = h.snap.members;

  useEffect(() => {
    if (!open) return;
    const other = h.orderedMembers.find((m) => m.user_id !== h.userId)?.user_id ?? '';
    reset({
      fromUser: suggestion?.from ?? h.userId,
      toUser: suggestion?.to ?? other,
      amount: suggestion ? formatAmountPlain(suggestion.amount, h.intl) : '',
      settledOn: todayISO(),
      note: '',
    });
  }, [open, suggestion, reset, h.userId, h.orderedMembers, h.intl]);

  const onSubmit = handleSubmit(async (v) => {
    const r = await h.run(
      (repo) =>
        repo.createSettlement(h.snap.apartment.id, {
          from_user: v.fromUser,
          to_user: v.toUser,
          amount: parseMoneyInput(v.amount)!,
          settled_on: v.settledOn,
          note: v.note.trim() || null,
        }),
      { success: t('finances.settlementSaved') },
    );
    if (r.ok) onClose();
  });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('finances.newSettlement')}
      description={t('finances.settlementNote')}
      size="sm"
      footer={
        <>
          {formState.isSubmitting && <span className="mr-auto self-center text-xs text-muted">{t('finances.pendingConfirmation')}</span>}
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="settlement-form" loading={formState.isSubmitting} disabled={!h.canWrite}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="settlement-form" onSubmit={onSubmit} noValidate className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label={t('finances.from')} error={formState.errors.fromUser?.message}>
            {(p) => (
              <Select {...p} {...register('fromUser')}>
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {h.fullNameOf(m.user_id)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('finances.to')} error={formState.errors.toUser?.message}>
            {(p) => (
              <Select {...p} {...register('toUser')}>
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {h.fullNameOf(m.user_id)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Field label={t('finances.amount')} error={formState.errors.amount?.message}>
          {(p) => <MoneyInput {...p} currency={h.snap.apartment.currency} locale={h.intl} {...register('amount')} />}
        </Field>
        <Field label={t('finances.settledOn')} error={formState.errors.settledOn?.message}>
          {(p) => <Input {...p} type="date" {...register('settledOn')} />}
        </Field>
        <Field label={t('common.notes')} optional error={formState.errors.note?.message}>
          {(p) => <Textarea {...p} {...register('note')} />}
        </Field>
      </form>
    </Sheet>
  );
}
