import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Sheet } from '@/components/ui/Sheet';
import { startOfWeek, todayISO } from '@/domain/dates';
import { generateWeekAssignments, nextRotationOffset } from '@/domain/rotation';
import { choreSchema, type ChoreValues } from '@/domain/schemas';
import type { Chore } from '@/domain/types';
import type { Household } from '@/hooks/useHousehold';

const FREQUENCIES = ['daily', 'twice_weekly', 'weekly', 'biweekly', 'monthly'] as const;

export function ChoreFormSheet({ h, open, onClose, chore }: { h: Household; open: boolean; onClose: () => void; chore: Chore | null }) {
  const { t } = useTranslation();
  const { register, handleSubmit, reset, watch, formState } = useForm<ChoreValues>({ resolver: zodResolver(choreSchema) });
  const frequency = watch('frequency');

  useEffect(() => {
    if (!open) return;
    reset({
      title: chore?.title ?? '',
      description: chore?.description ?? '',
      categoryId: chore?.category_id ?? '',
      frequency: chore?.frequency ?? 'weekly',
      dueWeekday: String(chore?.due_weekday ?? 7),
      effort: String(chore?.effort ?? 2),
    });
  }, [open, chore, reset]);

  const onSubmit = handleSubmit(async (v) => {
    const input = {
      title: v.title.trim(),
      description: v.description.trim() || null,
      category_id: v.categoryId || null,
      frequency: v.frequency,
      due_weekday: Number(v.dueWeekday),
      effort: Number(v.effort),
    };
    const result = chore
      ? await h.run((repo) => repo.updateChore(chore.id, input), { success: t('common.save') })
      : await h.run(
          async (repo) => {
            const created = await repo.createChore(h.snap.apartment.id, { ...input, rotation_offset: nextRotationOffset(h.snap.chores, h.activeMembers.length) });
            // a new chore joins the rotation right away for the current week
            if (h.snap.rotation.auto_generate) {
              const activeIds = new Set(h.activeMembers.map((m) => m.user_id));
              const rows = generateWeekAssignments({
                apartmentId: h.snap.apartment.id,
                weekStart: startOfWeek(todayISO()),
                chores: [created],
                rotation: { ...h.snap.rotation, member_order: h.snap.rotation.member_order.filter((id) => activeIds.has(id)) },
                existing: [],
              });
              await repo.insertAssignments(rows);
            }
          },
          { success: t('common.save') },
        );
    if (result.ok) onClose();
  });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={chore ? t('chores.editChore') : t('chores.newChore')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="chore-form" loading={formState.isSubmitting} disabled={!h.canWrite}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="chore-form" onSubmit={onSubmit} noValidate className="space-y-4">
        <Field label={t('chores.choreTitle')} error={formState.errors.title?.message}>
          {(p) => <Input {...p} {...register('title')} />}
        </Field>
        <Field label={t('chores.description')} optional error={formState.errors.description?.message}>
          {(p) => <Textarea {...p} {...register('description')} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('common.category')}>
            {(p) => (
              <Select {...p} {...register('categoryId')}>
                <option value="">{t('common.noCategory')}</option>
                {h.categoriesOf('chore').map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('chores.frequency')}>
            {(p) => (
              <Select {...p} {...register('frequency')}>
                {FREQUENCIES.map((f) => (
                  <option key={f} value={f}>
                    {t(`chores.freq.${f}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {frequency !== 'daily' && frequency !== 'twice_weekly' && (
            <Field label={t('chores.dueWeekday')}>
              {(p) => (
                <Select {...p} {...register('dueWeekday')}>
                  {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                    <option key={d} value={String(d)}>
                      {t(`chores.weekdays.${d}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          <Field label={t('chores.effort')} hint={t('chores.effortHint')}>
            {(p) => (
              <Select {...p} {...register('effort')}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={String(n)}>
                    {n}
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
