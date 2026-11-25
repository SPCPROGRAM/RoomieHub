import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Sheet } from '@/components/ui/Sheet';
import { todayISO } from '@/domain/dates';
import { reportSchema, type ReportValues } from '@/domain/schemas';
import type { MaintenanceReport } from '@/domain/types';
import type { Household } from '@/hooks/useHousehold';

export const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export const STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;

export function ReportFormSheet({ h, open, onClose, report, onCreated }: { h: Household; open: boolean; onClose: () => void; report: MaintenanceReport | null; onCreated?: (r: MaintenanceReport) => void }) {
  const { t } = useTranslation();
  const { register, handleSubmit, reset, formState } = useForm<ReportValues>({ resolver: zodResolver(reportSchema) });

  useEffect(() => {
    if (!open) return;
    reset({
      title: report?.title ?? '',
      description: report?.description ?? '',
      location: report?.location ?? '',
      priority: report?.priority ?? 'medium',
      status: report?.status ?? 'open',
      occurredOn: report?.occurred_on ?? todayISO(),
      responsibleId: report?.responsible_id ?? '',
    });
  }, [open, report, reset]);

  const onSubmit = handleSubmit(async (v) => {
    const input = {
      title: v.title.trim(),
      description: v.description.trim() || null,
      location: v.location.trim() || null,
      priority: v.priority,
      status: v.status,
      occurred_on: v.occurredOn,
      responsible_id: v.responsibleId || null,
    };
    const r = await h.run((repo) => (report ? repo.updateReport(report.id, input).then(() => null) : repo.createReport(h.snap.apartment.id, input)), { success: t('maintenance.saved') });
    if (r.ok) {
      onClose();
      if (r.value) onCreated?.(r.value);
    }
  });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={report ? t('maintenance.editReport') : t('maintenance.newReport')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="report-form" loading={formState.isSubmitting} disabled={!h.canWrite}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="report-form" onSubmit={onSubmit} noValidate className="space-y-4">
        <Field label={t('maintenance.reportTitle')} error={formState.errors.title?.message}>
          {(p) => <Input {...p} placeholder={t('maintenance.reportTitlePlaceholder')} {...register('title')} />}
        </Field>
        <Field label={t('maintenance.description')} optional error={formState.errors.description?.message}>
          {(p) => <Textarea {...p} rows={4} {...register('description')} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('maintenance.location')} optional error={formState.errors.location?.message}>
            {(p) => <Input {...p} placeholder={t('maintenance.locationPlaceholder')} {...register('location')} />}
          </Field>
          <Field label={t('maintenance.occurredOn')} error={formState.errors.occurredOn?.message}>
            {(p) => <Input {...p} type="date" {...register('occurredOn')} />}
          </Field>
          <Field label={t('maintenance.priority')}>
            {(p) => (
              <Select {...p} {...register('priority')}>
                {PRIORITIES.map((x) => (
                  <option key={x} value={x}>
                    {t(`maintenance.priorities.${x}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('common.status')}>
            {(p) => (
              <Select {...p} {...register('status')}>
                {STATUSES.map((x) => (
                  <option key={x} value={x}>
                    {t(`maintenance.statuses.${x}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('maintenance.responsible')} className="sm:col-span-2">
            {(p) => (
              <Select {...p} {...register('responsibleId')}>
                <option value="">{t('common.nobody')}</option>
                {h.orderedMembers.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {h.fullNameOf(m.user_id)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      </form>
    </Sheet>
  );
}
