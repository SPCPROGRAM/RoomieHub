import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { formatMoney } from '@/domain/money';
import type { CategoryScope, Member, Snapshot, UUID } from '@/domain/types';
import { useApartment } from '@/providers/ApartmentProvider';
import { useAuth } from '@/providers/AuthProvider';
import { usePreferences } from '@/providers/PreferencesProvider';

/**
 * Derived, memoised views over the current apartment snapshot, used by every module.
 * Only call it inside routes rendered after the snapshot is ready (see RequireApartment).
 */
export function useHousehold() {
  const { snapshot, run, online, fromCache } = useApartment();
  const { user, mode } = useAuth();
  const { intl } = usePreferences();
  const { t } = useTranslation();
  if (!snapshot || !user) throw new Error('useHousehold requires a loaded apartment');
  const snap: Snapshot = snapshot;

  const memberById = useMemo(() => new Map(snap.members.map((m) => [m.user_id, m])), [snap.members]);
  const activeMembers = useMemo(() => snap.members.filter((m) => m.left_at === null), [snap.members]);
  const me = memberById.get(user.id) ?? null;

  const nameOf = useCallback(
    (id: UUID | null | undefined) => {
      if (!id) return t('common.nobody');
      if (id === user.id) return t('common.you');
      return memberById.get(id)?.profile.display_name ?? t('activity.someone');
    },
    [memberById, user.id, t],
  );

  const fullNameOf = useCallback((id: UUID | null | undefined) => (id ? (memberById.get(id)?.profile.display_name ?? t('activity.someone')) : t('common.nobody')), [memberById, t]);

  const categoriesOf = useCallback((scope: CategoryScope) => snap.categories.filter((c) => c.scope === scope), [snap.categories]);
  const categoryById = useMemo(() => new Map(snap.categories.map((c) => [c.id, c])), [snap.categories]);

  const money = useCallback((amount: number) => formatMoney(amount, snap.apartment.currency, intl), [snap.apartment.currency, intl]);

  /** Active members in rotation order first, then any other active member. */
  const orderedMembers = useMemo<Member[]>(() => {
    const order = snap.rotation.member_order;
    return [...activeMembers].sort((a, b) => {
      const ia = order.indexOf(a.user_id);
      const ib = order.indexOf(b.user_id);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  }, [activeMembers, snap.rotation.member_order]);

  return {
    snap,
    userId: user.id,
    me,
    isOwner: me?.role === 'owner',
    mode,
    online,
    fromCache,
    /** Writes are possible (online, or demo mode which is local). */
    canWrite: mode === 'demo' || (online && !fromCache),
    run,
    memberById,
    activeMembers,
    orderedMembers,
    nameOf,
    fullNameOf,
    categoriesOf,
    categoryById,
    money,
    intl,
  };
}

export type Household = ReturnType<typeof useHousehold>;
