import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { env } from '@/config/env';
import type { Profile } from '@/domain/types';
import { DemoRepository } from '@/services/demoRepository';
import type { DataMode, Repository, SessionUser } from '@/services/repository';
import { clearSnapshots } from '@/services/snapshotCache';
import { SupabaseRepository } from '@/services/supabaseRepository';

const MODE_KEY = 'rh.mode';

interface AuthState {
  repo: Repository;
  mode: DataMode;
  user: SessionUser | null;
  profile: Profile | null;
  /** True until the initial session check finishes. */
  initializing: boolean;
  /** Set when Supabase reports a password-recovery link was opened. */
  passwordRecovery: boolean;
  enterDemo: (demoUserId: string) => Promise<void>;
  exitDemo: () => Promise<void>;
  resetDemo: () => void;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

function initialMode(): DataMode {
  try {
    if (localStorage.getItem(MODE_KEY) === 'demo' && env.demoEnabled) return 'demo';
  } catch {
    // ignore
  }
  return env.supabaseConfigured ? 'supabase' : 'demo';
}

function makeRepository(mode: DataMode): Repository {
  return mode === 'supabase' ? new SupabaseRepository() : new DemoRepository();
}

export function AuthProvider({ children, repository }: { children: ReactNode; repository?: Repository }) {
  const [mode, setMode] = useState<DataMode>(() => repository?.mode ?? initialMode());
  const [repo, setRepo] = useState<Repository>(() => repository ?? makeRepository(mode));
  const [user, setUser] = useState<SessionUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setInitializing(true);
    repo
      .getSession()
      .then((u) => {
        if (!cancelled) setUser(u);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setInitializing(false);
      });
    const unsubscribe = repo.onAuthChange((u, event) => {
      setUser(u);
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
      if (event === 'SIGNED_OUT') {
        setProfile(null);
        clearSnapshots();
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [repo]);

  const refreshProfile = useCallback(async () => {
    if (!user) return setProfile(null);
    try {
      setProfile(await repo.getProfile(user.id));
    } catch {
      // keep the previous profile (e.g. offline)
    }
  }, [repo, user]);

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  const switchMode = useCallback((next: DataMode) => {
    try {
      if (next === 'demo') localStorage.setItem(MODE_KEY, 'demo');
      else localStorage.removeItem(MODE_KEY);
    } catch {
      // ignore
    }
    setMode(next);
    const r = makeRepository(next);
    setRepo(r);
    return r;
  }, []);

  const enterDemo = useCallback(
    async (demoUserId: string) => {
      const r = (mode === 'demo' ? repo : switchMode('demo')) as DemoRepository;
      r.signInAs(demoUserId);
      setUser(await r.getSession());
    },
    [mode, repo, switchMode],
  );

  const exitDemo = useCallback(async () => {
    if (mode === 'demo') await repo.signOut();
    setUser(null);
    setProfile(null);
    if (env.supabaseConfigured) switchMode('supabase');
  }, [mode, repo, switchMode]);

  const resetDemo = useCallback(() => {
    if (repo instanceof DemoRepository) repo.reset();
  }, [repo]);

  const signOut = useCallback(async () => {
    clearSnapshots();
    if (mode === 'demo') return exitDemo();
    await repo.signOut();
    setUser(null);
    setProfile(null);
  }, [mode, repo, exitDemo]);

  const value = useMemo<AuthState>(
    () => ({ repo, mode, user, profile, initializing, passwordRecovery, enterDemo, exitDemo, resetDemo, signOut, refreshProfile }),
    [repo, mode, user, profile, initializing, passwordRecovery, enterDemo, exitDemo, resetDemo, signOut, refreshProfile],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
