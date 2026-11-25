import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Home, KeyRound, LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { Logo } from '@/components/brand/Logo';
import { LanguageSwitch, ThemeSwitch } from '@/components/layout/PreferenceControls';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Field, Input, Select } from '@/components/ui/Field';
import { apartmentSchema, type ApartmentValues } from '@/domain/schemas';
import type { UUID } from '@/domain/types';
import { useApartment } from '@/providers/ApartmentProvider';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { toErrorCode } from '@/services/errors';
import { JoinForm } from './JoinForm';

export function OnboardingPage() {
  const { t } = useTranslation();
  const { repo, signOut, profile } = useAuth();
  const { reloadApartments, selectApartment, apartments } = useApartment();
  const toast = useToast();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<ApartmentValues>({ resolver: zodResolver(apartmentSchema), defaultValues: { name: '', currency: 'COP' } });

  const enter = async (id: UUID, message: string) => {
    await reloadApartments();
    selectApartment(id);
    toast.success(message);
    navigate('/', { replace: true });
  };

  const onCreate = handleSubmit(async (v) => {
    setError(null);
    try {
      const id = await repo.createApartment(v.name.trim(), v.currency);
      await enter(id, t('onboarding.created'));
    } catch (e) {
      setError(t(`errors.${toErrorCode(e)}`, { defaultValue: t('errors.generic') }));
    }
  });

  return (
    <div className="min-h-dvh px-5 py-6 sm:px-10">
      <div className="mx-auto flex max-w-4xl items-center justify-between">
        <Logo />
        <div className="flex items-center gap-2">
          <LanguageSwitch />
          <ThemeSwitch className="hidden sm:inline-flex" />
          <Button variant="ghost" size="icon" onClick={() => void signOut()} aria-label={t('nav.signOut')} title={t('nav.signOut')}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="mx-auto mt-12 max-w-4xl">
        <h1 className="text-3xl font-semibold tracking-tight">{profile ? t('dashboard.greeting', { name: profile.display_name }) : t('onboarding.title')}</h1>
        <p className="mt-2 text-muted">{t('onboarding.subtitle')}</p>
        {apartments.length > 0 && (
          <Button variant="ghost" className="mt-3 -ml-3" onClick={() => navigate('/')}>
            {t('common.back')}
          </Button>
        )}
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          <Card>
            <CardHeader icon={<Home className="h-4.5 w-4.5" />} title={t('onboarding.createTitle')} subtitle={t('onboarding.createDescription')} />
            <CardBody>
              <form onSubmit={onCreate} noValidate className="space-y-4">
                {error && <Alert tone="danger">{error}</Alert>}
                <Field label={t('onboarding.apartmentName')} error={formState.errors.name?.message}>
                  {(p) => <Input {...p} placeholder={t('onboarding.apartmentNamePlaceholder')} {...register('name')} />}
                </Field>
                <Field label={t('onboarding.currency')} error={formState.errors.currency?.message}>
                  {(p) => (
                    <Select {...p} {...register('currency')}>
                      <option value="COP">COP — Peso colombiano</option>
                      <option value="USD">USD — US Dollar</option>
                      <option value="EUR">EUR — Euro</option>
                      <option value="MXN">MXN — Peso mexicano</option>
                    </Select>
                  )}
                </Field>
                <Button type="submit" block loading={formState.isSubmitting}>
                  {t('common.create')}
                </Button>
              </form>
            </CardBody>
          </Card>
          <Card>
            <CardHeader icon={<KeyRound className="h-4.5 w-4.5" />} title={t('onboarding.joinTitle')} subtitle={t('onboarding.joinDescription')} />
            <CardBody>
              <JoinForm initialCode={sessionStorage.getItem('rh.pendingJoin') ?? ''} onJoined={(id) => void enter(id, t('onboarding.joined'))} />
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
