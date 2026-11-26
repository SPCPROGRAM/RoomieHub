import { useEffect, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Sheet } from '@/components/ui/Sheet';
import { formatDate, startOfWeek, todayISO } from '@/domain/dates';
import { generateWeekAssignments, nextRotationOffset } from '@/domain/rotation';
import { choreSchema, type ChoreValues } from '@/domain/schemas';
import type { Chore, RotationMode } from '@/domain/types';
import type { Household } from '@/hooks/useHousehold';
import { cn } from '@/lib/cn';
import { activeOrder, archiveChore, regenerateFromThisWeek } from './choreActions';

const FREQUENCIES = ['daily', 'custom_days', 'weekly', 'twice_weekly', 'biweekly', 'monthly'] as const;
const WEEKDAYS = ['1', '2', '3', '4', '5', '6', '7'] as const;
const DAY_PRESETS: { key: string; days: string[] }[] = [
  { key: 'everyOther', days: ['1', '3', '5'] },
  { key: 'tueThu', days: ['2', '4'] },
  { key: 'weekend', days: ['6', '7'] },
];
const MODES: RotationMode[] = ['per_occurrence', 'weekly', 'fixed'];

export function ChoreFormSheet({ h, open, onClose, chore }: { h: Household; open: boolean; onClose: () => void; chore: Chore | null }) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const { register, handleSubmit, reset, watch, control, setValue, formState } = useForm<ChoreValues>({ resolver: zodResolver(choreSchema) });
  const values = watch();
  const frequency = values.frequency;
  const mode = values.rotationMode;

  useEffect(() => {
    if (!open) return;
    reset({
      title: chore?.title ?? '',
      description: chore?.description ?? '',
      categoryId: chore?.category_id ?? '',
      frequency: chore?.frequency ?? 'daily',
      scheduleDays: (chore?.schedule_days?.length ? chore.schedule_days : [1, 3, 5]).map(String),
      rotationMode: chore?.rotation_mode ?? 'per_occurrence',
      fixedAssigneeId: chore?.fixed_assignee_id ?? '',
      dueWeekday: String(chore?.due_weekday ?? 7),
      effort: String(chore?.effort ?? 2),
    });
  }, [open, chore, reset]);

  const toInput = (v: ChoreValues) => ({
    title: v.title.trim(),
    description: v.description.trim() || null,
    category_id: v.categoryId || null,
    frequency: v.frequency,
    schedule_days: v.frequency === 'custom_days' ? v.scheduleDays.map(Number).sort((a, b) => a - b) : [],
    rotation_mode: v.rotationMode,
    fixed_assignee_id: v.rotationMode === 'fixed' ? v.fixedAssigneeId || null : null,
    due_weekday: Number(v.dueWeekday),
    effort: Number(v.effort),
  });

  // live preview: who does what this week with the current form values
  const preview = useMemo(() => {
    if (!open || !values.frequency || !values.rotationMode) return [];
    const input = toInput({ ...values, title: values.title ?? '', description: values.description ?? '', scheduleDays: values.scheduleDays ?? [] });
    const draft: Chore = {
      ...input,
      id: chore?.id ?? 'preview',
      apartment_id: h.snap.apartment.id,
      rotation_offset: chore?.rotation_offset ?? nextRotationOffset(h.snap.chores, h.activeMembers.length),
      active: true,
      archived_at: null,
      created_by: null,
      created_at: chore?.created_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    return generateWeekAssignments({
      apartmentId: h.snap.apartment.id,
      weekStart: startOfWeek(todayISO()),
      chores: [draft],
      rotation: { ...h.snap.rotation, member_order: activeOrder(h) },
      existing: [],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, JSON.stringify(values), chore, h.snap]);

  const onSubmit = handleSubmit(async (v) => {
    const input = toInput(v);
    const scheduleChanged =
      chore !== null &&
      (chore.frequency !== input.frequency ||
        chore.due_weekday !== input.due_weekday ||
        (chore.rotation_mode ?? 'weekly') !== input.rotation_mode ||
        (chore.fixed_assignee_id ?? null) !== input.fixed_assignee_id ||
        JSON.stringify(chore.schedule_days ?? []) !== JSON.stringify(input.schedule_days));

    const result = chore
      ? await h.run(
          async (repo) => {
            await repo.updateChore(chore.id, input);
            // new rules apply from this week on; done turns and past weeks stay as they were
            if (scheduleChanged) await regenerateFromThisWeek(repo, h, { ...chore, ...input }, { dropPending: true });
          },
          { success: t('common.save') },
        )
      : await h.run(
          async (repo) => {
            const created = await repo.createChore(h.snap.apartment.id, { ...input, rotation_offset: nextRotationOffset(h.snap.chores, h.activeMembers.length) });
            await regenerateFromThisWeek(repo, h, created, { dropPending: false });
          },
          { success: t('common.save') },
        );
    if (result.ok) onClose();
  });

  const remove = async () => {
    if (!chore) return;
    if (!(await confirm({ title: t('chores.archive'), message: t('chores.archiveConfirm'), danger: true, confirmLabel: t('common.delete') }))) return;
    const r = await h.run((repo) => archiveChore(repo, h, chore), { success: t('chores.archived') });
    if (r.ok) onClose();
  };

  const days = values.scheduleDays ?? [];
  const toggleDay = (d: string) => setValue('scheduleDays', days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort(), { shouldValidate: formState.isSubmitted });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={chore ? t('chores.editChore') : t('chores.newChore')}
      footer={
        <>
          {chore && (
            <Button variant="ghost" className="mr-auto text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-500/10" icon={<Trash2 className="h-4 w-4" />} disabled={!h.canWrite} onClick={() => void remove()}>
              {t('common.delete')}
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="chore-form" loading={formState.isSubmitting} disabled={!h.canWrite}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="chore-form" onSubmit={onSubmit} noValidate className="space-y-5">
        <Field label={t('chores.choreTitle')} error={formState.errors.title?.message}>
          {(p) => <Input {...p} placeholder={t('chores.titlePlaceholder')} {...register('title')} />}
        </Field>

        {/* when */}
        <div className="space-y-3">
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
          {frequency === 'custom_days' && (
            <div className="space-y-2" role="group" aria-label={t('chores.pickDays')}>
              <div className="flex gap-1.5">
                {WEEKDAYS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={days.includes(d)}
                    title={t(`chores.weekdays.${d}`)}
                    onClick={() => toggleDay(d)}
                    className={cn(
                      'grid h-10 flex-1 place-items-center rounded-xl border text-sm font-semibold transition-colors',
                      days.includes(d) ? 'border-brand-500 bg-brand-600 text-white dark:bg-brand-500 dark:text-brand-950' : 'border-line text-muted hover:bg-sunken',
                    )}
                  >
                    {t(`chores.weekdayShort.${d}`)}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {DAY_PRESETS.map((preset) => (
                  <button key={preset.key} type="button" onClick={() => setValue('scheduleDays', preset.days, { shouldValidate: true })} className="rounded-full border border-line px-3 py-1 text-xs font-medium text-muted hover:bg-sunken">
                    {t(`chores.presets.${preset.key}`)}
                  </button>
                ))}
              </div>
              {formState.errors.scheduleDays?.message && <p className="text-xs font-medium text-rose-600">{t(formState.errors.scheduleDays.message)}</p>}
            </div>
          )}
          {(frequency === 'weekly' || frequency === 'biweekly' || frequency === 'monthly') && (
            <Field label={t('chores.dueWeekday')}>
              {(p) => (
                <Select {...p} {...register('dueWeekday')}>
                  {WEEKDAYS.map((d) => (
                    <option key={d} value={d}>
                      {t(`chores.weekdays.${d}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
        </div>

        {/* who */}
        <div className="space-y-2">
          <p className="text-sm font-medium">{t('chores.whoDoesIt')}</p>
          <Controller
            control={control}
            name="rotationMode"
            render={({ field }) => (
              <div role="radiogroup" aria-label={t('chores.whoDoesIt')} className="grid gap-2">
                {MODES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={field.value === m}
                    onClick={() => field.onChange(m)}
                    className={cn('rounded-xl border px-4 py-3 text-left transition-colors', field.value === m ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10' : 'border-line hover:bg-sunken')}
                  >
                    <span className="block text-sm font-semibold">{t(`chores.modes.${m}.title`)}</span>
                    <span className="mt-0.5 block text-xs text-muted">{t(`chores.modes.${m}.hint`)}</span>
                  </button>
                ))}
              </div>
            )}
          />
          {mode === 'fixed' && (
            <Field label={t('chores.fixedPerson')} error={formState.errors.fixedAssigneeId?.message}>
              {(p) => (
                <Select {...p} {...register('fixedAssigneeId')}>
                  <option value="">{t('chores.choosePerson')}</option>
                  {h.orderedMembers.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {h.fullNameOf(m.user_id)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
        </div>

        {preview.length > 0 && (
          <div className="rounded-xl bg-sunken px-4 py-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-subtle">{t('chores.previewThisWeek')}</p>
            <ul className="flex flex-wrap gap-2">
              {preview.map((a) => {
                const m = h.memberById.get(a.assignee_id);
                return (
                  <li key={a.occurrence} className="flex items-center gap-1.5 rounded-full bg-surface py-1 pl-1 pr-2.5 text-xs">
                    {m && <Avatar name={m.profile.display_name} color={m.profile.avatar_color} size="xs" />}
                    <span className="font-medium first-letter:uppercase">{formatDate(a.due_date, h.intl, { weekday: 'short' })}</span>
                    <span className="text-muted">{h.nameOf(a.assignee_id)}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

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
        <Field label={t('chores.description')} optional error={formState.errors.description?.message}>
          {(p) => <Textarea {...p} rows={2} {...register('description')} />}
        </Field>
      </form>
    </Sheet>
  );
}
