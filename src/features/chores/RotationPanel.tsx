import { ArrowDown, ArrowUp, RefreshCcw, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { Field, Select, Toggle } from '@/components/ui/Field';
import { startOfWeek, todayISO } from '@/domain/dates';
import { generateWeekAssignments } from '@/domain/rotation';
import type { UUID } from '@/domain/types';
import type { Household } from '@/hooks/useHousehold';
import { useToast } from '@/providers/ToastProvider';

export function RotationPanel({ h, viewedWeek }: { h: Household; viewedWeek: string }) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const toast = useToast();
  const { rotation } = h.snap;
  const activeIds = new Set(h.activeMembers.map((m) => m.user_id));
  const order = h.orderedMembers.map((m) => m.user_id);
  const currentWeek = startOfWeek(todayISO());

  const move = (index: number, delta: number) => {
    const next = [...order];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item!);
    void h.run((repo) => repo.updateRotation(h.snap.apartment.id, { member_order: next }));
  };

  const generate = async (week: string) => {
    const rows = generateWeekAssignments({
      apartmentId: h.snap.apartment.id,
      weekStart: week,
      chores: h.snap.chores,
      rotation: { ...rotation, member_order: rotation.member_order.filter((id) => activeIds.has(id)) },
      existing: h.snap.assignments,
    });
    if (rows.length === 0) return toast.info(t('chores.nothingToGenerate'));
    await h.run((repo) => repo.insertAssignments(rows), { success: t('chores.generated', { count: rows.length }) });
  };

  const resetFromThisWeek = async () => {
    const ok = await confirm({ title: t('chores.resetWeek'), message: t('chores.resetConfirm'), danger: true, confirmLabel: t('common.confirm') });
    if (!ok) return;
    await h.run(
      async (repo) => {
        await repo.deletePendingAssignments(h.snap.apartment.id, currentWeek);
        await repo.updateRotation(h.snap.apartment.id, { anchor_week: currentWeek, member_order: order });
        // regenerate with the new anchor; done assignments of this week are kept and skipped
        const remaining = h.snap.assignments.filter((a) => !(a.week_start === currentWeek && a.status === 'pending'));
        const rows = generateWeekAssignments({
          apartmentId: h.snap.apartment.id,
          weekStart: currentWeek,
          chores: h.snap.chores,
          rotation: { member_order: order, anchor_week: currentWeek },
          existing: remaining,
        });
        await repo.insertAssignments(rows);
      },
      { success: t('chores.resetDone') },
    );
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title={t('chores.order')} subtitle={t('chores.orderHint')} />
        <CardBody>
          <ol className="space-y-2">
            {order.map((id: UUID, i) => {
              const m = h.memberById.get(id)!;
              return (
                <li key={id} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5">
                  <span className="tabular w-5 text-center text-sm font-semibold text-subtle">{i + 1}</span>
                  <Avatar name={m.profile.display_name} color={m.profile.avatar_color} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{h.fullNameOf(id)}</span>
                  <Button variant="ghost" size="icon" className="h-8 w-8" disabled={i === 0 || !h.canWrite} onClick={() => move(i, -1)} aria-label={t('chores.moveUp')}>
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" disabled={i === order.length - 1 || !h.canWrite} onClick={() => move(i, 1)} aria-label={t('chores.moveDown')}>
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                </li>
              );
            })}
          </ol>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title={t('chores.rotation')} />
        <CardBody className="space-y-5">
          <Toggle
            checked={rotation.auto_generate}
            disabled={!h.canWrite}
            onChange={(v) => void h.run((repo) => repo.updateRotation(h.snap.apartment.id, { auto_generate: v }))}
            label={t('chores.autoGenerate')}
          />
          <Field label={t('chores.threshold')}>
            {(p) => (
              <Select
                {...p}
                value={String(rotation.repetition_threshold)}
                disabled={!h.canWrite}
                onChange={(e) => void h.run((repo) => repo.updateRotation(h.snap.apartment.id, { repetition_threshold: Number(e.target.value) }))}
              >
                {[2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {t('chores.thresholdValue', { count: n })}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="flex flex-col gap-2 border-t border-line pt-5 sm:flex-row">
            <Button variant="soft" icon={<Sparkles className="h-4 w-4" />} disabled={!h.canWrite || viewedWeek < currentWeek} onClick={() => void generate(viewedWeek)}>
              {t('chores.generateWeek')}
            </Button>
            <Button variant="secondary" icon={<RefreshCcw className="h-4 w-4" />} disabled={!h.canWrite} onClick={() => void resetFromThisWeek()}>
              {t('chores.resetWeek')}
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
