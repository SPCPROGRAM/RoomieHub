import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { EmptyState, Spinner } from '@/components/ui/Feedback';
import { useApartment } from '@/providers/ApartmentProvider';
import { useAuth } from '@/providers/AuthProvider';

export function FullScreenLoader() {
  const { t } = useTranslation();
  return (
    <div className="grid min-h-dvh place-items-center">
      <Spinner label={t('common.loading')} />
    </div>
  );
}

/** Signed-in users only; remembers where they wanted to go. */
export function RequireAuth({ children }: { children?: ReactNode }) {
  const { user, initializing } = useAuth();
  const location = useLocation();
  if (initializing) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return children ?? <Outlet />;
}

/** Signed-out users only (login/register screens). */
export function RequireGuest({ children }: { children?: ReactNode }) {
  const { user, initializing, passwordRecovery } = useAuth();
  const location = useLocation();
  if (initializing) return <FullScreenLoader />;
  if (user && !passwordRecovery) {
    const from = (location.state as { from?: string } | null)?.from;
    const pendingJoin = sessionStorage.getItem('rh.pendingJoin');
    return <Navigate to={pendingJoin ? `/join/${pendingJoin}` : (from ?? '/')} replace />;
  }
  return children ?? <Outlet />;
}

/** Requires an apartment with its data loaded; otherwise sends the user to onboarding. */
export function RequireApartment({ children }: { children?: ReactNode }) {
  const { t } = useTranslation();
  const { apartmentsLoaded, apartmentId, snapshot, status, refresh } = useApartment();
  if (!apartmentsLoaded) return <FullScreenLoader />;
  if (!apartmentId) return <Navigate to="/onboarding" replace />;
  if (status === 'error' && !snapshot) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <EmptyState
          icon={<AlertTriangle className="h-6 w-6" />}
          title={t('errors.loadFailed')}
          action={<Button onClick={() => void refresh()}>{t('common.retry')}</Button>}
        />
      </div>
    );
  }
  if (!snapshot || snapshot.apartment.id !== apartmentId) return <FullScreenLoader />;
  return children ?? <Outlet />;
}
