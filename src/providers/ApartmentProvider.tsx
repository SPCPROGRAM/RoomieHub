import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { startOfWeek, todayISO } from '@/domain/dates';
import { generateWeekAssignments } from '@/domain/rotation';
import type { Apartment, Snapshot, UUID } from '@/domain/types';
import { useOnline } from '@/hooks/useOnline';
import { OfflineError } from '@/services/errors';
import type { Repository } from '@/services/repository';
import { loadSnapshot as loadCached, saveSnapshot } from '@/services/snapshotCache';
import { useAuth } from './AuthProvider';
import { useToast } from './ToastProvider';

export type RunResult<T> = { ok: true; value: T } | { ok: false };

type Status = 'idle' | 'loading' | 'ready' | 'error';

interface ApartmentState {
  apartments: Apartment[];
  apartmentsLoaded: boolean;
  apartmentId: UUID | null;
  selectApartment: (id: UUID) => void;
  reloadApartments: () => Promise<Apartment[]>;
  snapshot: Snapshot | null;
  status: Status;
  /** The snapshot shown comes from the offline cache, not from the server. */
  fromCache: boolean;
  online: boolean;
  refresh: () => Promise<void>;
  /**
   * Run a write against the backend. Refuses when offline (nothing is queued or shown as
   * saved), reports errors as toasts, and reloads the snapshot after the server confirms.
   * Resolves to { ok: true, value } once the server confirmed, or { ok: false }.
   */
  run: <T>(fn: (repo: Repository) => Promise<T>, opts?: { success?: string; silent?: boolean }) => Promise<RunResult<T>>;
}

const ApartmentContext = createContext<ApartmentState | null>(null);

const selectedKey = (userId: UUID) => `rh.apt.${userId}`;

export function ApartmentProvider({ children }: { children: ReactNode }) {
  const { repo, user } = useAuth();
  const toast = useToast();
  const online = useOnline();
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [apartmentsLoaded, setApartmentsLoaded] = useState(false);
  const [apartmentId, setApartmentId] = useState<UUID | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [fromCache, setFromCache] = useState(false);
  const generatedFor = useRef(new Set<string>());
  const loadSeq = useRef(0);

  // ------------------------------------------------------------ apartments of the user
  const reloadApartments = useCallback(async () => {
    if (!user) return [];
    try {
      const list = await repo.listMyApartments(user.id);
      setApartments(list);
      setApartmentsLoaded(true);
      setApartmentId((current) => {
        if (current && list.some((a) => a.id === current)) return current;
        const saved = localStorage.getItem(selectedKey(user.id));
        return list.find((a) => a.id === saved)?.id ?? list[0]?.id ?? null;
      });
      return list;
    } catch {
      // offline: fall back to the last apartment we know about
      const saved = localStorage.getItem(selectedKey(user.id));
      const cached = saved ? loadCached(user.id, saved) : null;
      if (cached) {
        setApartments([cached.apartment]);
        setApartmentId(cached.apartment.id);
      }
      setApartmentsLoaded(true);
      return cached ? [cached.apartment] : [];
    }
  }, [repo, user]);

  useEffect(() => {
    setApartments([]);
    setApartmentsLoaded(false);
    setApartmentId(null);
    setSnapshot(null);
    setStatus('idle');
    generatedFor.current.clear();
    if (user) void reloadApartments();
  }, [user, repo, reloadApartments]);

  const selectApartment = useCallback(
    (id: UUID) => {
      if (user) localStorage.setItem(selectedKey(user.id), id);
      setSnapshot(null);
      setApartmentId(id);
    },
    [user],
  );

  // ------------------------------------------------------------ snapshot
  const ensureCurrentWeek = useCallback(
    async (snap: Snapshot): Promise<boolean> => {
      if (!snap.rotation.auto_generate) return false;
      const week = startOfWeek(todayISO());
      const key = `${snap.apartment.id}#${week}`;
      if (generatedFor.current.has(key)) return false;
      generatedFor.current.add(key);
      const activeIds = new Set(snap.members.filter((m) => m.left_at === null).map((m) => m.user_id));
      const rows = generateWeekAssignments({
        apartmentId: snap.apartment.id,
        weekStart: week,
        chores: snap.chores,
        rotation: { ...snap.rotation, member_order: snap.rotation.member_order.filter((id) => activeIds.has(id)) },
        existing: snap.assignments,
      });
      if (rows.length === 0) return false;
      try {
        await repo.insertAssignments(rows);
        await repo.updateRotation(snap.apartment.id, { last_generated_week: week });
        return true;
      } catch {
        return false; // another roomie may have generated it first; the next refresh shows it
      }
    },
    [repo],
  );

  const refresh = useCallback(async () => {
    if (!user || !apartmentId) return;
    const seq = ++loadSeq.current;
    setStatus((s) => (s === 'ready' ? s : 'loading'));
    try {
      let snap = await repo.loadSnapshot(apartmentId);
      if (await ensureCurrentWeek(snap)) snap = await repo.loadSnapshot(apartmentId);
      if (seq !== loadSeq.current) return;
      setSnapshot(snap);
      setFromCache(false);
      setStatus('ready');
      if (repo.mode === 'supabase') saveSnapshot(user.id, snap);
    } catch {
      if (seq !== loadSeq.current) return;
      const cached = repo.mode === 'supabase' ? loadCached(user.id, apartmentId) : null;
      if (cached) {
        setSnapshot(cached);
        setFromCache(true);
        setStatus('ready');
      } else {
        setStatus('error');
      }
    }
  }, [repo, user, apartmentId, ensureCurrentWeek]);

  useEffect(() => {
    if (apartmentId) void refresh();
  }, [apartmentId, refresh]);

  // reload when connectivity returns
  useEffect(() => {
    if (online && fromCache) void refresh();
  }, [online, fromCache, refresh]);

  // realtime changes from the other roomies (debounced)
  useEffect(() => {
    if (!apartmentId || !user) return;
    let timer: number | undefined;
    const unsubscribe = repo.subscribe(apartmentId, () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void refresh(), 400);
    });
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [repo, apartmentId, user, refresh]);

  const run = useCallback<ApartmentState['run']>(
    async (fn, opts) => {
      if (repo.mode === 'supabase' && !navigator.onLine) {
        toast.error(new OfflineError());
        return { ok: false };
      }
      try {
        const result = await fn(repo);
        await refresh();
        if (opts?.success) toast.success(opts.success);
        return { ok: true, value: result };
      } catch (e) {
        if (!opts?.silent) toast.error(e);
        return { ok: false };
      }
    },
    [repo, refresh, toast],
  );

  const value = useMemo<ApartmentState>(
    () => ({ apartments, apartmentsLoaded, apartmentId, selectApartment, reloadApartments, snapshot, status, fromCache, online, refresh, run }),
    [apartments, apartmentsLoaded, apartmentId, selectApartment, reloadApartments, snapshot, status, fromCache, online, refresh, run],
  );
  return <ApartmentContext.Provider value={value}>{children}</ApartmentContext.Provider>;
}

export function useApartment(): ApartmentState {
  const ctx = useContext(ApartmentContext);
  if (!ctx) throw new Error('useApartment must be used inside <ApartmentProvider>');
  return ctx;
}
