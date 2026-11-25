import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { Alert } from '@/components/ui/Feedback';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { FullScreenLoader } from '@/router/guards';
import { useApartment } from '@/providers/ApartmentProvider';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { JoinForm } from './JoinForm';

/** /join/:code — invitation link. Guests are asked to sign in first; the code is kept meanwhile. */
export function JoinPage() {
  const { t } = useTranslation();
  const { code = '' } = useParams();
  const { user, initializing } = useAuth();
  const { reloadApartments, selectApartment } = useApartment();
  const toast = useToast();
  const navigate = useNavigate();
  const normalized = code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);

  useEffect(() => {
    if (normalized) sessionStorage.setItem('rh.pendingJoin', normalized);
  }, [normalized]);

  if (initializing) return <FullScreenLoader />;

  return (
    <AuthLayout title={t('onboarding.joinPageTitle')} subtitle={t('onboarding.joinDescription')}>
      {!user ? (
        <div className="space-y-4">
          <Alert tone="info">{t('onboarding.loginToJoin')}</Alert>
          <div className="grid grid-cols-2 gap-3">
            <Link to="/login" className="inline-flex h-11 items-center justify-center rounded-xl bg-brand-600 text-sm font-medium text-white hover:bg-brand-700">
              {t('auth.login')}
            </Link>
            <Link to="/register" className="inline-flex h-11 items-center justify-center rounded-xl border border-line bg-surface text-sm font-medium hover:bg-sunken">
              {t('auth.register')}
            </Link>
          </div>
        </div>
      ) : (
        <JoinForm
          initialCode={normalized}
          onJoined={async (id) => {
            await reloadApartments();
            selectApartment(id);
            toast.success(t('onboarding.joined'));
            navigate('/', { replace: true });
          }}
        />
      )}
    </AuthLayout>
  );
}
