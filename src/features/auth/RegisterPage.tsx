import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { MailCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { Field, Input } from '@/components/ui/Field';
import { env } from '@/config/env';
import { registerSchema, type RegisterValues } from '@/domain/schemas';
import { usePreferences } from '@/providers/PreferencesProvider';
import { toErrorCode } from '@/services/errors';
import { SupabaseRepository } from '@/services/supabaseRepository';
import { AuthLayout } from './AuthLayout';

export function RegisterPage() {
  const { t } = useTranslation();
  const { language } = usePreferences();
  const [error, setError] = useState<string | null>(null);
  const [confirmSent, setConfirmSent] = useState(false);
  const { register, handleSubmit, formState } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { displayName: '', email: '', password: '', confirm: '' },
  });

  if (!env.supabaseConfigured) return <Navigate to="/login" replace />;

  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    try {
      const { needsConfirmation } = await new SupabaseRepository().signUp({ email: v.email, password: v.password, displayName: v.displayName.trim(), locale: language });
      if (needsConfirmation) setConfirmSent(true);
      // otherwise the auth listener signs the user in and the guest guard redirects
    } catch (e) {
      setError(t(`errors.${toErrorCode(e)}`, { defaultValue: t('errors.generic') }));
    }
  });

  const footer = (
    <>
      {t('auth.haveAccount')}{' '}
      <Link to="/login" className="font-semibold text-brand-700 hover:underline dark:text-brand-300">
        {t('auth.login')}
      </Link>
    </>
  );

  if (confirmSent) {
    return (
      <AuthLayout title={t('auth.registerTitle')} footer={footer}>
        <Alert tone="success" icon={<MailCheck className="h-4 w-4" />}>
          {t('auth.confirmEmail')}
        </Alert>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={t('auth.registerTitle')} subtitle={t('auth.registerSubtitle')} footer={footer}>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label={t('auth.displayName')} hint={t('auth.displayNameHint')} error={formState.errors.displayName?.message}>
          {(p) => <Input {...p} autoComplete="name" {...register('displayName')} />}
        </Field>
        <Field label={t('auth.email')} error={formState.errors.email?.message}>
          {(p) => <Input {...p} type="email" autoComplete="email" inputMode="email" {...register('email')} />}
        </Field>
        <Field label={t('auth.password')} hint={t('auth.passwordHint')} error={formState.errors.password?.message}>
          {(p) => <Input {...p} type="password" autoComplete="new-password" {...register('password')} />}
        </Field>
        <Field label={t('auth.confirmPassword')} error={formState.errors.confirm?.message}>
          {(p) => <Input {...p} type="password" autoComplete="new-password" {...register('confirm')} />}
        </Field>
        <Button type="submit" size="lg" block loading={formState.isSubmitting}>
          {t('auth.register')}
        </Button>
      </form>
    </AuthLayout>
  );
}
