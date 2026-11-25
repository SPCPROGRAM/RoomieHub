import { ArrowLeftRight, CheckCircle2, CircleDot, HandCoins, Home, Pencil, PlusCircle, Trash2, UserPlus, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { features } from '@/config/features';
import { formatRelative } from '@/domain/dates';
import type { ActivityLog } from '@/domain/types';
import type { Household } from '@/hooks/useHousehold';
import { Avatar } from '../ui/Avatar';
import { EmptyState } from '../ui/Feedback';

/** Activity from hidden modules is kept in the database but not shown. */
const HIDDEN_ENTITIES = new Set<string>([
  ...(features.finances ? [] : ['expense', 'settlement']),
  ...(features.shopping ? [] : ['shopping_item']),
]);

const ICONS: Record<string, LucideIcon> = {
  created: PlusCircle,
  updated: Pencil,
  deleted: Trash2,
  completed: CheckCircle2,
  uncompleted: CircleDot,
  swapped: ArrowLeftRight,
  status_changed: CircleDot,
  joined: UserPlus,
  removed: Trash2,
};

/** Human sentence for an activity log row (translated, with names resolved). */
export function useActivityText(h: Household) {
  const { t } = useTranslation();
  return (log: ActivityLog): string => {
    const actor = h.nameOf(log.actor_id);
    const entity = t(`activity.entities.${log.entity_type}`, { defaultValue: log.entity_type });
    const summary = log.summary ?? '';
    if (log.entity_type === 'settlement') {
      const amount = Number.isFinite(Number(summary)) ? h.money(Number(summary)) : summary;
      return t(log.action === 'deleted' ? 'activity.actions.settlement_deleted' : 'activity.actions.settlement_created', { actor, amount });
    }
    if (log.action === 'status_changed') {
      const to = String(log.changes?.status?.to ?? '');
      return t('activity.actions.status_changed', { actor, summary, status: t(`activity.statusValues.${to}`, { defaultValue: to }) });
    }
    return t(`activity.actions.${log.action}`, { actor, entity, summary, defaultValue: `${actor} · ${log.action} · ${summary}` });
  };
}

export function ActivityFeed({ h, items, limit }: { h: Household; items: ActivityLog[]; limit?: number }) {
  const { t } = useTranslation();
  const text = useActivityText(h);
  const visible = items.filter((log) => !HIDDEN_ENTITIES.has(log.entity_type));
  const list = limit ? visible.slice(0, limit) : visible;
  if (list.length === 0) return <EmptyState compact icon={<Home className="h-5 w-5" />} title={t('activity.empty')} />;
  return (
    <ol className="space-y-1">
      {list.map((log) => {
        const Icon = log.entity_type === 'settlement' ? HandCoins : (ICONS[log.action] ?? CircleDot);
        const member = log.actor_id ? h.memberById.get(log.actor_id) : undefined;
        return (
          <li key={log.id} className="flex items-start gap-3 rounded-xl px-2 py-2.5 hover:bg-sunken/60">
            <span className="relative mt-0.5">
              {member ? <Avatar name={member.profile.display_name} color={member.profile.avatar_color} size="sm" /> : <span className="grid h-7 w-7 place-items-center rounded-full bg-sunken" />}
              <span className="absolute -bottom-1 -right-1 grid h-4 w-4 place-items-center rounded-full bg-surface">
                <Icon className="h-3 w-3 text-brand-600 dark:text-brand-300" aria-hidden />
              </span>
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-snug text-ink">{text(log)}</p>
              <p className="mt-0.5 text-xs text-subtle">
                <time dateTime={log.created_at}>{formatRelative(log.created_at, h.intl)}</time>
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
