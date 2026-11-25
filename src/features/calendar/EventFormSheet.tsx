import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { MoneyInput } from '@/components/shared/MoneyInput';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea, Toggle } from '@/components/ui/Field';
import { Sheet } from '@/components/ui/Sheet';
import { dateOfTimestamp } from '@/domain/dates';
import { formatAmountPlain, parseMoneyInput } from '@/domain/money';
import { eventSchema, type EventValues } from '@/domain/schemas';
import type { CalendarEvent, ISODate } from '@/domain/types';
import type { Household } from '@/hooks/useHousehold';
import { features } from '@/config/features';

const pad = (n: number) => String(n).padStart(2, '0');
const timeOf = (ts: string) => {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const toTimestamp = (date: string, time: string) => new Date(`${date}T${time || '00:00'}:00`).toISOString();

export function EventFormSheet({ h, open, onClose, event, defaultDate }: { h: Household; open: boolean; onClose: () => void; event: CalendarEvent | null; defaultDate: ISODate }) {
  const { t } = useTranslation();
  const { register, handleSubmit, reset, control, watch, formState } = useForm<EventValues>({ resolver: zodResolver(eventSchema) });
  const allDay = watch('allDay');
  const kind = watch('kind');

  useEffect(() => {
    if (!open) return;
    reset({
      title: event?.title ?? '',
      description: event?.description ?? '',
      kind: event?.kind ?? 'event',
      date: event ? dateOfTimestamp(event.starts_at) : defaultDate,
      allDay: event?.all_day ?? false,
      startTime: event && !event.all_day ? timeOf(event.starts_at) : '19:00',
      endTime: event?.ends_at && !event.all_day ? timeOf(event.ends_at) : '',
      recurrence: event?.recurrence ?? 'none',
      remind: event?.remind_minutes_before === null || event?.remind_minutes_before === undefined ? (event ? 'none' : '60') : String(event.remind_minutes_before),
      amount: event?.amount ? formatAmountPlain(event.amount, h.intl) : '',
      visibility: event?.visibility ?? 'shared',
    });
  }, [open, event, defaultDate, reset, h.intl]);

  const onSubmit = handleSubmit(async (v) => {
    const input = {
      title: v.title.trim(),
      description: v.description.trim() || null,
      kind: v.kind,
      starts_at: toTimestamp(v.date, v.allDay ? '00:00' : v.startTime),
      ends_at: !v.allDay && v.endTime ? toTimestamp(v.date, v.endTime) : null,
      all_day: v.allDay,
      recurrence: v.recurrence,
      remind_minutes_before: v.remind === 'none' ? null : Number(v.remind),
      amount: features.finances ? (v.kind === 'payment' && v.amount ? parseMoneyInput(v.amount) : null) : (event?.amount ?? null),
      visibility: v.visibility,
    };
    const r = await h.run((repo) => (event ? repo.updateEvent(event.id, input) : repo.createEvent(h.snap.apartment.id, input)), { success: t('calendar.saved') });
    if (r.ok) onClose();
  });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={event ? t('calendar.editEvent') : t('calendar.newEvent')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="event-form" loading={formState.isSubmitting} disabled={!h.canWrite}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="event-form" onSubmit={onSubmit} noValidate className="space-y-4">
        <Field label={t('calendar.eventTitle')} error={formState.errors.title?.message}>
          {(p) => <Input {...p} {...register('title')} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('calendar.kind')}>
            {(p) => (
              <Select {...p} {...register('kind')}>
                {(['event', 'payment', 'reminder', 'maintenance'] as const).filter((k) => features.finances || k !== 'payment' || event?.kind === 'payment').map((k) => (
                  <option key={k} value={k}>
                    {t(`calendar.kinds.${k}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('common.date')} error={formState.errors.date?.message}>
            {(p) => <Input {...p} type="date" {...register('date')} />}
          </Field>
        </div>
        <Controller control={control} name="allDay" render={({ field }) => <Toggle checked={field.value} onChange={field.onChange} label={t('calendar.allDay')} />} />
        {!allDay && (
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('calendar.start')} error={formState.errors.startTime?.message}>
              {(p) => <Input {...p} type="time" {...register('startTime')} />}
            </Field>
            <Field label={t('calendar.end')} optional error={formState.errors.endTime?.message}>
              {(p) => <Input {...p} type="time" {...register('endTime')} />}
            </Field>
          </div>
        )}
        {features.finances && kind === 'payment' && (
          <Field label={t('calendar.paymentAmount')} optional error={formState.errors.amount?.message}>
            {(p) => <MoneyInput {...p} currency={h.snap.apartment.currency} locale={h.intl} {...register('amount')} />}
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('calendar.recurrence')}>
            {(p) => (
              <Select {...p} {...register('recurrence')}>
                {(['none', 'weekly', 'monthly'] as const).map((r) => (
                  <option key={r} value={r}>
                    {t(`calendar.recurrences.${r}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('calendar.remind')}>
            {(p) => (
              <Select {...p} {...register('remind')}>
                {(['none', '0', '60', '1440', '4320'] as const).map((r) => (
                  <option key={r} value={r}>
                    {t(`calendar.reminders.${r}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Field label={t('calendar.visibility')}>
          {(p) => (
            <Select {...p} {...register('visibility')}>
              <option value="shared">{t('calendar.shared')}</option>
              <option value="private">{t('calendar.private')}</option>
            </Select>
          )}
        </Field>
        <Field label={t('calendar.description')} optional error={formState.errors.description?.message}>
          {(p) => <Textarea {...p} {...register('description')} />}
        </Field>
      </form>
    </Sheet>
  );
}
